/**
 * Scale helpers shared by the generators.
 *
 * The musical decisions live here rather than inside each generator so every
 * generator produces notes the same way: degrees within a register, converted
 * through `@gr00ve/core`'s scale tables. Reusing the core theory layer matters
 * for a concrete reason — the app and this exporter must agree about what
 * "Aeolian in A" means, or the same seed would produce different notes in the
 * two pages.
 */

import {
  SCALES, chance, degreeToPitch, pitchToDegree, randInt, weightedIndex,
  type Rng, type ScaleName,
} from '@gr00ve/core';

/** Notes in one octave of the scale. */
export function degreeCount(scale: ScaleName): number {
  return SCALES[scale].length;
}

/** Highest scale degree inside `octaves` octaves, inclusive. */
export function maxDegree(scale: ScaleName, octaves: number): number {
  return Math.max(0, degreeCount(scale) * Math.max(1, Math.round(octaves)) - 1);
}

/** Clamp a degree into the register. */
export function clampDegree(degree: number, scale: ScaleName, octaves: number): number {
  return Math.max(0, Math.min(maxDegree(scale, octaves), Math.round(degree)));
}

/** Convert a (possibly out-of-range) degree to a MIDI note, clamped to 0..127. */
export function pitchForDegree(
  root: number,
  scale: ScaleName,
  degree: number,
  octaves = 2,
): number {
  const pitch = degreeToPitch(root, scale, clampDegree(degree, scale, octaves));
  return Math.max(0, Math.min(127, pitch));
}

/**
 * Clamp an actual pitch back into the register, preserving its scale degree.
 *
 * Used by the walk generator, whose core implementation returns pitches rather
 * than degrees. Mapping through `pitchToDegree` rather than clamping the MIDI
 * value keeps the note in the scale — clamping the pitch directly could land on
 * a semitone the scale does not contain.
 */
export function clampPitchToRange(
  pitch: number,
  root: number,
  scale: ScaleName,
  octaves: number,
): number {
  const degree = clampDegree(pitchToDegree(pitch, root, scale), scale, octaves);
  return pitchForDegree(root, scale, degree, octaves);
}

/**
 * A short melodic line of scale degrees.
 *
 * A random walk in degree space, not independent random notes: independent
 * picks from a seven-note scale produce leaps of a sixth as often as steps, and
 * the result reads as noise rather than a line. The move distribution is
 * heavily weighted toward ±1 and 0, with occasional ±2.
 */
export function melodicDegrees(
  rng: Rng,
  scale: ScaleName,
  octaves: number,
  count: number,
  startDegree?: number,
): number[] {
  const max = maxDegree(scale, octaves);
  let degree = startDegree === undefined ? randInt(rng, max + 1) : clampDegree(startDegree, scale, octaves);
  const out: number[] = [];
  // -2..2, weighted. Index 0 is -2, index 4 is +2.
  const moves = [0.5, 2.2, 1, 2.2, 0.5];

  for (let i = 0; i < count; i++) {
    if (i > 0) {
      const move = weightedIndex(rng, moves) - 2;
      // Reflect at the edges rather than sticking to them: a line that parks on
      // the top note for the second half of the bar reads as a bug.
      let next = degree + move;
      if (next < 0) next = -next;
      else if (next > max) next = 2 * max - next;
      degree = clampDegree(next, scale, octaves);
    }
    out.push(degree);
  }
  return out;
}

/**
 * One first-order Markov step over scale degrees.
 *
 * The state is the current degree and the transition is a fixed distribution
 * over intervals; `leap` mixes in wider jumps. That is a real Markov chain (the
 * next state depends only on the current one), but deliberately a small,
 * legible one — a trained model belongs behind an explicit "surprise me", not
 * in an instrument's default path.
 */
export function markovStep(
  rng: Rng,
  current: number,
  scale: ScaleName,
  octaves: number,
  leap: number,
): number {
  const max = maxDegree(scale, octaves);
  if (chance(rng, leap)) {
    const direction = rng() < 0.5 ? -1 : 1;
    return clampDegree(current + direction * (3 + randInt(rng, 3)), scale, octaves);
  }
  const offsets = [0.7, 2.4, 1.2, 2.4, 0.7];
  return clampDegree(current + (weightedIndex(rng, offsets) - 2), scale, octaves);
}
