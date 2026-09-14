/**
 * Euclidean rhythm — Bjorklund's algorithm.
 *
 * E(k, n) distributes k onsets over n steps as evenly as possible. It is the
 * top-ranked generator in the research for one reason above all others: its two
 * parameters, k and n, are *unconditionally legible*. A performer turning them
 * hears exactly what they mean, with no training, no corpus and no surprise.
 * Tresillo, cinquillo and the samba patterns fall straight out of it.
 *
 * It is also the industry's default rhythm engine — ALM's Pamela's New Workout
 * exposes Euclidean parameters on every output — and it costs about thirty
 * lines. Build this first; it is the rhythmic spine.
 *
 * Note that E(k, n) is defined up to rotation, which is why `rotation` is a
 * first-class parameter rather than something callers patch afterwards.
 */

/**
 * Bjorklund's algorithm, following Toussaint's reference implementation.
 *
 * Recursive structure: the pattern is built by repeatedly splitting the
 * remainder, which is what guarantees maximal evenness rather than the
 * approximately-even result a naive bucket division gives.
 */
function bjorklund(pulses: number, steps: number): boolean[] {
  const pattern: boolean[] = [];
  const counts: number[] = [];
  const remainders: number[] = [pulses];
  let divisor = steps - pulses;
  let level = 0;

  // Guard against a non-terminating split. Only reachable for degenerate input,
  // which the public entry point already filters, but cheap insurance.
  for (let guard = 0; guard < 1024; guard++) {
    const r = remainders[level] as number;
    counts[level] = Math.floor(divisor / r);
    remainders[level + 1] = divisor % r;
    divisor = r;
    level++;
    if ((remainders[level] as number) <= 1) break;
  }
  counts[level] = divisor;

  const build = (l: number): void => {
    if (l === -1) {
      pattern.push(false);
      return;
    }
    if (l === -2) {
      pattern.push(true);
      return;
    }
    const c = counts[l] as number;
    for (let i = 0; i < c; i++) build(l - 1);
    if ((remainders[l] as number) !== 0) build(l - 2);
  };

  build(level);
  return pattern.slice(0, steps);
}

/**
 * E(pulses, steps) as a boolean mask of length `steps`.
 *
 * `rotation` shifts the whole pattern in time, which is how you get from one
 * Euclidean rhythm to its rotations without changing its evenness.
 */
export function euclid(pulses: number, steps: number, rotation = 0): boolean[] {
  if (steps <= 0) return [];
  if (pulses <= 0) return new Array<boolean>(steps).fill(false);
  if (pulses >= steps) return new Array<boolean>(steps).fill(true);

  const raw = bjorklund(Math.round(pulses), Math.round(steps));
  if (raw.length === 0) return [];

  // Bjorklund's reference output is defined only up to rotation, and as
  // implemented it emits a run of rests first — E(4,16) lands on 3,7,11,15, so
  // the downbeat is silent. Rotate so the pattern begins on an onset, which is
  // what a step sequencer (and a listener) expects. This is phase only: the
  // multiset of inter-onset gaps is rotation-invariant, so evenness is
  // untouched. `rotation` then shifts from that canonical position.
  const first = raw.indexOf(true);
  const mask = first > 0 ? [...raw.slice(first), ...raw.slice(0, first)] : raw;

  const len = mask.length;
  const k = ((rotation % len) + len) % len;
  return k === 0 ? mask : [...mask.slice(len - k), ...mask.slice(0, len - k)];
}

/** Indices carrying an onset. */
export function onsets(pulses: number, steps: number, rotation = 0): number[] {
  return euclid(pulses, steps, rotation).flatMap((on, i) => (on ? [i] : []));
}

/**
 * How many onsets are separated by the two gap sizes Euclidean rhythm requires.
 *
 * A correct E(k, n) uses at most two distinct inter-onset gaps, differing by
 * exactly one step. Exposed so the test suite can assert maximal evenness
 * rather than a specific rotation, which would make the tests brittle.
 */
export function gapSizes(pulses: number, steps: number): number[] {
  const idx = onsets(pulses, steps);
  if (idx.length < 2) return [];
  const gaps = new Set<number>();
  for (let i = 0; i < idx.length; i++) {
    const a = idx[i] as number;
    const b = idx[(i + 1) % idx.length] as number;
    gaps.add(i === idx.length - 1 ? b + steps - a : b - a);
  }
  return [...gaps].sort((x, y) => x - y);
}
