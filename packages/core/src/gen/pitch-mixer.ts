/**
 * Weighted pitch-class mixer — the meloDICER / SIG model.
 *
 * The research puts this first among *pitch* generators, and the reason is
 * interface-shaped rather than algorithmic: it is twelve faders, one per
 * semitone, each setting how likely that pitch is to be chosen. There is no
 * model, no corpus, no training, and no way for the performer to be surprised
 * by a parameter whose meaning they cannot hear.
 *
 * It also does three jobs with one mechanism — generator, arpeggiator and
 * quantiser — which is exactly what the hardware does: Vermona's meloDICER and
 * the Stochastic Inspiration Generator both use this core, and both add the
 * same three extras that are implemented here: an octave weighting, a rest
 * probability, and a scale to snap into.
 *
 * Pulling a fader to zero removes a pitch entirely, so no separate enable is
 * needed. That is what makes the surface a complete instrument rather than a
 * parameter dump.
 */

import { chance, weightedIndex, type Rng } from './rng.ts';
import { quantizeNearest, type ScaleName } from '../theory/scale.ts';
import { DEFAULT_STEP, type Step, type StepGrid } from '../pattern/step.ts';

export interface PitchMix {
  /** MIDI note that weight index 0 refers to. */
  readonly root: number;
  /**
   * Twelve weights, index 0 = root, index 11 = root + 11 semitones.
   * Scale is irrelevant here — these are chromatic slots, as on the hardware.
   */
  readonly weights: readonly number[];
  /** Weight per octave above the root. Index 0 is the root octave. */
  readonly octaves: readonly number[];
  /** Probability that a step is a rest, 0..1. */
  readonly restProbability: number;
  /**
   * Optional scale to snap the chosen pitch into.
   *
   * Snap-to-nearest, not degree-mapping: this generator chooses pitches
   * directly, so preserves closeness rather than contour.
   */
  readonly scale?: ScaleName;
  /** Accent probability, 0..1. */
  readonly accentProbability?: number;
  /** Slide probability, 0..1. Remember the flag is consumed by the *next* step. */
  readonly slideProbability?: number;
  /** Gate length as a fraction of a step. ~0.58 is the 303 duty cycle. */
  readonly gate?: number;
}

export const DEFAULT_MIX: PitchMix = {
  root: 45, // A2
  // Root, flat third, fifth, flat seventh weighted heavily; the rest sparse.
  weights: [1, 0, 0.5, 1, 0, 0.35, 0, 1, 0, 0.5, 0, 0.2],
  octaves: [1, 0.35, 0.08],
  restProbability: 0.3,
  scale: 'minorPentatonic',
  accentProbability: 0.25,
  slideProbability: 0.2,
  gate: 0.58,
};

/** One pitch from the mix, or `null` for a rest. */
export function pickPitch(mix: PitchMix, rng: Rng): number | null {
  if (chance(rng, mix.restProbability)) return null;
  const pc = weightedIndex(rng, mix.weights);
  const oct = weightedIndex(rng, mix.octaves);
  let pitch = mix.root + pc + 12 * oct;
  if (mix.scale) pitch = quantizeNearest(pitch, mix.root, mix.scale);
  return Math.max(0, Math.min(127, pitch));
}

/** Fill a loop of `steps` from the mix. */
export function pitchMixer(mix: PitchMix, steps: number, rng: Rng): StepGrid {
  const out: (Step | null)[] = [];
  for (let i = 0; i < steps; i++) {
    const pitch = pickPitch(mix, rng);
    if (pitch === null) {
      out.push(null);
      continue;
    }
    out.push({
      ...DEFAULT_STEP,
      pitch,
      gate: mix.gate ?? DEFAULT_STEP.gate,
      accent: chance(rng, mix.accentProbability ?? 0),
      slide: chance(rng, mix.slideProbability ?? 0),
    });
  }
  return out;
}

/** A neutral, all-zero mix — twelve faders down. */
export function emptyMix(root = 45): PitchMix {
  return {
    root,
    weights: new Array<number>(12).fill(0),
    octaves: [1],
    restProbability: 1,
  };
}

/** Set one semitone's weight, returning a new mix. */
export function withWeight(mix: PitchMix, semitone: number, weight: number): PitchMix {
  const weights = [...mix.weights];
  weights[((semitone % 12) + 12) % 12] = Math.max(0, weight);
  return { ...mix, weights };
}
