/**
 * A small seeded PRNG.
 *
 * Reproducibility is a first-class requirement, not a nicety: the performer
 * turns an encoder, hears a phrase they like, and must be able to return to it.
 * Every generator in this package takes an `Rng` rather than reaching for
 * `Math.random`, and every generator's state is a plain number you can store,
 * display, and recall.
 *
 * mulberry32 — 32-bit state, passes gjrand, fast enough for per-step use.
 * Deliberately NOT cryptographic; nothing here needs to be.
 */

export type Rng = () => number;

/** Create an RNG from a 32-bit seed. Same seed, same stream, forever. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). Uniform. */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/**
 * Derive a stable seed from several small integers.
 *
 * Mixes parameters into one seed where a starting point is wanted — seeding a
 * track's first pattern from its index and shape, say — so that the same inputs
 * always give the same phrase.
 *
 * Note this deliberately does *not* make generation idempotent by itself. A
 * generate action seeded only from its own parameters returns the identical
 * pattern every press, which reads as the button being broken; variation comes
 * from a seed that advances (see `TrackState.seed` in the web app). Use this
 * where a stable starting point is the goal, not where a fresh result is.
 *
 * FNV-1a over the byte-expanded inputs — cheap, and well spread for small
 * tuples, which is all this is ever asked to do.
 */
export function combineSeed(...parts: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    // Four bytes per part, so order matters and (1, 2) differs from (2, 1).
    for (let shift = 0; shift < 32; shift += 8) {
      hash ^= (part >>> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash >>> 0;
}

/** Float in [lo, hi). */
export function randRange(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** True with probability `p`. `p <= 0` is always false, `p >= 1` always true. */
export function chance(rng: Rng, p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return rng() < p;
}

/** Pick one element uniformly. Throws on an empty list. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick: empty list');
  const v = items[randInt(rng, items.length)];
  // noUncheckedIndexedAccess: the index is in range by construction.
  return v as T;
}

/**
 * Pick an index from unnormalised weights.
 *
 * The core of the pitch-probability mixer (gen/pitch-mixer.ts), where the
 * weights are twelve fader positions. Zero-weight entries are never chosen, so
 * a user can mute a pitch by pulling its fader down rather than by any
 * separate enable.
 */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) return randInt(rng, weights.length);

  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] ?? 0;
    if (w > 0) {
      r -= w;
      if (r < 0) return i;
    }
  }
  // Unreachable barring float underflow; fall back to the last positive entry.
  for (let i = weights.length - 1; i >= 0; i--) if ((weights[i] ?? 0) > 0) return i;
  return 0;
}
