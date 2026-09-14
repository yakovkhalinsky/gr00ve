import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, randInt, randRange, chance, pick, weightedIndex, combineSeed } from './rng.ts';

test('is deterministic — same seed, same stream', () => {
  const a = makeRng(1234);
  const b = makeRng(1234);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('different seeds diverge', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a() === b()) same++;
  assert.ok(same < 5, 'streams should not coincide');
});

test('stays within [0, 1)', () => {
  const rng = makeRng(99);
  for (let i = 0; i < 10_000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('is roughly uniform', () => {
  const rng = makeRng(7);
  const buckets = new Array<number>(10).fill(0);
  const n = 100_000;
  for (let i = 0; i < n; i++) buckets[Math.floor(rng() * 10)]!++;
  for (const b of buckets) {
    // Generous bounds — this catches a stuck or biased generator, not a subtle one.
    assert.ok(b > n / 10 - n / 100 && b < n / 10 + n / 100, `bucket skew: ${b}`);
  }
});

test('randInt covers its range and never exceeds it', () => {
  const rng = makeRng(42);
  const seen = new Set<number>();
  for (let i = 0; i < 1000; i++) {
    const v = randInt(rng, 6);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 6, `bad: ${v}`);
    seen.add(v);
  }
  assert.equal(seen.size, 6);
});

test('randRange respects its bounds', () => {
  const rng = makeRng(3);
  for (let i = 0; i < 1000; i++) {
    const v = randRange(rng, -2, 5);
    assert.ok(v >= -2 && v < 5);
  }
});

test('chance saturates at the ends and is exact in the middle', () => {
  const rng = makeRng(11);
  for (let i = 0; i < 100; i++) {
    assert.equal(chance(rng, 0), false);
    assert.equal(chance(rng, 1), true);
    assert.equal(chance(rng, -1), false);
    assert.equal(chance(rng, 2), true);
  }
  let hits = 0;
  for (let i = 0; i < 10_000; i++) if (chance(rng, 0.25)) hits++;
  assert.ok(hits > 2300 && hits < 2700, `expected ~2500, got ${hits}`);
});

test('pick throws on an empty list rather than returning undefined', () => {
  assert.throws(() => pick(makeRng(1), []), RangeError);
});

test('weightedIndex never selects a zero-weight entry', () => {
  const rng = makeRng(5);
  const weights = [0, 5, 0, 0, 3, 0];
  for (let i = 0; i < 5000; i++) {
    const idx = weightedIndex(rng, weights);
    assert.ok(idx === 1 || idx === 4, `selected zero-weight index ${idx}`);
  }
});

test('weightedIndex respects relative weights', () => {
  const rng = makeRng(6);
  const weights = [1, 3, 0];
  let counts = [0, 0, 0];
  const n = 40_000;
  for (let i = 0; i < n; i++) {
    const idx = weightedIndex(rng, weights);
    counts[idx] = (counts[idx] as number) + 1;
  }
  // Expect roughly 25% / 75% / 0%.
  assert.ok(Math.abs((counts[0] as number) / n - 0.25) < 0.02, `got ${counts[0]}`);
  assert.ok(Math.abs((counts[1] as number) / n - 0.75) < 0.02, `got ${counts[1]}`);
  assert.equal(counts[2], 0);
});

test('weightedIndex falls back to uniform when all weights are zero', () => {
  const rng = makeRng(8);
  const seen = new Set<number>();
  for (let i = 0; i < 500; i++) seen.add(weightedIndex(rng, [0, 0, 0, 0]));
  assert.equal(seen.size, 4);
});

// --- combineSeed ------------------------------------------------------------

test('combineSeed is deterministic', () => {
  assert.equal(combineSeed(1, 5, 8), combineSeed(1, 5, 8));
  assert.equal(combineSeed(0), combineSeed(0));
});

test('combineSeed is order-sensitive', () => {
  // Otherwise (1, 2) and (2, 1) would collide, and two tracks with swapped
  // parameters would generate identical phrases.
  assert.notEqual(combineSeed(1, 2), combineSeed(2, 1));
  assert.notEqual(combineSeed(1, 2, 3), combineSeed(3, 2, 1));
});

test('combineSeed separates neighbouring inputs', () => {
  // The realistic collisions: adjacent track indices at the same E(k,n), and
  // the same track at adjacent k.
  const seeds = new Set<number>();
  for (let track = 0; track < 8; track++) seeds.add(combineSeed(track, 5, 16));
  assert.equal(seeds.size, 8, 'track indices collided');
  const byK = new Set<number>();
  for (let k = 1; k <= 16; k++) byK.add(combineSeed(0, k, 16));
  assert.equal(byK.size, 16, 'k values collided');
});

test('combineSeed returns a usable 32-bit seed', () => {
  for (const args of [[0], [1, 2, 3], [99, 16, 16], [-5, 7]] as const) {
    const seed = combineSeed(...args);
    assert.ok(Number.isInteger(seed), `${seed} is not an integer`);
    assert.ok(seed >= 0 && seed <= 0xffffffff, `${seed} out of 32-bit range`);
    // And it must actually drive the generator.
    assert.notEqual(makeRng(seed)(), undefined);
  }
});

test('combineSeed with no arguments still yields a seed', () => {
  const seed = combineSeed();
  assert.ok(Number.isInteger(seed) && seed >= 0);
});

test('distinct seeds produce distinct streams', () => {
  // A weak mix would show up as two tracks generating nearly the same phrase.
  const a = makeRng(combineSeed(0, 5, 16));
  const b = makeRng(combineSeed(1, 5, 16));
  let same = 0;
  for (let i = 0; i < 100; i++) if (a() === b()) same++;
  assert.ok(same < 5, 'neighbouring seeds produced coincident streams');
});
