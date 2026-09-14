import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  DEFAULT_MIX, DEFAULT_KIT, combineSeed, degreeToPitch, euclid, grid, makeRng, pitchMixer,
  type DrumType, type PitchMix, type ScaleName, type Step, type StepGrid as Cells, type TrackKind,
} from '@gr00ve/core';

/**
 * Application state.
 *
 * Zustand rather than React state, and the reason is specific: a sequencer
 * changes parameters at pointer-event rate (60+ per second while a knob is
 * being dragged), and routing that through React's reconciler is exactly the
 * wrong tool. Zustand's store lives *outside* React, so `subscribeTransient`
 * below can drive an `AudioParam` at pointer rate with **zero renders**.
 *
 * The rule that follows from this: React renders the *shape* of the UI; the
 * store feeds the *values* to the audio thread. Anything high-frequency must
 * take the subscription path, not the render path.
 */

export const TRACK_COUNT = 8;
export const DEFAULT_STEPS = 16;

export interface TrackState {
  readonly id: string;
  readonly name: string;
  readonly cells: Cells;
  /**
   * Loop length in steps, independent of the pattern length.
   *
   * Polymeter is the cheapest source of long-form variation: a 16-step bass
   * against a 12-step arp against a 7-step pad realigns only after lcm = 336
   * steps, which a listener hears as composed rather than looped. Elektron
   * exposes the same thing and its users routinely confuse it with pattern
   * length, so this stays explicit and separate in the UI.
   */
  readonly length: number;
  readonly mute: boolean;
  readonly solo: boolean;
  /**
   * Whether this track plays pitched notes or one percussion sound.
   *
   * On a `'rhythm'` track the steps' `pitch` values are ignored — the track
   * already fixes which drum it plays — but they are preserved rather than
   * cleared, so switching back to `'voice'` restores the melody.
   */
  readonly kind: TrackKind;
  /** Which drum, when `kind` is `'rhythm'`. */
  readonly drum: DrumType;
  /**
   * Semitone offset applied to pitches drawn from the mixer. ±12, ±24.
   *
   * The pitch mixer is global — one set of twelve faders for the whole rack —
   * so without a per-track offset every voice track would generate in the same
   * octave and the result would be mud. Register is the property that makes a
   * shared pitch source usable across eight tracks, and it is a real hardware
   * concept too (track transpose on an Elektron box).
   *
   * Not exposed in the UI yet; seeded per track. Wiring an encoder to it is a
   * small, obvious follow-up.
   */
  readonly register: number;
  /**
   * Euclidean phase offset, in steps.
   *
   * Stored per track rather than re-picked each time, so pressing E preserves
   * where a pattern sits. Without this, re-generating the backbeat snare would
   * silently move it from beats 2 and 4 back to 1 and 3 — E(2,16) is maximally
   * even only at phase 0, so a rotation is the only way to place it.
   *
   * Not exposed in the UI; seeded per track. A rotate control is in the brief's
   * operator catalogue and is the natural way to surface it.
   */
  readonly rotation: number;
}

export interface Gr00veState {
  readonly bpm: number;
  /** Steps per beat. 4 = 16th notes, so a 16-step pattern is one bar of 4/4. */
  readonly stepsPerBeat: number;
  readonly swing: number;
  readonly playing: boolean;
  /**
   * The transport's monotonic step counter, or -1 when stopped.
   *
   * Deliberately *not* called "playhead": with polymeter each track is at a
   * different point in its own loop, so a single playhead index would be wrong
   * for all but one track. Callers map this through `trackStep` per track to
   * get a position within that track's grid.
   */
  readonly globalStep: number;
  readonly selected: number;
  readonly root: number;
  readonly scale: ScaleName;
  readonly mix: PitchMix;
  readonly tracks: readonly TrackState[];

  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setPlaying: (playing: boolean) => void;
  setGlobalStep: (step: number) => void;
  select: (index: number) => void;
  toggleStep: (trackIndex: number, step: number) => void;
  setTrackLength: (trackIndex: number, length: number) => void;
  toggleMute: (trackIndex: number) => void;
  euclidize: (trackIndex: number, pulses: number, steps: number) => void;
  clearTrack: (trackIndex: number) => void;
  setTrackKind: (trackIndex: number, kind: TrackKind) => void;
  setDrum: (trackIndex: number, drum: DrumType) => void;
}

/**
 * Default content.
 *
 * The app ships *playing something* rather than an empty grid, for two reasons.
 * An empty sequencer with a Play button gives no signal about whether playback
 * works — the first click produces silence and reads as broken. And these
 * particular patterns demonstrate the features that are hardest to explain in
 * prose: Euclidean rhythm, polymeter, and the voice/rhythm split.
 *
 * The first four tracks are a kit, because eight identical sawtooth voices was
 * never a groove — the genre research is explicit that rhythm and timbre carry
 * the material that pitch carries elsewhere, and a sequencer that cannot be a
 * drum machine is not an electronic music instrument. The last four are melodic
 * and deliberately polymetric: loop lengths 16, 8, 7 and 13 realign only after
 * lcm = 11648 steps, so the line drifts for hundreds of bars from four stored
 * rows.
 */
interface SeedSpec {
  readonly pulses: number;
  readonly steps: number;
  /** Euclidean phase offset in steps. */
  readonly rotation: number;
  /** Semitone offset applied to the mixer's pitches. */
  readonly register: number;
  readonly kind: TrackKind;
  readonly drum: DrumType;
}

const SEED: readonly SeedSpec[] = [
  // Two melodic tracks: a bass, and a lead whose 7-step loop drifts against
  // the bass's 16 (they realign after lcm(16,7) = 112 steps, about 7 bars).
  { pulses: 4, steps: 16, rotation: 0, register: -12, kind: 'voice', drum: 'kick' },
  { pulses: 4, steps: 7, rotation: 0, register: 0, kind: 'voice', drum: 'kick' },

  // Six percussion tracks, one drum each, in kit order.
  //
  // Two of them use rotation, and it is load-bearing rather than decorative:
  // E(2,16) is maximally even only at phase 0, which puts its onsets on beats
  // 1 and 3. A backbeat needs beats 2 and 4, so rotation is the only way to
  // place it — the pattern's *shape* is fixed, only its phase moves.
  //
  // Register is unused on a rhythm track; drums ignore pitch.
  { pulses: 4, steps: 16, rotation: 0, register: 0, kind: 'rhythm', drum: 'kick' }, // four-on-the-floor
  { pulses: 2, steps: 16, rotation: 4, register: 0, kind: 'rhythm', drum: 'snare' }, // backbeat
  { pulses: 8, steps: 16, rotation: 0, register: 0, kind: 'rhythm', drum: 'hat' }, // eighth notes
  { pulses: 2, steps: 16, rotation: 2, register: 0, kind: 'rhythm', drum: 'clap' }, // offbeat
  // Odd loop lengths, so the percussion drifts against the four-four kit.
  { pulses: 2, steps: 5, rotation: 0, register: 0, kind: 'rhythm', drum: 'tom' },
  { pulses: 3, steps: 7, rotation: 0, register: 0, kind: 'rhythm', drum: 'rim' },
];

/**
 * Build a grid from a Euclidean mask, taking pitches from the **scale itself**
 * rather than from the mixer.
 *
 * This is the degree-based Euclidean melody the brief calls underrated — it
 * yields a Sturmian contour with only two interval sizes, so it is even rather
 * than random. It is **not** what the E button runs: that goes through
 * `generateCells`, so the twelve pitch faders are what decide the notes. Kept
 * exported and tested as an alternative generator, and as the thing to reach
 * for if the mixer ever needs a degree-based counterpart.
 */
export function euclidCells(
  pulses: number,
  steps: number,
  root: number,
  scale: ScaleName,
  opts: { rotation?: number; baseDegree?: number } = {},
): Cells {
  const rotation = opts.rotation ?? 0;
  const baseDegree = opts.baseDegree ?? 0;
  const mask = euclid(pulses, steps, rotation);
  return mask.map((on, i) =>
    on
      ? ({
          // Onsets walk up the scale so a Euclidean mask reads as a melodic
          // figure rather than one repeated note.
          pitch: degreeToPitch(root, scale, baseDegree + (i % 5)),
          velocity: 0.75,
          accent: i % 4 === 0,
          slide: false,
          gate: 0.58,
        } satisfies Step)
      : null,
  );
}

/**
 * Compose a rhythm with a pitch source.
 *
 * **Euclidean answers *when*, the pitch mixer answers *what*.** This is the one
 * place the two meet, so the generate button, the startup seed and any future
 * generator all behave identically — and so there is a single function to look
 * at when the output is wrong.
 *
 * The seed is derived from the *parameters* rather than drawn fresh, which
 * makes generation idempotent: clicking E(5,8) twice gives the same phrase,
 * while moving a pitch fader and clicking again gives a different one (the
 * random stream is identical; a weighted choice against different weights just
 * lands elsewhere). See `combineSeed`.
 */
export function generateCells(opts: {
  readonly pulses: number;
  readonly steps: number;
  /** Phase offset in steps. See `TrackState.rotation`. */
  readonly rotation?: number | undefined;
  readonly seed: number;
  readonly mix: PitchMix;
  readonly root: number;
  readonly scale: ScaleName;
  readonly register: number;
}): Cells {
  const gate = euclid(opts.pulses, opts.steps, opts.rotation ?? 0);
  return pitchMixer(
    // The store's root and scale are the single source of truth; the mix's own
    // copies are overridden so a scale change in the transport bar applies to
    // generation rather than being shadowed by a stale value on the mix.
    { ...opts.mix, root: opts.root + opts.register, scale: opts.scale },
    opts.steps,
    makeRng(opts.seed),
    gate,
  );
}

function seedTrack(index: number, root: number, scale: ScaleName): TrackState {
  const pattern: SeedSpec = SEED[index % SEED.length] ?? {
    pulses: 4, steps: 16, rotation: 0, register: 0, kind: 'voice', drum: 'kick',
  };
  return {
    id: `track-${index + 1}`,
    name: `Track ${index + 1}`,
    cells: generateCells({
      pulses: pattern.pulses,
      steps: pattern.steps,
      rotation: pattern.rotation,
      seed: combineSeed(index, pattern.pulses, pattern.steps),
      mix: DEFAULT_MIX,
      root,
      scale,
      register: pattern.register,
    }),
    // Loop length matches the generated grid, and stays independent of it —
    // editing the length later must not rewrite the pattern.
    length: pattern.steps,
    mute: false,
    solo: false,
    kind: pattern.kind,
    drum: pattern.drum ?? DEFAULT_KIT[index % DEFAULT_KIT.length] ?? 'kick',
    register: pattern.register,
    rotation: pattern.rotation,
  };
}

export const useGr00ve = create<Gr00veState>()(
  subscribeWithSelector((set, get) => ({
    bpm: 128,
    stepsPerBeat: 4,
    swing: 0,
    playing: false,
    globalStep: -1,
    selected: 0,
    root: 45,
    scale: 'minorPentatonic',
    mix: DEFAULT_MIX,
    tracks: Array.from({ length: TRACK_COUNT }, (_, i) => seedTrack(i, 45, 'minorPentatonic')),

    setBpm: (bpm) => set({ bpm: Math.max(20, Math.min(300, bpm)) }),
    setSwing: (swing) => set({ swing: Math.max(0, Math.min(0.9, swing)) }),
    setPlaying: (playing) => set({ playing }),
    setGlobalStep: (globalStep) => set({ globalStep }),
    select: (selected) => set({ selected }),

    toggleStep: (trackIndex, step) => {
      const { tracks, root, scale } = get();
      const track = tracks[trackIndex];
      if (!track) return;
      const cells = [...track.cells];
      const existing = cells[step];
      cells[step] = existing
        ? null
        : {
            pitch: degreeToPitch(root, scale, step % 5),
            velocity: 0.75,
            accent: false,
            slide: false,
            gate: 0.58,
          };
      const next = tracks.map((t, i) => (i === trackIndex ? { ...t, cells } : t));
      set({ tracks: next });
    },

    setTrackLength: (trackIndex, length) => {
      const tracks = get().tracks.map((t, i) =>
        i === trackIndex ? { ...t, length: Math.max(1, Math.min(64, Math.round(length))) } : t,
      );
      set({ tracks });
    },

    toggleMute: (trackIndex) => {
      const tracks = get().tracks.map((t, i) => (i === trackIndex ? { ...t, mute: !t.mute } : t));
      set({ tracks });
    },

    euclidize: (trackIndex, pulses, steps) => {
      const { tracks, root, scale, mix } = get();
      const track = tracks[trackIndex];
      if (!track) return;
      const cells = generateCells({
        pulses,
        steps,
        // Preserved from the track, so re-generating a backbeat keeps it on
        // beats 2 and 4 rather than snapping it back to the even-but-wrong
        // phase 0 the pattern shape alone would give.
        rotation: track.rotation,
        // Seeded from the parameters: idempotent for a given E(k,n), but still
        // responsive to the pitch faders, because the weights changed even
        // though the random stream did not.
        seed: combineSeed(trackIndex, pulses, steps),
        mix,
        root,
        scale,
        register: track.register,
      });
      const next = tracks.map((t, i) => (i === trackIndex ? { ...t, cells, length: steps } : t));
      set({ tracks: next });
    },

    /**
     * Empty a track's steps, keeping its grid length and loop length.
     *
     * The grid array and the loop length are independent — `setTrackLength`
     * changes the loop without touching the array — so this rebuilds at the
     * *array's* length rather than the loop's. Sizing it from `length` instead
     * would silently truncate or pad a track whose two have diverged, turning a
     * "clear the notes" action into a structural edit.
     */
    clearTrack: (trackIndex) => {
      const tracks = get().tracks.map((t, i) =>
        i === trackIndex ? { ...t, cells: new Array<Step | null>(t.cells.length).fill(null) } : t,
      );
      set({ tracks });
    },

    /**
     * Switch a track between pitched and percussive.
     *
     * Only `kind` changes. The steps keep their pitches, so switching a rhythm
     * track back to a voice returns the melody rather than an empty grid — and
     * switching a melodic track to rhythm makes it a drum part of the same
     * rhythm without losing anything.
     */
    setTrackKind: (trackIndex, kind) => {
      const tracks = get().tracks.map((t, i) => (i === trackIndex ? { ...t, kind } : t));
      set({ tracks });
    },

    setDrum: (trackIndex, drum) => {
      const tracks = get().tracks.map((t, i) => (i === trackIndex ? { ...t, drum } : t));
      set({ tracks });
    },
  })),
);

/**
 * Subscribe to a slice of state **without re-rendering**.
 *
 * This is the path for anything that runs at pointer or audio rate. It is the
 * documented mitigation for React's reconciliation cost in an audio UI: the
 * component tree never re-renders, and the value goes straight to an
 * `AudioParam` via `setTargetAtTime` (which also avoids the clicks that direct
 * `value` assignment causes).
 *
 * ```ts
 * subscribeTransient(
 *   (s) => s.tracks[0]?.cells,
 *   (cells) => schedulePattern(0, cells),
 * );
 * ```
 */
export function subscribeTransient<T>(
  selector: (state: Gr00veState) => T,
  listener: (value: T, previous: T) => void,
): () => void {
  return useGr00ve.subscribe(selector, listener);
}

/**
 * Apply a parameter to an AudioParam without a click.
 *
 * `setTargetAtTime` rather than `value =`, because assigning `value` directly
 * produces a discontinuity — an audible click on every knob movement. The time
 * constant is short enough to feel immediate and long enough to smooth.
 */
export function rampParam(param: AudioParam, value: number, ctx: BaseAudioContext, seconds = 0.01): void {
  param.setTargetAtTime(value, ctx.currentTime, seconds);
}
