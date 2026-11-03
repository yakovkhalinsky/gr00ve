/**
 * The generators.
 *
 * Every one takes a seeded `Rng` from `@gr00ve/core` and returns the same
 * shape, so the UI, the tests and the exporter never branch on generator type
 * after this point. The core's own Euclidean, Turing seed, random-walk and RNG
 * primitives are reused directly rather than reimplemented — this module is the
 * Tracker-shaped composition layer, not a second generation engine.
 *
 * One deliberate difference from the live app: the `probability` generator does
 * not thin the grid while generating. It fills the grid and attaches a Chance
 * value to each step, so the Tracker varies the pattern on every pass. Dropping
 * steps here would bake one pass into the file and throw the per-step
 * probability away.
 */

import {
  chance, combineSeed, euclid, makeRng, randInt, randomWalk, seedBits,
  type Rng, type Walk,
} from '@gr00ve/core';

import {
  clampDegree, clampPitchToRange, markovStep, maxDegree, melodicDegrees, pitchForDegree,
} from './pitch.ts';
import {
  type ChanceSettings, type FxSettings, type GeneratedPattern, type GeneratedStep,
  type GeneratedTrack, type GeneratorId, type RollSettings, type TrackConfig,
} from './types.ts';

/** Clamp with no dependency on a DOM or a library. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round and clamp, which is what every UI-originated value needs. */
export function clampInt(value: number, min: number, max: number): number {
  return clamp(Math.round(Number.isFinite(value) ? value : min), min, max);
}

/**
 * Keep at most two FX enabled, in the order the exporter will write them.
 *
 * The Tracker has two FX slots per step and this is the honest consequence: a
 * fourth toggle is not a control, it is a promise the file format cannot keep.
 * The probability generator's Chance is structural — without it the generator
 * has no per-step probability at all — so it is forced on rather than silently
 * dropped.
 */
export function normaliseFxSettings(fx: FxSettings, generator: GeneratorId): FxSettings {
  const order: readonly (keyof FxSettings)[] = ['chance', 'roll', 'micro', 'velocity'];
  const wanted: FxSettings = generator === 'probability' ? { ...fx, chance: true } : fx;
  const kept = new Set(order.filter((key) => wanted[key]).slice(0, 2));
  return {
    chance: kept.has('chance') || generator === 'probability',
    roll: kept.has('roll'),
    micro: kept.has('micro'),
    velocity: kept.has('velocity'),
  };
}

/** Normalise a track's FX without touching anything else. */
export function normaliseTrackConfig(config: TrackConfig): TrackConfig {
  return { ...config, fx: normaliseFxSettings(config.fx, config.generator) };
}

/**
 * Widest roll division a given roll type can encode inside tracker-lib's
 * documented 0–47 range.
 *
 * The device's encoding is `type × 9 + division`, and tracker-lib caps the
 * stored value at 47. The random-note type (5) therefore only has room for
 * 1/1 and 1/2; the UI must not offer 1/16 for it and then write something else.
 */
export function maxRollDivision(type: number): number {
  return Math.max(1, Math.min(8, 47 - clampInt(type, 0, 5) * 9));
}

/**
 * Encode a roll setting the way the device reads it.
 *
 * Tracker CE decodes `value % 9` as the division and `value / 9` as the type
 * (`core/source/mtSequencer.cpp:3220-3223`), while tracker-lib documents the
 * stored range as 0–47 (`src/types/patterns.ts:288`).
 */
export function rollValue(roll: RollSettings): number {
  const type = clampInt(roll.type, 0, 5);
  const division = clampInt(roll.division, 1, maxRollDivision(type));
  return type * 9 + division;
}

/** Seed a fresh shift register for one track. */
export function seedTuringBits(length: number, seed: number, trackIndex = 0): boolean[] {
  const rng = makeRng(combineSeed(seed, trackIndex, 0x51ed270b));
  return seedBits(clampInt(length, 1, 128), rng);
}

/**
 * One mutation pass over a shift register.
 *
 * Mutation is applied to the loop that is written back, not to the bits being
 * read, so the pattern you hear is the loop you had; the change lands next
 * time. That is the Turing Machine's behaviour and the reason `mutate` is an
 * *evolve* action rather than a re-roll.
 */
export function mutateTuringBits(
  bits: readonly boolean[],
  mutation: number,
  seed: number,
  trackIndex = 0,
  epoch = 0,
): boolean[] {
  const rng = makeRng(combineSeed(seed, trackIndex, epoch, 0x9e3779b9));
  const p = clamp(mutation, 0, 1);
  return bits.map((bit) => (chance(rng, p) ? !bit : bit));
}

/** The per-step chance value for a non-probability generator. */
function drawChance(settings: ChanceSettings, rng: Rng): number {
  return clampInt(settings.base + (rng() * 2 - 1) * settings.spread, 0, 100);
}

/** Add velocity, chance, roll and micro-move to a generator's bare onsets. */
function decorate(
  steps: readonly (GeneratedStep | null)[],
  config: TrackConfig,
  rng: Rng,
): (GeneratedStep | null)[] {
  return steps.map((step) => {
    if (step === null) return null;

    const velocity = clampInt(
      config.velocity.base + (rng() * 2 - 1) * config.velocity.spread,
      0,
      100,
    );

    // The probability generator owns its chance values; for every other
    // generator Chance comes from this track's global-ish setting.
    const chanceValue = step.chance ?? (config.fx.chance ? drawChance(config.chance, rng) : undefined);
    const roll = config.fx.roll && chance(rng, config.roll.probability)
      ? rollValue(config.roll)
      : undefined;
    const micro = config.fx.micro && config.micro.amount > 0 && chance(rng, config.micro.probability)
      ? clampInt(config.micro.amount, 1, 100)
      : undefined;

    return {
      ...step,
      velocity,
      ...(chanceValue !== undefined ? { chance: chanceValue } : {}),
      ...(roll !== undefined ? { roll } : {}),
      ...(micro !== undefined ? { micro } : {}),
    };
  });
}

/** Euclidean rhythm, with a melodic line carrying the pitches. */
function euclidSteps(config: TrackConfig, length: number, rng: Rng): (GeneratedStep | null)[] {
  const cycle = clampInt(config.euclid.steps, 1, length);
  const hits = clampInt(config.euclid.hits, 0, cycle);
  const rotation = clampInt(config.euclid.rotation, 0, cycle - 1);
  const mask = euclid(hits, cycle, rotation);
  const degrees = melodicDegrees(rng, config.scale, 2, length);

  return Array.from({ length }, (_, i) => {
    if (mask[i % cycle] !== true) return null;
    return {
      pitch: pitchForDegree(config.root, config.scale, degrees[i] ?? 0, 2),
      velocity: 100,
    };
  });
}

/**
 * Per-step probability: every step is written, each with its own Chance value.
 *
 * The value is drawn per step around `density`, which is what "per-step"
 * means — a single global probability would be a different (and less useful)
 * control, because the interesting result is a loop where some steps are
 * nearly certain and others are rare.
 */
function probabilitySteps(config: TrackConfig, length: number, rng: Rng): (GeneratedStep | null)[] {
  const degrees = melodicDegrees(rng, config.scale, 2, length);
  return Array.from({ length }, (_, i) => ({
    pitch: pitchForDegree(config.root, config.scale, degrees[i] ?? 0, 2),
    velocity: 100,
    chance: clampInt(
      config.probability.density + (rng() * 2 - 1) * config.probability.spread,
      0,
      100,
    ),
  }));
}

/** Tile a shift register across the pattern, mapping bits to two degrees. */
function turingSteps(
  config: TrackConfig,
  length: number,
  rng: Rng,
  bits: readonly boolean[],
): (GeneratedStep | null)[] {
  const loop = bits.length > 0 ? bits : seedBits(clampInt(config.turing.length, 1, length), rng);
  const low = clampDegree(config.turing.lowDegree, config.scale, 2);
  const high = clampDegree(config.turing.highDegree, config.scale, 2);

  return Array.from({ length }, (_, i) => {
    if (chance(rng, clamp(config.turing.rest, 0, 1))) return null;
    const bit = loop[i % loop.length] === true;
    return {
      pitch: pitchForDegree(config.root, config.scale, bit ? high : low, 2),
      velocity: 100,
    };
  });
}

/** Mean-reverting walk, clamped into the configured register. */
function walkSteps(config: TrackConfig, length: number, rng: Rng): (GeneratedStep | null)[] {
  const range = clampInt(config.walk.range, 1, 3);
  const max = maxDegree(config.scale, range);
  const center = Math.floor(max / 2);
  const cfg: Walk = {
    root: config.root,
    scale: config.scale,
    center,
    maxStep: clampInt(config.walk.stepSize, 1, 6),
    gravity: clamp(config.walk.gravity, 0, 1),
    bias: clamp(config.walk.bias, -1, 1),
    restProbability: clamp(config.walk.rest, 0, 1),
    gate: 0.58,
  };

  const { grid } = randomWalk(cfg, length, rng);
  return grid.map((step) => step === null
    ? null
    : {
        pitch: clampPitchToRange(step.pitch, config.root, config.scale, range),
        velocity: 100,
      });
}

/** First-order Markov chain over scale degrees. */
function markovSteps(config: TrackConfig, length: number, rng: Rng): (GeneratedStep | null)[] {
  const range = clampInt(config.markov.range, 1, 3);
  const max = maxDegree(config.scale, range);
  let degree = randInt(rng, max + 1);

  return Array.from({ length }, () => {
    if (chance(rng, clamp(config.markov.rest, 0, 1))) return null;
    degree = markovStep(rng, degree, config.scale, range, clamp(config.markov.leap, 0, 1));
    return {
      pitch: pitchForDegree(config.root, config.scale, degree, range),
      velocity: 100,
    };
  });
}

/** Generate one track. */
export function generateTrack(
  rawConfig: TrackConfig,
  length: number,
  seed: number,
  trackIndex: number,
  bits?: readonly boolean[] | undefined,
): GeneratedTrack {
  const config = normaliseTrackConfig(rawConfig);
  const rng = makeRng(combineSeed(seed >>> 0, trackIndex, 0x9e3779b9));

  let steps: (GeneratedStep | null)[];
  let turingBits: boolean[] = [];

  switch (config.generator) {
    case 'euclid':
      steps = euclidSteps(config, length, rng);
      break;
    case 'probability':
      steps = probabilitySteps(config, length, rng);
      break;
    case 'turing':
      turingBits = bits !== undefined && bits.length > 0
        ? [...bits]
        : seedBits(clampInt(config.turing.length, 1, length), rng);
      steps = turingSteps(config, length, rng, turingBits);
      break;
    case 'walk':
      steps = walkSteps(config, length, rng);
      break;
    case 'markov':
      steps = markovSteps(config, length, rng);
      break;
  }

  return {
    config,
    steps: decorate(steps, config, rng),
    turingBits,
  };
}

/**
 * Generate all eight tracks.
 *
 * Each track gets its own RNG, derived from the pattern seed and the track
 * index, so editing one track's parameters cannot change another track's notes.
 * That property is not obvious from a shared RNG and it is worth the extra
 * `combineSeed`: a performer expects a bassline to stay put while they tweak
 * the lead.
 */
export function generatePattern(
  tracks: readonly TrackConfig[],
  length: number,
  seed: number,
  turingBits?: readonly (readonly boolean[])[] | undefined,
): GeneratedPattern {
  const len = clampInt(length, 1, 128);
  const s = seed >>> 0;
  return {
    length: len,
    seed: s,
    tracks: tracks.map((track, i) => generateTrack(track, len, s, i, turingBits?.[i])),
  };
}
