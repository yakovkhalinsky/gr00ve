import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STEPS_PER_ROW, describeLayout, isDownbeat, isOutsideLoop, layoutRows, stepAriaLabel,
  stepNoteText,
} from './stepLayout.ts';

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

// --- step labels ------------------------------------------------------------

test('a voice step shows its note name, with the octave', () => {
  assert.equal(stepNoteText(60, true), 'C4');
  assert.equal(stepNoteText(57, true), 'A3');
  assert.equal(stepNoteText(61, true), 'C#4');
});

test('the octave is part of the label, which is the point', () => {
  // The mixer's octave weight means two steps of the same pitch class can sit
  // an octave apart. Without the octave that is invisible in the grid.
  assert.notEqual(stepNoteText(60, true), stepNoteText(72, true));
});

test('a rest shows nothing', () => {
  assert.equal(stepNoteText(null, true), '');
  assert.equal(stepNoteText(undefined, true), '');
});

test('a rhythm track shows nothing even though its cells hold pitches', () => {
  // Drum cells keep their pitches so switching back to a voice restores the
  // melody, but the drum ignores them — labelling a kick "C4" would assert
  // something false about what is played.
  assert.equal(stepNoteText(60, false), '');
  assert.equal(stepNoteText(38, false), '');
});

test('an extreme pitch still renders as a short label', () => {
  // The cells are 44px, so a label must stay within about three characters.
  for (const pitch of [0, 127, 21, 108]) {
    const label = stepNoteText(pitch, true);
    assert.ok(label.length > 0 && label.length <= 3, `${pitch} gave "${label}"`);
  }
});

test('the accessible name carries position, state and note', () => {
  assert.equal(
    stepAriaLabel('Track 1', 4, { on: true, accent: false, note: 'C4' }),
    'Track 1, step 5, on, C4',
  );
  assert.equal(
    stepAriaLabel('Track 1', 0, { on: true, accent: true, note: 'A3' }),
    'Track 1, step 1, accented, A3',
  );
  assert.equal(
    stepAriaLabel('Track 1', 9, { on: false, accent: false, note: '' }),
    'Track 1, step 10, off',
  );
});

test('the accessible name omits the note when none is shown', () => {
  // A trailing empty segment is announced as a pause, and on a rhythm track
  // there is no note to announce in the first place.
  const label = stepAriaLabel('Track 5', 2, { on: true, accent: false, note: '' });
  assert.equal(label, 'Track 5, step 3, on');
  assert.ok(!label.endsWith(',') && !label.includes(', ,'), `trailing empty segment in "${label}"`);
});

// --- loop boundary ----------------------------------------------------------

test('steps beyond the loop length are outside it', () => {
  // The playhead wraps at the loop length, so index 5 of a 5-step loop is
  // never reached — the counter goes 0..4 and back to 0.
  assert.equal(isOutsideLoop(4, 5, 16), false);
  assert.equal(isOutsideLoop(5, 5, 16), true);
  assert.equal(isOutsideLoop(15, 5, 16), true);
});

test('a loop covering the whole pattern dims nothing', () => {
  for (let i = 0; i < 16; i++) {
    assert.equal(isOutsideLoop(i, 16, 16), false, `step ${i} should be inside`);
  }
});

test('a loop longer than the pattern dims nothing rather than everything', () => {
  // The store refuses to set one, but a component must not depend on that —
  // and clamping the wrong way here would grey out the entire grid.
  for (let i = 0; i < 16; i++) {
    assert.equal(isOutsideLoop(i, 40, 16), false, `step ${i}`);
  }
});

test('a degenerate loop length still leaves a playable step', () => {
  // Zero or negative would otherwise dim everything including step 0.
  assert.equal(isOutsideLoop(0, 0, 16), false);
  assert.equal(isOutsideLoop(1, 0, 16), true);
  assert.equal(isOutsideLoop(0, -5, 16), false);
});

test('an empty pattern has no outside steps', () => {
  assert.equal(isOutsideLoop(0, 0, 0), false);
});

test('the accessible name says when a step is outside the loop', () => {
  // Dimming conveys this to sighted users only; the label has to carry it too.
  assert.equal(
    stepAriaLabel('Track 1', 9, { on: true, accent: false, note: 'C4', outside: true }),
    'Track 1, step 10, on, C4, outside loop',
  );
  assert.equal(
    stepAriaLabel('Track 1', 3, { on: true, accent: false, note: 'C4', outside: false }),
    'Track 1, step 4, on, C4',
  );
});
