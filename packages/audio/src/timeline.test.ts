import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  stepDuration, swingDisplacement, stepTime, collectDueSteps, stepsDueForDisplay,
  type Tempo, type Cursor,
} from './timeline.ts';

const tempo = (over: Partial<Tempo> = {}): Tempo => ({ bpm: 120, stepsPerBeat: 4, swing: 0, ...over });

test('step duration follows tempo', () => {
  // 120 BPM = 0.5s/beat, 4 steps per beat = 0.125s per step.
  assert.ok(Math.abs(stepDuration(tempo()) - 0.125) < 1e-12);
  assert.ok(Math.abs(stepDuration(tempo({ bpm: 240 })) - 0.0625) < 1e-12);
  assert.ok(Math.abs(stepDuration(tempo({ stepsPerBeat: 2 })) - 0.25) < 1e-12);
});

test('swing displaces odd steps only', () => {
  assert.equal(swingDisplacement(0, 0.5), 0);
  assert.equal(swingDisplacement(2, 0.5), 0);
  assert.equal(swingDisplacement(4, 0.5), 0);
  assert.ok(swingDisplacement(1, 0.5) > 0);
  assert.ok(swingDisplacement(3, 0.5) > 0);
});

test('straight time means no displacement at all', () => {
  for (const i of [0, 1, 2, 3, 17]) assert.equal(swingDisplacement(i, 0), 0);
});

test('swing cannot push a step past the next one', () => {
  for (const swing of [0.5, 0.9, 1, 100]) {
    assert.ok(swingDisplacement(1, swing) < 1, `swing ${swing}`);
  }
});

test('step time is linear when straight', () => {
  const t = tempo();
  assert.ok(Math.abs(stepTime(0, 100, t) - 100) < 1e-12);
  assert.ok(Math.abs(stepTime(4, 100, t) - 100.5) < 1e-12);
});

test('swing never moves even steps, and always delays odd ones', () => {
  const t = tempo({ swing: 0.4 });
  // Even steps are untouched, so the downbeat stays exactly on the grid.
  assert.ok(Math.abs(stepTime(0, 0, t) - 0) < 1e-12);
  assert.ok(Math.abs(stepTime(2, 0, t) - 0.25) < 1e-12);
  // Odd steps land late.
  assert.ok(stepTime(1, 0, t) > 0.125);
});

test('swing preserves the bar length — it redistributes, never stretches', () => {
  // Four steps of a 16th grid must still occupy exactly one beat.
  const straight = tempo({ swing: 0 });
  const swung = tempo({ swing: 0.6 });
  assert.ok(Math.abs(stepTime(4, 0, straight) - stepTime(4, 0, swung)) < 1e-12);
});

test('collectDueSteps returns only steps before the horizon', () => {
  const t = tempo();
  const cursor: Cursor = { step: 0, time: 0 };
  // A 0.3s horizon at 0.125s per step: steps at 0, 0.125, 0.25.
  const { steps } = collectDueSteps(cursor, t, 0.3);
  assert.deepEqual(steps.map((s) => s.step), [0, 1, 2]);
  assert.ok(Math.abs((steps[2]?.time ?? 0) - 0.25) < 1e-12);
});

test('collectDueSteps advances the cursor past the horizon', () => {
  const t = tempo();
  const { cursor } = collectDueSteps({ step: 0, time: 0 }, t, 0.3);
  assert.equal(cursor.step, 3);
  assert.ok(cursor.time >= 0.3);
  assert.ok(Math.abs(cursor.time - 0.375) < 1e-12);
});

test('consecutive windows tile without gaps or overlaps', () => {
  const t = tempo();
  let cursor: Cursor = { step: 0, time: 0 };
  const seen: number[] = [];
  for (let w = 0; w < 40; w++) {
    const horizon = (w + 1) * 0.05;
    const r = collectDueSteps(cursor, t, horizon);
    for (const s of r.steps) seen.push(s.step);
    cursor = r.cursor;
  }
  // Every step exactly once, in order — the regression that would show up as
  // dropped or doubled notes.
  assert.deepEqual(seen, Array.from({ length: seen.length }, (_, i) => i));
});

test('the cursor does not drift against the audio clock over many bars', () => {
  const t = tempo({ bpm: 128, stepsPerBeat: 4, swing: 0.35 });
  let cursor: Cursor = { step: 0, time: 0 };
  const HORIZON = 120; // ten bars at 128 BPM
  while (cursor.time < HORIZON) cursor = collectDueSteps(cursor, t, cursor.time + 0.1).cursor;

  // With swing, the cursor must still agree with the closed-form step time:
  // swing redistributes within the grid but must not accumulate error.
  const expected = stepTime(cursor.step, 0, t);
  assert.ok(
    Math.abs(cursor.time - expected) < 1e-9,
    `drift: cursor ${cursor.time} vs closed form ${expected}`,
  );
});

test('swing is applied at the right parity inside the window', () => {
  const t = tempo({ swing: 0.5 });
  const { steps } = collectDueSteps({ step: 0, time: 0 }, t, 0.5);
  const byStep = new Map(steps.map((s) => [s.step, s.time]));
  // Step 0 straight, step 1 late, step 2 back on the uns swung grid.
  assert.ok(Math.abs((byStep.get(0) ?? -1) - 0) < 1e-12);
  assert.ok((byStep.get(1) ?? 0) > stepDuration(t));
  assert.ok(Math.abs((byStep.get(2) ?? -1) - 2 * stepDuration(t)) < 1e-12);
});

test('a zero or negative horizon yields no steps but still terminates', () => {
  const t = tempo();
  assert.equal(collectDueSteps({ step: 0, time: 0 }, t, 0).steps.length, 0);
  assert.equal(collectDueSteps({ step: 0, time: 0 }, t, -5).steps.length, 0);
});

test('display queue releases steps only once the clock reaches them', () => {
  const queue = [
    { step: 0, time: 10 },
    { step: 1, time: 10.125 },
    { step: 2, time: 10.25 },
  ];
  // Nothing is due before the first step.
  assert.deepEqual(stepsDueForDisplay(queue, 9.9).due.map((e) => e.step), []);
  assert.deepEqual(stepsDueForDisplay(queue, 9.9).rest.length, 3);
  // The first is due, the rest are not — this is what stops the playhead
  // leading the sound by the scheduler's lookahead.
  assert.deepEqual(stepsDueForDisplay(queue, 10.05).due.map((e) => e.step), [0]);
  assert.deepEqual(stepsDueForDisplay(queue, 10.3).due.map((e) => e.step), [0, 1, 2]);
});

test('a step exactly at the clock is due, not deferred', () => {
  const queue = [{ step: 0, time: 10 }];
  assert.deepEqual(stepsDueForDisplay(queue, 10).due.map((e) => e.step), [0]);
});
