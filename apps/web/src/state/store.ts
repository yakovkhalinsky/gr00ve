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
  readonly swing: number;
  readonly playing: boolean;
  readonly playhead: number;
  readonly selected: number;
  readonly root: number;
  readonly scale: ScaleName;
  readonly mix: PitchMix;
  readonly tracks: readonly TrackState[];

  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setPlaying: (playing: boolean) => void;
  setPlayhead: (step: number) => void;
  select: (index: number) => void;
  toggleStep: (trackIndex: number, step: number) => void;
  setTrackLength: (trackIndex: number, length: number) => void;
  toggleMute: (trackIndex: number) => void;
  euclidize: (trackIndex: number, pulses: number, steps: number) => void;
}

function emptyTrack(index: number, scale: ScaleName, root: number): TrackState {
  return {
    id: `track-${index + 1}`,
    name: `Track ${index + 1}`,
    cells: new Array<Step | null>(DEFAULT_STEPS).fill(null),
    length: DEFAULT_STEPS,
    mute: false,
    solo: false,
    // Pitch chosen from the scale so a toggled step is never out of key.
  };
}

/** Build a grid from a Euclidean mask — the rhythmic spine of a track. */
export function euclidCells(pulses: number, steps: number, root: number, scale: ScaleName, rotation = 0): Cells {
  const mask = euclid(pulses, steps, rotation);
  return mask.map((on, i) =>
    on
      ? ({
          pitch: degreeToPitch(root, scale, i % 5),
          velocity: 0.75,
          accent: i % 4 === 0,
          slide: false,
          gate: 0.58,
        } satisfies Step)
      : null,
  );
}

export const useGr00ve = create<Gr00veState>()(
  subscribeWithSelector((set, get) => ({
    bpm: 128,
    swing: 0,
    playing: false,
    playhead: -1,
    selected: 0,
    root: 45,
    scale: 'minorPentatonic',
    mix: DEFAULT_MIX,
    tracks: Array.from({ length: TRACK_COUNT }, (_, i) => emptyTrack(i, 'minorPentatonic', 45)),

    setBpm: (bpm) => set({ bpm: Math.max(20, Math.min(300, bpm)) }),
    setSwing: (swing) => set({ swing: Math.max(0, Math.min(0.9, swing)) }),
    setPlaying: (playing) => set({ playing }),
    setPlayhead: (playhead) => set({ playhead }),
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
