/**
 * The logistic map.
 *
 * Most chaotic systems make poor instruments — a Lorenz attractor is
 * three-dimensional and mapping it to pitch is arbitrary, so a knob turned on
 * it produces discontinuities rather than expression. The logistic map is the
 * exception, and it is the exception for a specific reason: its parameter `r`
 * sweeps audibly through a *period-doubling cascade*.
 *
 *   r < 3.0      converges to a single value      (one note, or silence)
 *   r ≈ 3.2      period 2
 *   r ≈ 3.5      period 4
 *   r ≈ 3.57     onset of chaos
 *   r > 3.57     chaotic, with stable windows inside it
 *
 * So `r` is a genuine musical control: turning it moves from a pedal point
 * through simple repeats into complexity, and the performer can hear the
 * structure changing rather than just hearing noise. The windows of order
 * inside the chaotic region are a bonus — the map periodically snaps back to
 * a short repeating figure.
 */

import { type Rng } from './rng.ts';
import { degreeToPitch, type ScaleName } from '../theory/scale.ts';
import { DEFAULT_STEP, type Step, type StepGrid } from '../pattern/step.ts';

export interface Chaos {
  /** The logistic parameter, 0..4. Below 3.57 it is periodic; above, chaotic. */
  readonly r: number;
  /** Starting value, 0..1. Different seeds are different phrases. */
  readonly seed?: number;
  readonly root: number;
  readonly scale: ScaleName;
  /** Number of scale degrees the map's output spans. */
  readonly span: number;
  readonly restProbability: number;
  readonly gate?: number;
}

export const DEFAULT_CHAOS: Chaos = {
  r: 3.72,
  root: 45,
  scale: 'phrygian',
  span: 12,
  restProbability: 0.15,
  gate: 0.58,
};

/** One iteration of x -> r·x·(1 - x). */
export function logistic(r: number, x: number): number {
  return r * x * (1 - x);
}

/**
 * Generate a loop from the map, starting at `x0`.
 *
 * Returns the final `x` as well, so successive passes continue the orbit rather
 * than restarting it — restarting would collapse the map's long-term behaviour,
 * which is the whole point of using it.
 */
export function chaosLoop(cfg: Chaos, steps: number, x0?: number): { grid: StepGrid; x: number } {
  let x = x0 ?? cfg.seed ?? 0.4;
  // Avoid the fixed point at 0, which would silence the whole loop.
  if (x <= 0 || x >= 1) x = 0.4;

  const out: (Step | null)[] = [];
  for (let i = 0; i < steps; i++) {
    x = logistic(cfg.r, x);
    if (x < cfg.restProbability) {
      out.push(null);
      continue;
    }
    const degree = Math.round(x * cfg.span);
    out.push({ ...DEFAULT_STEP, pitch: degreeToPitch(cfg.root, cfg.scale, degree), gate: cfg.gate ?? DEFAULT_STEP.gate });
  }
  return { grid: out, x };
}

/** A fresh starting value, for a "new phrase" button. */
export function chaosSeed(rng: Rng): number {
  return 0.05 + rng() * 0.9;
}
