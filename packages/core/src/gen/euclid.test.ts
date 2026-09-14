import { test } from 'node:test';
import assert from 'node:assert/strict';

import { euclid, onsets, gapSizes } from './euclid.ts';

test('produces the requested number of onsets', () => {
  for (const [k, n] of [[3, 8], [5, 8], [2, 5], [4, 16], [7, 16], [1, 4]] as const) {
    assert.equal(onsets(k, n).length, k, `E(${k},${n})`);
  }
});

test('distributes onsets maximally evenly — at most two gap sizes', () => {
  for (const [k, n] of [[3, 8], [5, 8], [5, 13], [7, 16], [3, 7], [2, 5]] as const) {
    const gaps = gapSizes(k, n);
    assert.ok(gaps.length <= 2, `E(${k},${n}) had ${gaps.length} distinct gaps`);
    if (gaps.length === 2) {
      // The two gaps of a Euclidean rhythm must differ by exactly one step.
      assert.equal((gaps[1] as number) - (gaps[0] as number), 1, `E(${k},${n})`);
    }
  }
});

test('the pattern begins on an onset, so the downbeat sounds', () => {
  // Bjorklund's raw output is only defined up to rotation and starts with a run
  // of rests; `euclid` normalises so step 0 is always an onset.
  for (const [k, n] of [[4, 16], [3, 8], [5, 8], [2, 5], [7, 16], [1, 4]] as const) {
    assert.equal(euclid(k, n)[0], true, `E(${k},${n}) does not start on an onset`);
  }
  assert.deepEqual(onsets(4, 16), [0, 4, 8, 12]);
});

test('even divisions are perfectly regular', () => {
  // Assert spacing rather than absolute phase, since the phase of E(k,n) is a
  // convention and `rotation` is the knob for moving it.
  assert.deepEqual(gapSizes(4, 16), [4]);
  assert.deepEqual(gapSizes(4, 12), [3]);
  assert.deepEqual(gapSizes(2, 8), [4]);
});

test('tresillo and cinquillo fall out', () => {
  // E(3,8) is the tresillo up to rotation: gaps of 2 and 3, never 1 or 4.
  assert.deepEqual(gapSizes(3, 8), [2, 3]);
  // E(5,8) is the cinquillo.
  assert.deepEqual(gapSizes(5, 8), [1, 2]);
});

test('rotation shifts the pattern without changing it', () => {
  const base = onsets(3, 8);
  const rotated = onsets(3, 8, 1);
  assert.equal(rotated.length, base.length);
  assert.notDeepEqual(rotated, base);
  // Rotating by the full length is the identity.
  assert.deepEqual(onsets(3, 8, 8), base);
  assert.deepEqual(onsets(3, 8, -8), base);
});

test('handle degenerate input', () => {
  assert.deepEqual(euclid(0, 8), new Array(8).fill(false));
  assert.deepEqual(euclid(8, 8), new Array(8).fill(true));
  assert.deepEqual(euclid(9, 8), new Array(8).fill(true));
  assert.deepEqual(euclid(3, 0), []);
  assert.deepEqual(euclid(-1, 8), new Array(8).fill(false));
});

test('every k from 1..n-1 yields exactly k onsets', () => {
  for (let n = 1; n <= 16; n++) {
    for (let k = 0; k <= n; k++) {
      assert.equal(onsets(k, n).length, k, `E(${k},${n})`);
    }
  }
});
