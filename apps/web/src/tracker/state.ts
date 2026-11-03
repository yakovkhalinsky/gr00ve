/**
 * State for the Tracker export page.
 *
 * Same shape as the live app's store — Zustand outside React — for the same
 * reason: the page re-renders a large grid, and the preview reads state through
 * a closure rather than through props, so a parameter edit reaches the next
 * scheduled step without a render storm.
 *
 * The important invariant is that `generated` is always a pure function of
 * `tracks`, `patternLength`, `seed` and `turingBits`. Every action that changes
 * one of those rebuilds it in the same `set` call, so the grid, the preview and
 * the exported file can never disagree about what the pattern is.
 */

import { create } from 'zustand';

import type { ScaleName } from '@gr00ve/core';
import type { GeneratedPattern, GeneratorId, TrackConfig } from '@gr00ve/tracker';
import {
  PATTERN_LENGTHS, clampInt, defaultTrackConfigs, generatePattern, maxRollDivision, mtpFileName,
  mutateTuringBits, normaliseFxSettings, normaliseTrackConfig, seedTuringBits, writeMtp,
  type ChanceSettings, type EuclidParams, type FxSettings, type MarkovParams, type MicroSettings,
  type ProbabilityParams, type RollSettings, type TuringParams, type VelocitySettings, type WalkParams,
} from '@gr00ve/tracker';

export const TRACK_COUNT = 8;
export const DEFAULT_PATTERN_LENGTH = 32;
export const INITIAL_SEED = 20261103;

/** A deep partial of a track, for the editor's controls. */
export interface TrackPatch {
  readonly name?: string;
  readonly instrument?: number;
  readonly root?: number;
  readonly scale?: ScaleName;
  readonly generator?: GeneratorId;
  readonly euclid?: Partial<EuclidParams>;
  readonly probability?: Partial<ProbabilityParams>;
  readonly turing?: Partial<TuringParams>;
  readonly walk?: Partial<WalkParams>;
  readonly markov?: Partial<MarkovParams>;
  readonly fx?: Partial<FxSettings>;
  readonly velocity?: Partial<VelocitySettings>;
  readonly roll?: Partial<RollSettings>;
  readonly micro?: Partial<MicroSettings>;
  readonly chance?: Partial<ChanceSettings>;
}

interface Snapshot {
  seed: number;
  mutationEpoch: number;
  patternLength: number;
  bpm: number;
  swing: number;
  tracks: TrackConfig[];
  turingBits: boolean[][];
  generated: GeneratedPattern;
  selected: number;
  playhead: number;
  patternNumber: number;
  exportStatus: string | null;
}

export interface TrackerState extends Snapshot {
  setSeed: (seed: number) => void;
  setPatternLength: (length: number) => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setPatternNumber: (index: number) => void;
  setSelected: (index: number) => void;
  setPlayhead: (step: number) => void;
  regenerate: () => void;
  mutateSelected: () => void;
  lockSelected: () => void;
  updateTrack: (index: number, patch: TrackPatch) => void;
  setGenerator: (index: number, generator: GeneratorId) => void;
  setFx: (index: number, key: keyof FxSettings, on: boolean) => void;
  exportMtp: () => Promise<void>;
}

/** The initial rack and generated pattern, as a plain snapshot. */
export function initialTrackerSnapshot(): Snapshot {
  const tracks = defaultTrackConfigs();
  const turingBits = tracks.map((track, i) => seedTuringBits(track.turing.length, INITIAL_SEED, i));
  const generated = generatePattern(tracks, DEFAULT_PATTERN_LENGTH, INITIAL_SEED, turingBits);
  return {
    seed: INITIAL_SEED,
    mutationEpoch: 0,
    patternLength: DEFAULT_PATTERN_LENGTH,
    bpm: 128,
    swing: 0,
    tracks,
    turingBits,
    generated,
    selected: 0,
    playhead: -1,
    patternNumber: 1,
    exportStatus: null,
  };
}

interface BuildInput {
  readonly tracks: readonly TrackConfig[];
  readonly patternLength: number;
  readonly seed: number;
  readonly turingBits: readonly (readonly boolean[])[];
}

/**
 * Rebuild the pattern and keep the Turing registers in step with it.
 *
 * A Turing track's returned register is authoritative: if it was empty before
 * generation (a fresh track, or one just switched to Turing), `generateTrack`
 * seeds it, and the store has to capture that or the next mutation would start
 * from nothing.
 */
function build(input: BuildInput): { generated: GeneratedPattern; turingBits: boolean[][] } {
  const generated = generatePattern(
    input.tracks,
    input.patternLength,
    input.seed,
    input.turingBits,
  );
  const turingBits = generated.tracks.map((track, i) =>
    track.config.generator === 'turing'
      ? [...track.turingBits]
      : [...(input.turingBits[i] ?? [])]);
  return { generated, turingBits };
}

/** Apply a track change and rebuild in one step. */
function withTrack(
  state: TrackerState,
  index: number,
  track: TrackConfig,
  bits?: boolean[][],
): Partial<TrackerState> {
  const tracks = state.tracks.map((t, i) => (i === index ? track : t));
  const turingBits = bits ?? state.turingBits;
  return { tracks, ...build({
    tracks,
    patternLength: state.patternLength,
    seed: state.seed,
    turingBits,
  }) };
}

const FX_LOW_PRIORITY: readonly (keyof FxSettings)[] = ['velocity', 'micro', 'roll', 'chance'];

export const useTracker = create<TrackerState>()((set, get) => ({
  ...initialTrackerSnapshot(),

  setSeed: (seed) => set((state) => {
    const next = Math.max(0, Math.round(Number.isFinite(seed) ? seed : 0)) >>> 0;
    const turingBits = state.tracks.map((track, i) => seedTuringBits(track.turing.length, next, i));
    return {
      seed: next,
      mutationEpoch: 0,
      ...build({
        tracks: state.tracks,
        patternLength: state.patternLength,
        seed: next,
        turingBits,
      }),
    };
  }),

  setPatternLength: (length) => set((state) => {
    const next = PATTERN_LENGTHS.includes(length as (typeof PATTERN_LENGTHS)[number])
      ? length
      : DEFAULT_PATTERN_LENGTH;
    const tracks = state.tracks.map((track) => ({
      ...track,
      turing: { ...track.turing, length: Math.min(track.turing.length, next) },
    }));
    const turingBits = state.turingBits.map((bits, i) => {
      const loopLength = tracks[i]?.turing.length ?? next;
      return bits.length > next ? seedTuringBits(loopLength, state.seed, i) : bits;
    });
    return {
      patternLength: next,
      ...build({
        tracks,
        patternLength: next,
        seed: state.seed,
        turingBits,
      }),
    };
  }),

  setBpm: (bpm) => set({ bpm: clampInt(bpm, 20, 300) }),
  setSwing: (swing) => set({ swing: Math.max(0, Math.min(0.9, Number.isFinite(swing) ? swing : 0)) }),
  setPatternNumber: (index) => set({ patternNumber: clampInt(index, 1, 255) }),
  setSelected: (selected) => set({ selected: clampInt(selected, 0, TRACK_COUNT - 1) }),
  setPlayhead: (playhead) => set({ playhead: Math.round(playhead) }),

  regenerate: () => set((state) => {
    const seed = (state.seed + 1) >>> 0;
    const epoch = state.mutationEpoch + 1;
    const turingBits = state.turingBits.map((bits, i) => {
      const track = state.tracks[i];
      if (track?.generator !== 'turing') return bits;
      return mutateTuringBits(bits, track.turing.mutation, seed, i, epoch);
    });
    return {
      seed,
      mutationEpoch: epoch,
      ...build({ tracks: state.tracks, patternLength: state.patternLength, seed, turingBits }),
    };
  }),

  mutateSelected: () => set((state) => {
    const track = state.tracks[state.selected];
    if (track === undefined || track.generator !== 'turing') return {};
    const epoch = state.mutationEpoch + 1;
    const next = mutateTuringBits(
      state.turingBits[state.selected] ?? [],
      track.turing.mutation,
      state.seed,
      state.selected,
      epoch,
    );
    const turingBits = state.turingBits.map((bits, i) => (i === state.selected ? next : bits));
    return {
      mutationEpoch: epoch,
      ...build({ tracks: state.tracks, patternLength: state.patternLength, seed: state.seed, turingBits }),
    };
  }),

  lockSelected: () => set((state) => {
    const track = state.tracks[state.selected];
    if (track === undefined || track.generator !== 'turing') return {};
    return withTrack(state, state.selected, normaliseTrackConfig({
      ...track,
      turing: { ...track.turing, mutation: 0 },
    }));
  }),

  setGenerator: (index, generator) => {
    get().updateTrack(index, { generator });
  },

  updateTrack: (index, patch) => set((state) => {
    const current = state.tracks[index];
    if (current === undefined) return {};

    const next = normaliseTrackConfig({
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.instrument !== undefined ? { instrument: clampInt(patch.instrument, 0, 47) } : {}),
      ...(patch.root !== undefined ? { root: clampInt(patch.root, 0, 127) } : {}),
      ...(patch.scale !== undefined ? { scale: patch.scale } : {}),
      ...(patch.generator !== undefined ? { generator: patch.generator } : {}),
      euclid: patch.euclid ? { ...current.euclid, ...patch.euclid } : current.euclid,
      probability: patch.probability ? { ...current.probability, ...patch.probability } : current.probability,
      turing: patch.turing ? { ...current.turing, ...patch.turing } : current.turing,
      walk: patch.walk ? { ...current.walk, ...patch.walk } : current.walk,
      markov: patch.markov ? { ...current.markov, ...patch.markov } : current.markov,
      fx: patch.fx ? { ...current.fx, ...patch.fx } : current.fx,
      velocity: patch.velocity ? { ...current.velocity, ...patch.velocity } : current.velocity,
      roll: patch.roll ? { ...current.roll, ...patch.roll } : current.roll,
      micro: patch.micro ? { ...current.micro, ...patch.micro } : current.micro,
      chance: patch.chance ? { ...current.chance, ...patch.chance } : current.chance,
    });

    const rollDivision = Math.min(next.roll.division, maxRollDivision(next.roll.type));
    const capped = rollDivision === next.roll.division
      ? next
      : { ...next, roll: { ...next.roll, division: rollDivision } };

    let turingBits = state.turingBits;
    const requestedLength = patch.turing?.length;
    const lengthChanged = requestedLength !== undefined && requestedLength !== current.turing.length;
    const targetLength = clampInt(capped.turing.length, 1, state.patternLength);
    const needsSeed = patch.generator === 'turing' &&
      (state.turingBits[index]?.length ?? 0) !== targetLength;
    if (lengthChanged || needsSeed) {
      turingBits = state.turingBits.map((bits, i) =>
        (i === index ? seedTuringBits(targetLength, state.seed, i) : bits));
    }

    return withTrack(state, index, capped, turingBits);
  }),

  setFx: (index, key, on) => set((state) => {
    const current = state.tracks[index];
    if (current === undefined) return {};

    let fx: FxSettings = { ...current.fx, [key]: on };
    if (on && Object.values(fx).filter(Boolean).length > 2) {
      // The Tracker has two FX slots. Turning a third on drops the lowest
      // priority one rather than silently writing fewer than the UI shows.
      for (const candidate of FX_LOW_PRIORITY) {
        if (candidate !== key && fx[candidate]) {
          fx = { ...fx, [candidate]: false };
          break;
        }
      }
    }
    if (current.generator === 'probability') fx = { ...fx, chance: true };

    const next = normaliseTrackConfig({ ...current, fx: normaliseFxSettings(fx, current.generator) });
    return withTrack(state, index, next);
  }),

  exportMtp: async () => {
    const { generated, patternNumber } = get();
    const filename = mtpFileName(patternNumber);
    try {
      await writeMtp(generated, filename);
      set({ exportStatus: `Downloaded ${filename}` });
    } catch (error) {
      set({
        exportStatus: `Export failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
}));
