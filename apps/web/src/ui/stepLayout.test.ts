import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STEPS_PER_ROW, layoutRows, isDownbeat, describeLayout } from './stepLayout.ts';

const seq = (n: number) => Array.from({ length: n }, (_, i) => i);

test('wraps 16 steps into two rows of 8', () => {
  const rows = layoutRows(seq(16));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0]?.steps, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(rows[1]?.steps, [8, 9, 10, 11, 12, 13, 14, 15]);
});

test('step indices stay absolute across row boundaries', () => {
  const rows = layoutRows(seq(16));
  // The regression this guards: a per-row index would renumber step 9 as 1,
  // which breaks the display, the playhead and the toggle target at once.
  assert.equal(rows[1]?.base, 8);
  assert.equal((rows[1]?.base ?? 0) + 0, 8);
  assert.equal(rows[0]?.steps[7], 7);
  assert.equal(rows[1]?.steps[0], 8);
});

test('the union of all rows is the original sequence, in order', () => {
  for (const n of [1, 4, 7, 8, 9, 12, 16, 17, 32, 64]) {
    const flat = layoutRows(seq(n)).flatMap((r) => r.steps);
    assert.deepEqual(flat, seq(n), `n=${n}`);
  }
});

test('rows are 8 wide and the last row is padded to match', () => {
  for (const n of [1, 5, 8, 9, 12, 16, 20, 32]) {
    for (const row of layoutRows(seq(n))) {
      assert.equal(row.steps.length + row.padding, STEPS_PER_ROW, `n=${n}`);
    }
  }
});

test('full rows need no padding', () => {
  for (const row of layoutRows(seq(32))) assert.equal(row.padding, 0);
});

test('a short final row is padded, so columns stay aligned', () => {
  const rows = layoutRows(seq(12));
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.padding, 0);
  // 4 steps in the second row leaves 4 spacers — without them the last four
  // cells would sit under the first four columns and the beat grid would shear.
  assert.equal(rows[1]?.padding, 4);
});

test('handles an empty grid without producing a phantom row', () => {
  assert.deepEqual(layoutRows([]), []);
});

test('a single step yields one padded row', () => {
  const rows = layoutRows(seq(1));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]?.steps, [0]);
  assert.equal(rows[0]?.padding, 7);
});

test('perRow is honoured and cannot be zero or negative', () => {
  assert.equal(layoutRows(seq(16), 4).length, 4);
  assert.equal(layoutRows(seq(16), 16).length, 1);
  // A width of 0 or less would loop forever; it clamps to 1 instead.
  assert.equal(layoutRows(seq(3), 0).length, 3);
  assert.equal(layoutRows(seq(3), -5).length, 3);
});

test('downbeats land every 4 steps regardless of wrapping', () => {
  assert.deepEqual(
    seq(16).filter((i) => isDownbeat(i)),
    [0, 4, 8, 12],
  );
  // Row starts are downbeats at 4 steps per beat, which is the point of 8-wide rows.
  for (const row of layoutRows(seq(16))) assert.ok(isDownbeat(row.base));
});

test('describeLayout reads as a sentence for the accessible name', () => {
  assert.equal(describeLayout(16), '16 steps in 2 rows of 8');
  assert.equal(describeLayout(8), '8 steps in 1 row of 8');
  assert.equal(describeLayout(12), '12 steps in 2 rows of 8');
});
