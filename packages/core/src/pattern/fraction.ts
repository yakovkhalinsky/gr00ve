/**
 * Exact rational time.
 *
 * Sequencer timing maths must not accumulate floating-point error. Swing,
 * triplets and per-track polymeter divide time into thirds, fifths and
 * sevenths — none of which binary floats represent exactly. Every operation
 * here normalises by the GCD, so `add(add(1/3, 1/3), 1/3)` is exactly 1, and a
 * triplet grid stays phase-locked to the bar forever instead of drifting.
 *
 * This is the one piece of the Tidal/Strudel architecture worth copying
 * outright; see docs/research-brief.md.
 */

export interface Fraction {
  /** Numerator. */
  readonly n: number;
  /** Denominator. Always > 0. */
  readonly d: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a === 0 ? 1 : a;
}

/** Construct a normalised fraction. */
export function frac(n: number, d = 1): Fraction {
  if (d === 0) throw new RangeError('Fraction: zero denominator');
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export const ZERO: Fraction = { n: 0, d: 1 };
export const ONE: Fraction = { n: 1, d: 1 };

/**
 * Best rational approximation with a bounded denominator (continued fractions).
 *
 * Needed because a swing ratio arrives as a float. `2/3` in binary is
 * 0.666…, and naively scaling it gives 667/2000 — which is a *different*
 * rhythm that drifts against the bar. Approximating with a small denominator
 * recovers 1/3 exactly, so the triplet grid stays locked.
 *
 * `maxDenominator` should be small: 12 is enough for every swing ratio in
 * musical use (1/2, 1/3, 2/3, 1/4, 3/4) and cannot silently invent a
 * near-miss fraction with a denominator in the thousands.
 */
export function approximate(x: number, maxDenominator = 12): Fraction {
  if (!Number.isFinite(x)) throw new RangeError('approximate: not a finite number');
  if (Number.isInteger(x)) return frac(x);

  const sign = x < 0 ? -1 : 1;
  let v = Math.abs(x);

  let n0 = 0;
  let d0 = 1;
  let n1 = 1;
  let d1 = 0;

  for (let i = 0; i < 64; i++) {
    const a = Math.floor(v);
    const n2 = a * n1 + n0;
    const d2 = a * d1 + d0;
    if (d2 > maxDenominator) break;
    n0 = n1; d0 = d1;
    n1 = n2; d1 = d2;
    const rest = v - a;
    if (rest < 1e-12) break;
    v = 1 / rest;
  }

  return d1 === 0 ? frac(Math.round(x)) : frac(sign * n1, d1);
}

export function add(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.n, a.d * b.d);
}

export function div(a: Fraction, b: Fraction): Fraction {
  if (b.n === 0) throw new RangeError('Fraction: division by zero');
  return frac(a.n * b.d, a.d * b.n);
}

/** Scale by an integer or float. Exact when `k` is an integer. */
export function scale(a: Fraction, k: number): Fraction {
  return Number.isInteger(k) ? frac(a.n * k, a.d) : frac(a.n * k * 1e6, a.d * 1e6);
}

/** Negative, zero, or positive, matching `Math.sign(a - b)`. */
export function cmp(a: Fraction, b: Fraction): number {
  return Math.sign(a.n * b.d - b.n * a.d);
}

export function eq(a: Fraction, b: Fraction): boolean {
  return a.n === b.n && a.d === b.d;
}

export function lt(a: Fraction, b: Fraction): boolean {
  return cmp(a, b) < 0;
}

export function lte(a: Fraction, b: Fraction): boolean {
  return cmp(a, b) <= 0;
}

export function min(a: Fraction, b: Fraction): Fraction {
  return cmp(a, b) <= 0 ? a : b;
}

export function max(a: Fraction, b: Fraction): Fraction {
  return cmp(a, b) >= 0 ? a : b;
}

export function toNumber(a: Fraction): number {
  return a.n / a.d;
}

/** Largest integer <= a. */
export function floor(a: Fraction): number {
  return Math.floor(a.n / a.d);
}

/**
 * Position within the cycle, in [0, 1).
 *
 * Used to wrap absolute time onto a loop that repeats every `length`. Correct
 * for negative input, which matters when a scheduler looks slightly backwards
 * across a loop boundary.
 */
export function cyclePos(a: Fraction, length: Fraction = ONE): Fraction {
  const r = sub(a, mul(frac(floor(div(a, length))), length));
  return cmp(r, ZERO) < 0 ? add(r, length) : r;
}

/**
 * Least common multiple of two integer loop lengths, in cycles.
 *
 * This is why per-track polymeter is cheap: a 16-step bass, a 12-step arp and a
 * 7-step pad repeat together after lcm(16,12,7) = 336 steps, so 35 stored steps
 * yield ~21 bars of material that never audibly loops.
 */
export function lcm(a: number, b: number): number {
  return Math.abs(a / gcd(a, b)) * Math.abs(b);
}

/** Render as a plain string, e.g. "3/4". */
export function show(a: Fraction): string {
  return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
}
