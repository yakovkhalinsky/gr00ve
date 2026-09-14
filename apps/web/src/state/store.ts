import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  DEFAULT_MIX, euclid, grid, degreeToPitch,
  type PitchMix, type ScaleName, type Step, type StepGrid as Cells,
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
}

/**
 * Default content.
 *
 * The app ships *playing something* rather than an empty grid, for two reasons.
 * An empty sequencer with a Play button gives no signal about whether playback
 * works — the first click produces silence and reads as broken. And these
 * particular patterns demonstrate the two features that are hardest to explain
 * in prose: Euclidean rhythm, and polymeter.
 *
 * The loop lengths are deliberately coprime-ish (16, 16, 8, 5, 16, 7, 13, 16).
 * lcm(16, 8, 5, 7, 13) = 7280 steps, so the eight tracks realign roughly every
 * 455 bars — the pattern evolves instead of looping, from 8 stored rows.
 */
const SEED: readonly { pulses: number; steps: number; degree: number }[] = [
  { pulses: 4, steps: 16, degree: -7 }, // root down an octave: the bass
  { pulses: 5, steps: 16, degree: 0 },
  { pulses: 3, steps: 8, degree: 2 },
  { pulses: 2, steps: 5, degree: 4 },
  { pulses: 7, steps: 16, degree: 5 },
  { pulses: 3, steps: 7, degree: 7 },
  { pulses: 5, steps: 13, degree: 9 },
  { pulses: 6, steps: 16, degree: 12 },
];

/** Build a grid from a Euclidean mask — the rhythmic spine of a track. */
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

function seedTrack(index: number, root: number, scale: ScaleName): TrackState {
  const pattern = SEED[index % SEED.length] ?? { pulses: 4, steps: 16, degree: 0 };
  return {
    id: `track-${index + 1}`,
    name: `Track ${index + 1}`,
    cells: euclidCells(pattern.pulses, pattern.steps, root, scale, { baseDegree: pattern.degree }),
    // Loop length matches the generated grid, and stays independent of it —
    // editing the length later must not rewrite the pattern.
    length: pattern.steps,
    mute: false,
    solo: false,
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
      const { tracks, root, scale } = get();
      const cells = euclidCells(pulses, steps, root, scale);
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
