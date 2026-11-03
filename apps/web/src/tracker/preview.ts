/**
 * Preview playback for the Tracker export page.
 *
 * This deliberately does **not** use `SequencerEngine`. That engine is the live
 * app's instrument: a `StepGrid` of pitched/percussive cells, per-track loop
 * lengths, and no notion of a pattern *pass*. This page needs the opposite of
 * the last one — Chance is a per-pass decision, and roll and micro-move are
 * per-step effects that would have to be baked into the grid, destroying the
 * very values the page is about to export.
 *
 * What it *does* reuse is the part worth reusing: `@gr00ve/audio`'s lookahead
 * `Scheduler`, its step→time arithmetic (`collectDueSteps`, `stepDuration`) and
 * its 303-ish `Voice`. The scheduling is not duplicated; only the decision of
 * what to schedule is.
 *
 * Fidelity limits, stated rather than hidden:
 *   - Every track uses the same synth voice, not the instrument slot it will
 *     use on the Tracker. The page is for hearing the notes and the rhythm.
 *   - Velocity is approximated as accent (≥85 is accented). The local `Voice`
 *     has no per-note velocity parameter.
 *   - Roll types are played as evenly spaced repeats; the volume/note ramps the
 *     device applies to the non-constant roll types are not simulated.
 */

import {
  DEFAULT_VOICE, Scheduler, Voice, collectDueSteps, midiToFreq, stepDuration,
  stepsDueForDisplay, type Cursor, type Tempo, type VoiceParams,
} from '@gr00ve/audio';
import { chanceFires, type GeneratedPattern } from '@gr00ve/tracker';

export interface PreviewSnapshot {
  readonly pattern: GeneratedPattern;
  readonly bpm: number;
  readonly swing: number;
}

/** Repeats per step for the device's roll divisions (index = value % 9). */
const ROLL_REPEATS = [0, 1, 2, 3, 4, 6, 8, 12, 16] as const;

/** A slightly different colour per track, so eight voices are separable. */
function voiceFor(trackIndex: number): VoiceParams {
  const spread = (trackIndex - 3.5) / 3.5; // -1..1
  return {
    ...DEFAULT_VOICE,
    cutoff: DEFAULT_VOICE.cutoff + spread * 320,
    envMod: DEFAULT_VOICE.envMod + spread * 500,
    decay: DEFAULT_VOICE.decay + spread * 0.05,
    level: 0.36,
  };
}

export class TrackerPreview {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly scheduler: Scheduler;
  private readonly voices: Voice[];
  private readonly getSnapshot: () => PreviewSnapshot;
  private readonly onStep: (step: number) => void;

  private cursor: Cursor = { step: 0, time: 0 };
  private uiQueue: { step: number; time: number }[] = [];
  private raf: number | undefined;
  private running = false;

  constructor(getSnapshot: () => PreviewSnapshot, onStep: (step: number) => void) {
    this.getSnapshot = getSnapshot;
    this.onStep = onStep;

    this.ctx = new AudioContext();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    this.master.connect(limiter).connect(this.ctx.destination);

    this.voices = Array.from({ length: 8 }, (_, i) => new Voice(this.ctx, this.master, voiceFor(i)));
    this.scheduler = new Scheduler(this.ctx, (_start, end) => this.scheduleWindow(end));
  }

  get context(): AudioContext {
    return this.ctx;
  }

  /** Start playback. Call from a click: the AudioContext needs the gesture. */
  async start(): Promise<void> {
    if (this.running) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.running = true;
    const origin = this.ctx.currentTime + 0.08;
    this.cursor = { step: 0, time: origin };
    this.uiQueue = [];
    this.master.gain.setTargetAtTime(0.22, this.ctx.currentTime, 0.01);
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
    for (const voice of this.voices) voice.release(now);
    this.uiQueue = [];
    this.onStep(-1);
  }

  dispose(): void {
    this.stop();
    for (const voice of this.voices) voice.dispose();
    void this.ctx.close();
  }

  private scheduleWindow(horizon: number): void {
    const snapshot = this.getSnapshot();
    const tempo: Tempo = { bpm: snapshot.bpm, stepsPerBeat: 4, swing: snapshot.swing };
    const { steps, cursor } = collectDueSteps(this.cursor, tempo, horizon);
    for (const { step, time } of steps) {
      this.scheduleStep(snapshot.pattern, tempo, step, time);
      this.uiQueue.push({ step, time });
    }
    this.cursor = cursor;
  }

  private scheduleStep(
    pattern: GeneratedPattern,
    tempo: Tempo,
    globalStep: number,
    time: number,
  ): void {
    const length = Math.max(1, pattern.length);
    const pass = Math.floor(globalStep / length);
    const position = ((globalStep % length) + length) % length;
    const stepSeconds = stepDuration(tempo);

    for (let trackIndex = 0; trackIndex < pattern.tracks.length; trackIndex++) {
      const track = pattern.tracks[trackIndex];
      const step = track?.steps[position];
      const voice = this.voices[trackIndex];
      if (step === undefined || step === null || voice === undefined) continue;

      // Chance is evaluated per pattern pass, not once at export.
      if (!chanceFires(step.chance, trackIndex, position, pass, pattern.seed)) continue;

      const microDelay = step.micro !== undefined ? (step.micro / 100) * stepSeconds : 0;
      const at = time + microDelay;
      const accent = step.velocity >= 85;
      const freq = midiToFreq(step.pitch);

      if (step.roll !== undefined) {
        const period = step.roll % 9;
        const repeats = ROLL_REPEATS[period] ?? 1;
        const interval = stepSeconds / Math.max(1, repeats);
        for (let r = 0; r < repeats; r++) {
          voice.noteOn(at + r * interval, freq, interval * 0.8, accent);
        }
      } else {
        voice.noteOn(at, freq, stepSeconds * 0.58, accent);
      }
    }
  }

  /** Release due steps to the UI on the audio clock, not the schedule clock. */
  private pump = (): void => {
    if (!this.running) return;
    const { due, rest } = stepsDueForDisplay(this.uiQueue, this.ctx.currentTime);
    this.uiQueue = [...rest];
    const last = due[due.length - 1];
    if (last !== undefined) this.onStep(last.step);
    this.raf = requestAnimationFrame(this.pump);
  };
}
