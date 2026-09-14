import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as F from './fraction.ts';

test('thirds add exactly — no float drift', () => {
  const third = F.frac(1, 3);
  const sum = F.add(F.add(third, third), third);
  assert.equal(F.show(sum), '1');
});

test('sevenths add exactly — the polymeter case', () => {
  let sum = F.ZERO;
  for (let i = 0; i < 7; i++) sum = F.add(sum, F.frac(1, 7));
  assert.equal(F.show(sum), '1');
});

test('a triplet grid stays phase-locked to the bar over many bars', () => {
  // 12 steps of 1/12 plus 8 steps of 1/8 both land exactly on 2 cycles.
  let a = F.ZERO;
  for (let i = 0; i < 24; i++) a = F.add(a, F.frac(1, 12));
  let b = F.ZERO;
  for (let i = 0; i < 16; i++) b = F.add(b, F.frac(1, 8));
  assert.equal(F.show(a), '2');
  assert.equal(F.show(b), '2');
  assert.equal(F.cmp(a, b), 0);
});

test('normalises sign onto the denominator', () => {
  const f = F.frac(2, -4);
  assert.equal(f.n, -1);
  assert.equal(f.d, 2);
});

test('reduces by the GCD', () => {
  assert.deepEqual(F.frac(6, 8), { n: 3, d: 4 });
  assert.deepEqual(F.frac(0, 5), { n: 0, d: 1 });
});

test('rejects a zero denominator', () => {
  assert.throws(() => F.frac(1, 0), RangeError);
  assert.throws(() => F.div(F.ONE, F.ZERO), RangeError);
});

test('cyclePos wraps and handles negatives', () => {
  assert.equal(F.show(F.cyclePos(F.frac(5, 4))), '1/4');
  assert.equal(F.show(F.cyclePos(F.frac(-1, 4))), '3/4');
  assert.equal(F.show(F.cyclePos(F.ZERO)), '0');
});

test('lcm gives the composite loop length', () => {
  // A 16-step bass against a 12-step arp repeats after 48 steps.
  assert.equal(F.lcm(16, 12), 48);
  // Adding a 7-step pad pushes it out to 336 — ~21 bars from 35 stored steps.
  assert.equal(F.lcm(48, 7), 336);
});

test('scale is exact for integers, approximate for floats', () => {
  assert.deepEqual(F.scale(F.frac(1, 3), 3), { n: 1, d: 1 });
  assert.equal(F.toNumber(F.scale(F.frac(1, 3), 1.5)), 0.5);
});

test('min, max, floor and comparison behave', () => {
  assert.equal(F.show(F.min(F.frac(1, 2), F.frac(1, 3))), '1/3');
  assert.equal(F.show(F.max(F.frac(1, 2), F.frac(1, 3))), '1/2');
  assert.equal(F.floor(F.frac(7, 4)), 1);
  assert.equal(F.floor(F.frac(-1, 4)), -1);
  assert.ok(F.lt(F.frac(1, 3), F.frac(1, 2)));
  assert.ok(F.lte(F.frac(1, 2), F.frac(1, 2)));
});

test('approximate recovers exact musical ratios from floats', () => {
  assert.equal(F.show(F.approximate(1 / 3)), '1/3');
  assert.equal(F.show(F.approximate(2 / 3)), '2/3');
  assert.equal(F.show(F.approximate(0.5)), '1/2');
  assert.equal(F.show(F.approximate(0.75)), '3/4');
  assert.equal(F.show(F.approximate(0.2)), '1/5');
  assert.equal(F.show(F.approximate(0.25)), '1/4');
});

test('approximate passes integers through untouched', () => {
  assert.equal(F.show(F.approximate(0)), '0');
  assert.equal(F.show(F.approximate(3)), '3');
  assert.equal(F.show(F.approximate(-2)), '-2');
});

test('approximate respects the denominator bound', () => {
  // A ratio with no small-denominator form must not invent one with a huge one.
  for (const x of [0.1234, 0.9871, 1 / 7]) {
    const f = F.approximate(x, 12);
    assert.ok(f.d <= 12, `${x} gave denominator ${f.d}`);
  }
  // With a larger bound it is allowed to be closer.
  const loose = F.approximate(1 / 7, 64);
  assert.equal(F.show(loose), '1/7');
});

test('approximate handles negatives and throws on non-finite input', () => {
  assert.equal(F.show(F.approximate(-1 / 3)), '-1/3');
  assert.throws(() => F.approximate(Number.NaN), RangeError);
  assert.throws(() => F.approximate(Number.POSITIVE_INFINITY), RangeError);
});

test('swing ratios stay exact rather than becoming thousandths', () => {
  // The bug this guards: scaling by 1000 turned a triplet into 667/2000.
  assert.equal(F.show(F.approximate((2 / 3) / 2, 12)), '1/3');
  assert.equal(F.show(F.approximate(0.4 / 2, 12)), '1/5');
});
