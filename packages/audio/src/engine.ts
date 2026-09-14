/**
 * The playback engine: one AudioContext, one instrument per track, one
 * scheduler.
 *
 * Structure follows the research recommendations directly:
 *
 *   - A **lookahead scheduler** (100ms window / 25ms interval) reads
 *     `audioContext.currentTime` and schedules ahead. A JS callback's own
 *     latency is never a note's onset time, which is what removes drift.
 *   - **No audio framework.** Plain Web Audio nodes; the timing is ours.
 *   - **Master limiting.** Eight simultaneous voices with resonant filters will
 *     clip, and a compressor is cheaper than carefully budgeting every gain.
 *   - **`setTargetAtTime`/ramps rather than `value =`** throughout the voices,
 *     because assigning `AudioParam.value` produces a discontinuity — an
 *     audible click on every note.
 *
 * Each track holds either a pitched `Voice` or a `DrumVoice`, chosen by the
 * track's `kind`. The engine does not branch per step: both satisfy
 * `Instrument`, and a drum simply ignores the frequency and glide it is passed.
 *
 * Playhead correctness is worth calling out. The scheduler runs ~100ms ahead,
 * so notifying the UI at *schedule* time makes the playhead visibly lead the
 * sound. Steps are therefore queued with their `AudioContext` times and
 * released to the UI only when the audio clock actually reaches them.
 */

import type { DrumType, TrackKind } from '@gr00ve/core';

import { DrumVoice, DRUM_DEFAULTS } from './drums.ts';
import type { Instrument } from './instrument.ts';
import { Scheduler } from './scheduler.ts';
import { collectDueSteps, stepDuration, stepsDueForDisplay, type Cursor, type Tempo } from './timeline.ts';
import { isAudible, trackStep, type Track } from './transport.ts';
import { DEFAULT_VOICE, Voice, midiToFreq, type VoiceParams } from './voice.ts';

/** A track as the engine sees it: transport concerns plus an instrument. */
export interface EngineTrack extends Track {
  readonly kind: TrackKind;
  readonly drum: DrumType;
  /** Melodic parameters, used when `kind` is `'voice'`. */
  readonly voice?: VoiceParams | undefined;
}

export interface EngineState {
  readonly bpm: number;
  readonly stepsPerBeat: number;
  readonly swing: number;
  readonly tracks: readonly EngineTrack[];
}

export interface EngineOptions {
  readonly lookaheadMs?: number;
  readonly intervalMs?: number;
  /**
   * Called when a step actually becomes audible.
   *
   * `globalStep` is the transport's monotonic counter, not a per-track
   * position: with polymeter each track is at a different point in its own
   * loop, so the caller must map it through `trackStep` per track.
   */
  readonly onStep?: (globalStep: number) => void;
}

/** How long to wait before tearing down a swapped-out instrument. */
const SWAP_GRACE_MS = 400;

export class SequencerEngine {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly scheduler: Scheduler;
  private readonly getState: () => EngineState;
  private readonly options: EngineOptions;

  /**
   * Live instruments by track index, each tagged with the spec it was built
   * for. The tag is how a kind or drum change is detected — without it, a track
   * switched from voice to rhythm would keep playing the old sound.
   */
  private readonly instruments = new Map<number, { spec: string; instrument: Instrument }>();

  private cursor: Cursor = { step: 0, time: 0 };
  private uiQueue: readonly { step: number; time: number }[] = [];
  private raf: number | undefined;
  private running = false;
  /** Per track: did the previously scheduled step set the slide flag? */
  private pendingSlide: boolean[] = [];

  constructor(getState: () => EngineState, options: EngineOptions = {}) {
    this.getState = getState;
    this.options = options;
    this.ctx = new AudioContext();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.28;

    // Soft limiter. Eight resonant voices stacked will clip; this makes that
    // dull rather than ugly, and costs nothing.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    this.master.connect(limiter).connect(this.ctx.destination);

    this.scheduler = new Scheduler(this.ctx, (_windowStart, windowEnd) => {
      this.scheduleWindow(windowEnd);
    }, {
      ...(options.lookaheadMs !== undefined ? { lookaheadMs: options.lookaheadMs } : {}),
      ...(options.intervalMs !== undefined ? { intervalMs: options.intervalMs } : {}),
    });
  }

  get context(): AudioContext {
    return this.ctx;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Start playback.
   *
   * Must be called from a user gesture — browsers refuse to start an
   * AudioContext otherwise, and the context will sit suspended with no error.
   */
  async start(): Promise<void> {
    if (this.running) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.running = true;
    // Start slightly ahead so the first step is not already in the past.
    const origin = this.ctx.currentTime + 0.08;
    this.cursor = { step: 0, time: origin };
    this.uiQueue = [];
    this.pendingSlide = [];
    this.master.gain.setTargetAtTime(0.28, this.ctx.currentTime, 0.01);

    this.scheduler.start(origin);
    this.pump();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.scheduler.stop();

    if (this.raf !== undefined) {
      cancelAnimationFrame(this.raf);
      this.raf = undefined;
    }

    const now = this.ctx.currentTime;
    for (const { instrument } of this.instruments.values()) instrument.release(now);

    this.uiQueue = [];
    this.pendingSlide = [];
    this.options.onStep?.(-1);
  }

  dispose(): void {
    this.stop();
    for (const { instrument } of this.instruments.values()) instrument.dispose();
    this.instruments.clear();
    void this.ctx.close();
  }

  /** One lookahead window: schedule everything due before `horizon`. */
  private scheduleWindow(horizon: number): void {
    const state = this.getState();
    const tempo: Tempo = {
      bpm: state.bpm,
      stepsPerBeat: state.stepsPerBeat,
      swing: state.swing,
    };

    const { steps, cursor } = collectDueSteps(this.cursor, tempo, horizon);
    for (const { step, time } of steps) {
      this.scheduleStep(state, tempo, step, time);
      this.uiQueue = [...this.uiQueue, { step, time }];
    }
    this.cursor = cursor;
  }

  private scheduleStep(state: EngineState, tempo: Tempo, globalStep: number, time: number): void {
    const duration = stepDuration(tempo);

    state.tracks.forEach((track, i) => {
      if (!isAudible(state, track)) return;
      if (this.pendingSlide[i] === undefined) this.pendingSlide[i] = false;

      const cell = track.grid[trackStep(track, globalStep)] ?? null;
      const instrument = this.instrumentFor(i, track);

      if (cell === null) {
        // A rest clears the slide flag. On the hardware the flag does not
        // survive a rest, so it must not leak past one here either.
        this.pendingSlide[i] = false;
        return;
      }

      // Consume the *previous* step's flag: slide belongs to the note being
      // glided into, not to the note that carries the flag. A drum reports
      // itself as never sounding, so a slide on a rhythm track is inert
      // without the engine having to special-case it.
      const glide = this.pendingSlide[i] === true && instrument.isSoundingAt(time);

      // A slide ties into the following step, so its gate must not close early.
      const gate = cell.slide ? 1 : Math.max(0.01, cell.gate);
      instrument.noteOn(time, midiToFreq(cell.pitch), gate * duration, cell.accent, glide);

      this.pendingSlide[i] = cell.slide;
    });
  }

  /**
   * The instrument for a track, rebuilt when its kind or drum changes.
   *
   * A swapped-out instrument is released and then torn down on a timer rather
   * than immediately: disconnecting nodes that are still ringing would cut them
   * mid-waveform, which is an audible click on a deliberate user action.
   */
  private instrumentFor(index: number, track: EngineTrack): Instrument {
    const spec = track.kind === 'rhythm' ? `rhythm:${track.drum}` : `voice:${index}`;
    const existing = this.instruments.get(index);
    if (existing && existing.spec === spec) return existing.instrument;

    if (existing) {
      const retired = existing.instrument;
      retired.release(this.ctx.currentTime);
      setTimeout(() => retired.dispose(), SWAP_GRACE_MS);
    }

    const instrument: Instrument = track.kind === 'rhythm'
      ? new DrumVoice(this.ctx, this.master, DRUM_DEFAULTS[track.drum])
      : new Voice(this.ctx, this.master, track.voice ?? DEFAULT_VOICE);

    this.instruments.set(index, { spec, instrument });
    return instrument;
  }

  /** Release due steps to the UI. Runs on rAF, so ~60Hz granularity. */
  private pump = (): void => {
    if (!this.running) return;
    const { due, rest } = stepsDueForDisplay(this.uiQueue, this.ctx.currentTime);
    this.uiQueue = rest;
    const last = due[due.length - 1];
    if (last !== undefined) this.options.onStep?.(last.step);
    this.raf = requestAnimationFrame(this.pump);
  };
}
