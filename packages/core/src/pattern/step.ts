/**
 * The step model.
 *
 * A track is a fixed-length array of steps; `null` is a rest. This is the
 * tracker/step-sequencer data model that has survived from ProTracker through
 * Elektron, for the reason the research brief sets out: melody is best stored
 * as sparse deterministic overrides, and a piano roll represents that poorly.
 *
 * Every transform here is pure — it returns a new grid and never mutates its
 * input. Two consequences that matter:
 *
 *   - The UI can hold a grid in React state without defensive cloning.
 *   - "Evolve rather than re-roll" is free: keep the old grid, apply an
 *     operator, and the previous state is still there to return to.
 *
 * The four booleans/values per step (pitch, gate, slide, accent) are
 * deliberately the TB-303's per-step model, which the brief identifies as the
 * most-copied melodic interface in electronic music.
 */

import { chance, type Rng } from '../gen/rng.ts';

export interface Step {
  /** MIDI note number, 0..127. */
  readonly pitch: number;
  /** 0..1. Velocity within the track's own range; independent of `accent`. */
  readonly velocity: number;
  /** Boosts level and (on a 303-style voice) filter cutoff. */
  readonly accent: boolean;
  /**
   * Glide *into the following step*.
   *
   * This is the 303's rule and the one people get wrong: the flag programmed on
   * step `n` is consumed by step `n + 1`. It is not "this note slides", it is
   * "the next note is tied from this one".
   */
  readonly slide: boolean;
  /** 0..1 of the step duration. ~0.58 is the 303's hardware duty cycle. */
  readonly gate: number;
}

/** Fixed-length loop. `null` is a rest. */
export type StepGrid = readonly (Step | null)[];

export const DEFAULT_STEP: Omit<Step, 'pitch'> = {
  velocity: 0.75,
  accent: false,
  slide: false,
  gate: 0.58,
};

/** Build a step. */
export function step(pitch: number, over: Partial<Step> = {}): Step {
  return { ...DEFAULT_STEP, pitch, ...over };
}

/** Build a grid from a pitch list, where `null` is a rest. */
export function grid(pitches: readonly (number | null)[], over: Partial<Step> = {}): StepGrid {
  return pitches.map((p) => (p === null ? null : step(p, over)));
}

/** Shift the loop in time. Positive rotates later; wraps. */
export function rotate(g: StepGrid, n: number): StepGrid {
  const len = g.length;
  if (len === 0) return g;
  const k = ((n % len) + len) % len;
  if (k === 0) return g;
  return [...g.slice(len - k), ...g.slice(0, len - k)];
}

/** Reverse the loop. */
export function retrograde(g: StepGrid): StepGrid {
  return [...g].reverse();
}

/** Alternate forward/backward on alternate passes — a one-button canon. */
export function palindrome(g: StepGrid): StepGrid {
  return [...g, ...[...g].reverse()];
}

/**
 * Reflect pitches about an axis, keeping onsets in place.
 *
 * Inversion is a *pitch* operator, not a rhythmic one, so rests stay rests and
 * the groove is untouched — which is what makes it usable as a live button.
 */
export function invert(g: StepGrid, axis = 60): StepGrid {
  return g.map((s) => (s === null ? null : { ...s, pitch: 2 * axis - s.pitch }));
}

/** Transpose by semitones, clamped to the MIDI range. */
export function transpose(g: StepGrid, semitones: number): StepGrid {
  return g.map((s) => {
    if (s === null) return null;
    const p = Math.max(0, Math.min(127, s.pitch + semitones));
    return { ...s, pitch: p };
  });
}

/**
 * Drop each onset with probability `amount`.
 *
 * The single most useful continuous operator: at 0 the loop is itself, at 1 it
 * is silent, and every value between is a musically coherent thinning. Bound to
 * a slider it never produces a wrong answer, only a sparser one.
 */
export function thin(g: StepGrid, amount: number, rng: Rng): StepGrid {
  return g.map((s) => (s !== null && chance(rng, amount) ? null : s));
}

/** Replace some rests with onsets, borrowing the pitch of the nearest onset. */
export function thicken(g: StepGrid, amount: number, rng: Rng): StepGrid {
  const len = g.length;
  if (len === 0) return g;
  return g.map((s, i) => {
    if (s !== null || !chance(rng, amount)) return s;
    for (let d = 1; d < len; d++) {
      const prev = g[(i - d + len) % len];
      if (prev) return { ...prev, pitch: prev.pitch, accent: false, slide: false };
      const next = g[(i + d) % len];
      if (next) return { ...next, accent: false, slide: false };
    }
    return s;
  });
}

/** Scale every gate length. Below 1 is staccato, above 1 legato. */
export function setGate(g: StepGrid, factor: number): StepGrid {
  return g.map((s) => (s === null ? null : { ...s, gate: Math.max(0, Math.min(4, s.gate * factor)) }));
}

/** Set accent on onsets matching `pred`, or on a probability. */
export function accent(g: StepGrid, amount: number, rng: Rng): StepGrid {
  return g.map((s) => (s !== null && chance(rng, amount) ? { ...s, accent: true } : s));
}

/**
 * Set the 303 slide flag with probability `amount`.
 *
 * Remember the flag is consumed by the *following* step, so this deliberately
 * writes the flag on the step preceding the one that will glide.
 */
export function slide(g: StepGrid, amount: number, rng: Rng): StepGrid {
  return g.map((s) => (s !== null && chance(rng, amount) ? { ...s, slide: true } : s));
}

/** Randomise velocity within ±`amount`, for the only humanising dimension left. */
export function humanize(g: StepGrid, amount: number, rng: Rng): StepGrid {
  return g.map((s) => {
    if (s === null) return null;
    const jitter = (rng() * 2 - 1) * amount;
    return { ...s, velocity: Math.max(0, Math.min(1, s.velocity + jitter)) };
  });
}

/** Fisher-Yates shuffle of onsets, preserving the rhythm's density. */
export function shuffle(g: StepGrid, rng: Rng): StepGrid {
  const out = [...g];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i];
    const b = out[j];
    out[i] = b as Step | null;
    out[j] = a as Step | null;
  }
  return out;
}

/**
 * Subdivide each onset into `n` repeats ("ratchet").
 *
 * Returns a grid `n` times longer, so callers that need to preserve loop length
 * should follow with a `thin`/`rotate` pass or accept the longer loop.
 */
export function ratchet(g: StepGrid, n: number): StepGrid {
  if (n <= 1) return g;
  const out: (Step | null)[] = [];
  for (const s of g) {
    if (s === null) {
      for (let i = 0; i < n; i++) out.push(null);
    } else {
      for (let i = 0; i < n; i++) out.push({ ...s, gate: s.gate / n, accent: i === 0 && s.accent });
    }
  }
  return out;
}

/**
 * Apply `fn` every `n` passes, leaving other passes untouched.
 *
 * The highest-leverage control in the whole operator catalogue: one encoder for
 * `n`, one button to choose `fn`, and the entire operator table becomes
 * reachable without new UI. `pass` is the loop counter the caller supplies.
 */
export function applyEvery(g: StepGrid, pass: number, n: number, fn: (g: StepGrid) => StepGrid): StepGrid {
  if (n <= 0) return g;
  return pass % n === 0 ? fn(g) : g;
}
