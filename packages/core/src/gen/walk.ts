/**
 * Mean-reverting random walk on scale degrees.
 *
 * The "comprehensible melody" model: stepwise motion, a singable contour, and a
 * register the line keeps returning to. The mean-reverting form is what makes it
 * musical rather than drunk — an unconstrained walk wanders off and never
 * comes back, whereas an elastic pull toward a centre is what listeners hear as
 * a phrase having a home.
 *
 * Its four parameters are the classic musical forces, all legible on a slider:
 * how far a step may leap, where the line lives, how strongly it is pulled back,
 * and whether it gravitates up or down. The last one is not decorative — trance
 * leads are built from two-bar phrases that rise.
 *
 * (`Ornstein & Johnson` is often cited for this model; the correct attribution
 * is the Ornstein-Uhlenbeck process as applied by Brown & Gifford.)
 */

import { randRange, chance, type Rng } from './rng.ts';
import { degreeToPitch, type ScaleName } from '../theory/scale.ts';
import { DEFAULT_STEP, type Step, type StepGrid } from '../pattern/step.ts';

export interface Walk {
  readonly root: number;
  readonly scale: ScaleName;
  /** The degree the walk is pulled back toward. */
  readonly center: number;
  /** Largest move per step, in scale degrees. 1 = purely stepwise. */
  readonly maxStep: number;
  /** 0 = free drift, 1 = hard spring to centre. Around 0.15–0.3 reads as musical. */
  readonly gravity: number;
  /** Negative leans down, positive leans up. */
  readonly bias: number;
  readonly restProbability: number;
  readonly gate?: number;
}

export const DEFAULT_WALK: Walk = {
  root: 45,
  scale: 'aeolian',
  center: 4,
  maxStep: 2,
  gravity: 0.2,
  bias: 0.15,
  restProbability: 0.3,
  gate: 0.58,
};

/**
 * Fill a loop by walking from `startDegree`.
 *
 * Returns both the grid and the degree the walk ended on, so a caller can
 * continue the walk across loop boundaries — otherwise every loop restarts from
 * the same place and the "evolve rather than re-roll" property is lost.
 */
export function randomWalk(
  cfg: Walk, steps: number, rng: Rng, startDegree?: number,
): { grid: StepGrid; endDegree: number } {
  let pos = startDegree ?? cfg.center;
  const out: (Step | null)[] = [];

  for (let i = 0; i < steps; i++) {
    const leap = randRange(rng, -cfg.maxStep, cfg.maxStep + 1);
    const pull = (cfg.center - pos) * cfg.gravity;
    pos += leap + pull + cfg.bias * cfg.maxStep;

    if (chance(rng, cfg.restProbability)) {
      out.push(null);
      continue;
    }

    const pitch = degreeToPitch(cfg.root, cfg.scale, Math.round(pos));
    out.push({ ...DEFAULT_STEP, pitch, gate: cfg.gate ?? DEFAULT_STEP.gate });
  }

  return { grid: out, endDegree: pos };
}

/** Convenience wrapper when the caller does not need to continue the walk. */
export function walk(cfg: Walk, steps: number, rng: Rng): StepGrid {
  return randomWalk(cfg, steps, rng).grid;
}
