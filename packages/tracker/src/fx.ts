/**
 * Step-effect encoding — the only place effect numbers appear.
 *
 * Every index below is taken from Polyend's own sources, not inferred from the
 * device's UI:
 *
 *   - `@polyend/tracker-lib` `src/types/patterns.ts:284-411` lists the complete
 *     `PatternFX` table. The entries used here are Micro-move index 2 (line
 *     287), Roll index 3 (line 288), Chance index 4 (line 289) and
 *     Volume/Velocity index 18 (line 341).
 *   - Tracker CE's `core/source/mtSequencer.h:122-186` enumerates the same
 *     effects in the same order (`FX_TYPE_MICROMOVE`, `FX_TYPE_ROLL`,
 *     `FX_TYPE_CHANCE`, `FX_TYPE_VOLUME`), which is what confirms the numbers
 *     survive the firmware's v5→v6 pattern translation.
 *
 * Nothing else is written. The device has dozens more effects, but a code this
 * exporter cannot point at a source line for does not belong in an exported
 * file.
 */

import { combineSeed, makeRng } from '@gr00ve/core';

import { clampInt } from './generators.ts';
import type { FxSettings, GeneratedStep } from './types.ts';

/** Micro-move (`m`), tracker-lib index 2. */
export const FX_MICRO_MOVE = 2;
/** Roll (`R`), tracker-lib index 3. */
export const FX_ROLL = 3;
/** Chance (`C`), tracker-lib index 4. */
export const FX_CHANCE = 4;
/** Volume/Velocity (`V`), tracker-lib index 18. */
export const FX_VELOCITY = 18;

/** The only effect indices this exporter will ever write. */
export const DOCUMENTED_FX_INDICES: readonly number[] = [
  FX_MICRO_MOVE,
  FX_ROLL,
  FX_CHANCE,
  FX_VELOCITY,
];

/** Short labels the grid can show without a lookup table in the UI. */
export const FX_LABELS: Readonly<Record<'chance' | 'roll' | 'micro' | 'velocity', string>> = {
  chance: 'C',
  roll: 'R',
  micro: 'm',
  velocity: 'V',
};

/** One effect record as it will be written into a step. */
export interface PackedFx {
  readonly index: number;
  readonly value: number;
}

/**
 * Pack a step's candidate effects into the Tracker's two slots.
 *
 * Order is chance, roll, micro-move, velocity — the same order the UI displays
 * and the same order `normaliseFxSettings` keeps. A step with three candidates
 * loses the last one; that is a property of the file format, not a bug, and the
 * UI says so.
 *
 * Chance 100 is omitted because it is the same as no Chance at all, while
 * Chance 0 is kept: "this step never plays" is a real setting, and silently
 * turning it into "always plays" would be a lie.
 */
export function packedFx(step: GeneratedStep, fx: FxSettings): PackedFx[] {
  const out: PackedFx[] = [];

  if (fx.chance && step.chance !== undefined && step.chance < 100) {
    out.push({ index: FX_CHANCE, value: clampInt(step.chance, 0, 100) });
  }
  if (fx.roll && step.roll !== undefined) {
    out.push({ index: FX_ROLL, value: clampInt(step.roll, 1, 47) });
  }
  if (fx.micro && step.micro !== undefined) {
    out.push({ index: FX_MICRO_MOVE, value: clampInt(step.micro, 1, 100) });
  }
  if (fx.velocity && step.velocity !== 100) {
    out.push({ index: FX_VELOCITY, value: clampInt(step.velocity, 0, 100) });
  }

  return out.slice(0, 2);
}

/**
 * Whether a step fires on a given pass.
 *
 * Deterministic in `(seed, track, step, pass)`, so the preview can be repeated
 * exactly and two steps never share a fate just because they are adjacent. The
 * device uses its own RNG; this is a preview, not a simulation of the
 * firmware's generator.
 */
export function chanceFires(
  chance: number | undefined,
  trackIndex: number,
  stepIndex: number,
  pass: number,
  seed: number,
): boolean {
  if (chance === undefined || chance >= 100) return true;
  if (chance <= 0) return false;
  const rng = makeRng(combineSeed(seed >>> 0, trackIndex, stepIndex, pass));
  return rng() * 100 < chance;
}
