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
  // Root, flat third, fifth and flat seventh weighted heavily; the rest sparse.
  // Chromatic slots, as on the hardware — the scale below snaps them, so
  // weighted semitones that fall between scale notes land on the nearest one
  // rather than being discarded.
  weights: [1, 0, 0.5, 1, 0, 0.35, 0, 1, 0, 0.5, 0, 0.2],
  /**
   * Mostly the root octave, with the one above as an occasional accent — and
   * deliberately *no* third octave.
   *
   * The genre research is unambiguous that an electronic melody occupies about
   * 1–1.5 octaves, and that this is placement rather than poverty: the lead sits
   * in a spectral pocket between the bass and the cymbal wash, so a wider range
   * does not buy expression, it buys mud. A third octave weight here put G5 in
   * the same bar as C3 — a 2.5-octave leap inside one line — which is exactly
   * what that constraint exists to prevent.
   *
   * Note the span is set by the weights, not enforced by the generator: it is
   * 10 semitones across the weighted semitones, plus 12 whenever the octave
   * lands. That is the mixer doing its job — the performer owns the range — so
   * the default just has to be a sensible starting point rather than a bound.
   */
  octaves: [1, 0.12],
  restProbability: 0.3,
  scale: 'minorPentatonic',
  accentProbability: 0.25,
  slideProbability: 0.2,
  gate: 0.58,
};

/**
 * One pitch from the mix, ignoring the rest probability.
 *
 * Split out of `pickPitch` because these are two different decisions, and the
 * composition path needs them apart: when a rhythm gate is supplied, *it* owns
 * whether a step sounds, and a second rest roll on top would punch holes in a
 * Euclidean pattern the performer deliberately dialled in.
 */
export function pickPitchOnly(mix: PitchMix, rng: Rng): number {
  const pc = weightedIndex(rng, mix.weights);
  const oct = weightedIndex(rng, mix.octaves);
  let pitch = mix.root + pc + 12 * oct;
  if (mix.scale) pitch = quantizeNearest(pitch, mix.root, mix.scale);
  return Math.max(0, Math.min(127, pitch));
}

/** One pitch from the mix, or `null` for a rest. */
export function pickPitch(mix: PitchMix, rng: Rng): number | null {
  if (chance(rng, mix.restProbability)) return null;
  return pickPitchOnly(mix, rng);
}

/**
 * Fill a loop of `steps` from the mix.
 *
 * @param gate Optional rhythm, e.g. a Euclidean mask. **When supplied it owns
 *   *when* a step sounds** — `restProbability` is ignored, and accent follows
 *   the metre (every fourth step) rather than the mix's accent probability,
 *   because accent placement is part of a rhythm rather than part of a pitch
 *   choice. The mix still owns *what* sounds: which pitch, and each note's
 *   gate length and slide.
 *
 *   This is how the two generators compose. Euclidean answers "when", the
 *   pitch-probability mixer answers "what", and neither tries to do the
 *   other's job — which is what lets the faders mean something without
 *   overriding the rhythm the performer dialled in.
 */
export function pitchMixer(
  mix: PitchMix,
  steps: number,
  rng: Rng,
  gate?: readonly boolean[] | undefined,
): StepGrid {
  const out: (Step | null)[] = [];
  for (let i = 0; i < steps; i++) {
    if (gate !== undefined) {
      if (gate[i] !== true) {
        out.push(null);
        continue;
      }
      out.push({
        ...DEFAULT_STEP,
        pitch: pickPitchOnly(mix, rng),
        gate: mix.gate ?? DEFAULT_STEP.gate,
        accent: i % 4 === 0,
        slide: chance(rng, mix.slideProbability ?? 0),
      });
      continue;
    }

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
