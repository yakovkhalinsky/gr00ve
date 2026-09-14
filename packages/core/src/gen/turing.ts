/**
 * Shift-register loop with a mutation probability — the Music Thing Turing
 * Machine model.
 *
 * Two knobs: loop length, and the probability that a bit flips as the loop is
 * written back. At zero mutation it is a fixed loop; as mutation rises it drifts
 * into something else entirely; and turning it back down locks whatever it has
 * become. That is the cleanest hardware expression of the property this project
 * needs everywhere: **evolve rather than re-roll**.
 *
 * It is also bit-exact reproducible, because the loop is literally the state.
 * Nothing is stored but `bits`.
 */

import { chance, type Rng } from './rng.ts';
import { DEFAULT_STEP, type Step, type StepGrid } from '../pattern/step.ts';

export interface Turing {
  /** Steps per pass. Odd lengths (5, 7, 9, 11, 13) drift against 4/4. */
  readonly length: number;
  /** Pitch for a 0 bit. */
  readonly low: number;
  /** Pitch for a 1 bit. */
  readonly high: number;
  /** Probability a bit flips each pass, 0..1. */
  readonly mutation: number;
  readonly restProbability?: number;
  readonly gate?: number;
}

export const DEFAULT_TURING: Turing = {
  length: 8,
  low: 45,
  high: 57,
  mutation: 0.05,
  restProbability: 0,
  gate: 0.58,
};

/** A fresh random loop. */
export function seedBits(length: number, rng: Rng): boolean[] {
  return Array.from({ length: Math.max(1, length) }, () => rng() < 0.5);
}

/**
 * One pass: render the loop, and return the mutated loop to store.
 *
 * Mutation is applied to the copy written back, not to the bits being read, so
 * a single pass is internally consistent — the performer hears the loop they
 * have, and the change lands on the next pass.
 */
export function turingPass(cfg: Turing, bits: readonly boolean[], rng: Rng): {
  grid: StepGrid;
  bits: boolean[];
} {
  const grid: (Step | null)[] = bits.map((bit) => {
    if (cfg.restProbability && chance(rng, cfg.restProbability)) return null;
    return { ...DEFAULT_STEP, pitch: bit ? cfg.high : cfg.low, gate: cfg.gate ?? DEFAULT_STEP.gate };
  });

  const next = bits.map((bit) => (chance(rng, cfg.mutation) ? !bit : bit));
  return { grid, bits: next };
}

/** Lock the loop (mutation 0) — the equivalent of the Turing Machine's LOCK input. */
export function lock(cfg: Turing): Turing {
  return { ...cfg, mutation: 0 };
}
