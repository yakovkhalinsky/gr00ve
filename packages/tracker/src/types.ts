/**
 * The pattern model this package generates and exports.
 *
 * It is deliberately *not* the tracker file format. A generated step is a
 * musical intention — a pitch, a velocity, and optional per-step chances — and
 * the export layer is the only place that knows about Polyend's six-byte step
 * records. Keeping the two apart is what lets the generators be tested without
 * a file, and lets the export be tested without a generator.
 *
 * All values are in the ranges the Tracker documents, so the export layer never
 * has to guess: velocities and effect values are `0..100`, pitches are MIDI
 * `0..127`, and an instrument is a slot number `0..47`.
 */

import type { ScaleName } from '@gr00ve/core';

/** The generator a track runs. Markov is the optional fifth. */
export type GeneratorId = 'euclid' | 'probability' | 'turing' | 'walk' | 'markov';

/** Euclid's three parameters: hits spread over a cycle, then rotated. */
export interface EuclidParams {
  readonly hits: number;
  readonly steps: number;
  readonly rotation: number;
}

/**
 * Per-step probability.
 *
 * Unlike the other generators this one does not drop steps while generating.
 * It fills the grid and gives every step a Chance (`C`) value, so the pattern
 * varies on *every pass* on the device rather than being frozen at export.
 */
export interface ProbabilityParams {
  /** Base probability, 0..100. */
  readonly density: number;
  /** Random spread either side of the base, 0..100. */
  readonly spread: number;
}

/** Shift-register loop: a short bit pattern, tiled, with mutation. */
export interface TuringParams {
  /** Loop length in steps. Odd lengths drift against 4/4. */
  readonly length: number;
  /** Probability a bit flips when the loop is mutated, 0..1. */
  readonly mutation: number;
  /** Low bit's scale degree. */
  readonly lowDegree: number;
  /** High bit's scale degree. */
  readonly highDegree: number;
  /** Probability that a step is a rest, 0..1. */
  readonly rest: number;
}

/** Mean-reverting random walk. */
export interface WalkParams {
  /** Register height in octaves, 1..3. */
  readonly range: number;
  /** Largest move per step, in scale degrees. */
  readonly stepSize: number;
  /** Pull back toward the centre, 0..1. */
  readonly gravity: number;
  /** Upward/downward lean, -1..1. */
  readonly bias: number;
  /** Probability that a step is a rest, 0..1. */
  readonly rest: number;
}

/**
 * First-order Markov chain over scale degrees.
 *
 * The transition distribution is fixed and translation-invariant: small
 * intervals dominate, and `leap` adds a chance of a wider jump. That is enough
 * to demonstrate the idea without pretending to be a trained model.
 */
export interface MarkovParams {
  /** Register height in octaves, 1..3. */
  readonly range: number;
  /** Probability of a leap of 3–5 degrees instead of a step, 0..1. */
  readonly leap: number;
  /** Probability that a step is a rest, 0..1. */
  readonly rest: number;
}

/**
 * Which step effects the export may write.
 *
 * The Tracker allows **two FX per step**, so this is also the packing order:
 * chance, roll, micro-move, velocity. Anything beyond the first two enabled
 * entries is dropped by `normaliseFxSettings` rather than silently overflowing.
 */
export interface FxSettings {
  readonly chance: boolean;
  readonly roll: boolean;
  readonly micro: boolean;
  readonly velocity: boolean;
}

/** Velocity variation applied to every onset. */
export interface VelocitySettings {
  /** Base velocity, 0..100. 100 is the device default, so no FX is written there. */
  readonly base: number;
  /** Random spread either side of the base, 0..100. */
  readonly spread: number;
}

/** Roll / ratchet settings. */
export interface RollSettings {
  /** Probability that an onset gets a roll, 0..1. */
  readonly probability: number;
  /** Roll type: 0 const, 1 volume down, 2 volume up, 3 note down, 4 note up, 5 random. */
  readonly type: number;
  /** Division index: 1 = 1/1, 2 = 1/2, … 8 = 1/16. */
  readonly division: number;
}

/** Micro-timing settings. */
export interface MicroSettings {
  /** Probability that an onset is nudged, 0..1. */
  readonly probability: number;
  /** Nudge amount, 0..100. The device maps it to 1..48 microsteps. */
  readonly amount: number;
}

/** Chance settings for generators other than `probability`. */
export interface ChanceSettings {
  /** Base chance, 0..100. */
  readonly base: number;
  /** Random spread either side of the base, 0..100. */
  readonly spread: number;
}

/** Everything needed to generate one track. */
export interface TrackConfig {
  readonly name: string;
  /** Instrument slot, 0..47 (sample instruments on the Tracker). */
  readonly instrument: number;
  /** MIDI note that scale degree 0 refers to. */
  readonly root: number;
  readonly scale: ScaleName;
  readonly generator: GeneratorId;
  readonly euclid: EuclidParams;
  readonly probability: ProbabilityParams;
  readonly turing: TuringParams;
  readonly walk: WalkParams;
  readonly markov: MarkovParams;
  readonly fx: FxSettings;
  readonly velocity: VelocitySettings;
  readonly roll: RollSettings;
  readonly micro: MicroSettings;
  readonly chance: ChanceSettings;
}

/** One generated step. `null` is a rest. */
export interface GeneratedStep {
  /** MIDI note, 0..127. */
  readonly pitch: number;
  /** Velocity, 0..100. 100 is the device default. */
  readonly velocity: number;
  /** Chance (`C`) value, 0..100. Set by the probability generator always, by others when enabled. */
  readonly chance?: number;
  /** Roll (`R`) value, 1..47. */
  readonly roll?: number;
  /** Micro-move (`m`) value, 1..100. */
  readonly micro?: number;
}

/** A generated track and the generator state worth keeping for the next action. */
export interface GeneratedTrack {
  readonly config: TrackConfig;
  readonly steps: readonly (GeneratedStep | null)[];
  /** Shift-register state after this generation. */
  readonly turingBits: readonly boolean[];
}

/** A complete generated pattern. */
export interface GeneratedPattern {
  readonly length: number;
  readonly seed: number;
  readonly tracks: readonly GeneratedTrack[];
}

/** Pattern lengths the Tracker accepts, in steps. */
export const PATTERN_LENGTHS = [16, 32, 64, 128] as const;
export type PatternLength = (typeof PATTERN_LENGTHS)[number];

/** Sample tracks on a Tracker Mini / Tracker+. The device file also has 8 MIDI tracks. */
export const SAMPLE_TRACKS = 8;

/**
 * Tracks in the `.mtp` file.
 *
 * The Tracker Mini / Tracker+ pattern is 16 tracks wide: 8 sample tracks and 8
 * MIDI tracks (`kSampleTracks = 8`, `kMidiTracks = 8`, `kAllTracks = 16` in
 * tracker-ce `core/source/mtStructs.h:87-90`). We generate the 8 sample tracks
 * and leave the MIDI half empty.
 */
export const FILE_TRACKS = 16;

export const DEFAULT_EUCLID: EuclidParams = { hits: 4, steps: 16, rotation: 0 };
export const DEFAULT_PROBABILITY: ProbabilityParams = { density: 60, spread: 25 };
export const DEFAULT_TURING: TuringParams = {
  length: 8,
  mutation: 0.05,
  lowDegree: 0,
  highDegree: 4,
  rest: 0.1,
};
export const DEFAULT_WALK: WalkParams = {
  range: 2,
  stepSize: 2,
  gravity: 0.2,
  bias: 0.1,
  rest: 0.2,
};
export const DEFAULT_MARKOV: MarkovParams = { range: 2, leap: 0.2, rest: 0.15 };

export const DEFAULT_VELOCITY: VelocitySettings = { base: 80, spread: 20 };
export const DEFAULT_ROLL: RollSettings = { probability: 0.25, type: 0, division: 4 };
export const DEFAULT_MICRO: MicroSettings = { probability: 0.25, amount: 20 };
export const DEFAULT_CHANCE: ChanceSettings = { base: 80, spread: 15 };

/** Roll type labels, in the device's encoding order. */
export const ROLL_TYPE_LABELS = [
  'R · constant',
  'Rv · volume down',
  'RV · volume up',
  'Rn · note down',
  'RN · note up',
  'RR · random note',
] as const;

/** Division labels, indexed by the stored division 1..8. */
export const ROLL_DIVISION_LABELS = ['', '1/1', '1/2', '1/3', '1/4', '1/6', '1/8', '1/12', '1/16'] as const;

interface TrackPreset {
  readonly generator: GeneratorId;
  readonly root: number;
  readonly scale: ScaleName;
}

const PRESETS: readonly TrackPreset[] = [
  { generator: 'euclid', root: 33, scale: 'aeolian' },
  { generator: 'euclid', root: 45, scale: 'aeolian' },
  { generator: 'probability', root: 57, scale: 'dorian' },
  { generator: 'turing', root: 45, scale: 'minorPentatonic' },
  { generator: 'walk', root: 57, scale: 'aeolian' },
  { generator: 'markov', root: 52, scale: 'dorian' },
  { generator: 'euclid', root: 40, scale: 'phrygian' },
  { generator: 'probability', root: 64, scale: 'minorPentatonic' },
];

/**
 * A sensible starting track.
 *
 * The rack ships varied on purpose: eight Euclidean tracks would demonstrate
 * one generator eight times rather than the instrument this page is. Velocity
 * variation is on everywhere, and the probability tracks also carry Chance, so
 * a first export already contains two of the four documented step effects.
 */
export function defaultTrackConfig(index: number): TrackConfig {
  const preset = PRESETS[index % PRESETS.length] ?? PRESETS[0]!;
  const isProbability = preset.generator === 'probability';
  return {
    name: `Track ${index + 1}`,
    instrument: index % 48,
    root: preset.root,
    scale: preset.scale,
    generator: preset.generator,
    euclid: { ...DEFAULT_EUCLID },
    probability: { ...DEFAULT_PROBABILITY },
    turing: { ...DEFAULT_TURING },
    walk: { ...DEFAULT_WALK },
    markov: { ...DEFAULT_MARKOV },
    fx: {
      chance: isProbability,
      roll: false,
      micro: false,
      velocity: true,
    },
    velocity: { ...DEFAULT_VELOCITY },
    roll: { ...DEFAULT_ROLL },
    micro: { ...DEFAULT_MICRO },
    chance: { ...DEFAULT_CHANCE },
  };
}

/** Eight fresh tracks. */
export function defaultTrackConfigs(): TrackConfig[] {
  return Array.from({ length: SAMPLE_TRACKS }, (_, i) => defaultTrackConfig(i));
}
