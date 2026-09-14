import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PPQN, clockInterval, collectClockTicks, collectDueSteps, stepDuration, stepTime,
  stepsDueForDisplay, swingDisplacement,
  type ClockCursor, type Cursor, type Tempo,
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

// --- clock generation -------------------------------------------------------

test('there are 24 clock ticks per quarter note', () => {
  assert.equal(PPQN, 24);
  // At 120 BPM a quarter note is 0.5s, so a tick is 0.5/24.
  assert.ok(Math.abs(clockInterval(120) - 0.5 / 24) < 1e-12);
  assert.ok(Math.abs(clockInterval(60) - 1 / 24) < 1e-12);
});

test('clockInterval survives a nonsense tempo', () => {
  assert.ok(Number.isFinite(clockInterval(0)));
  assert.ok(clockInterval(0) > 0);
  assert.ok(clockInterval(-10) > 0);
});

test('collectClockTicks returns the ticks due before the horizon', () => {
  const interval = clockInterval(120); // 0.02083s
  const cursor: ClockCursor = { tick: 0, time: 10 };
  const { times } = collectClockTicks(cursor, 120, 10 + interval * 3.5);
  // Ticks at 10, 10+i, 10+2i, 10+3i — four fit before 10+3.5i.
  assert.equal(times.length, 4);
  assert.ok(Math.abs((times[0] ?? 0) - 10) < 1e-12);
  assert.ok(Math.abs((times[3] ?? 0) - (10 + interval * 3)) < 1e-12);
});

test('collectClockTicks advances the cursor past the horizon', () => {
  const interval = clockInterval(120);
  const { cursor } = collectClockTicks({ tick: 0, time: 0 }, 120, interval * 3.5);
  assert.equal(cursor.tick, 4);
  assert.ok(cursor.time >= interval * 3.5);
});

test('a zero or negative horizon yields no ticks but still terminates', () => {
  assert.equal(collectClockTicks({ tick: 0, time: 0 }, 120, 0).times.length, 0);
  assert.equal(collectClockTicks({ tick: 0, time: 0 }, 120, -5).times.length, 0);
});

test('consecutive clock windows tile without gaps or duplicates', () => {
  let cursor: ClockCursor = { tick: 0, time: 0 };
  const seen: number[] = [];
  for (let w = 0; w < 200; w++) {
    const r = collectClockTicks(cursor, 128, (w + 1) * 0.025);
    seen.push(...r.times);
    cursor = r.cursor;
  }
  // Monotonic and evenly spaced: the property a rack following the clock needs.
  for (let i = 1; i < seen.length; i++) {
    assert.ok((seen[i] ?? 0) > (seen[i - 1] ?? 0), `tick ${i} not increasing`);
  }
  const interval = clockInterval(128);
  for (const t of seen) {
    const ratio = t / interval;
    assert.ok(Math.abs(ratio - Math.round(ratio)) < 1e-9, `tick at ${t} is off-grid`);
  }
});

test('the clock does not accumulate drift over a long run', () => {
  // Ten minutes at 128 BPM is 24 * 128 * 10 = 30720 ticks. Scheduled from a
  // cursor rather than recomputed, it must land exactly on the grid.
  const bpm = 128;
  let cursor: ClockCursor = { tick: 0, time: 0 };
  const HORIZON = 600;
  while (cursor.time < HORIZON) {
    cursor = collectClockTicks(cursor, bpm, cursor.time + 0.1).cursor;
  }
  const expectedTick = Math.floor(cursor.time / clockInterval(bpm));
  assert.ok(
    Math.abs(cursor.tick - expectedTick) <= 1,
    `drift: cursor at tick ${cursor.tick}, grid says ${expectedTick}`,
  );
});

test('a tempo change takes effect from the next tick, not retroactively', () => {
  const cursor: ClockCursor = { tick: 0, time: 0 };
  const slow = collectClockTicks(cursor, 60, clockInterval(60) * 2.5);
  assert.equal(slow.times.length, 3);

  // Resume from that cursor at double tempo: spacing halves, but the times
  // already emitted are untouched.
  const fast = collectClockTicks(slow.cursor, 120, slow.cursor.time + clockInterval(120) * 2.5);
  assert.equal(fast.times.length, 3);
  const gapFast = (fast.times[1] ?? 0) - (fast.times[0] ?? 0);
  assert.ok(Math.abs(gapFast - clockInterval(120)) < 1e-12);
  assert.ok(fast.times[0] === slow.cursor.time, 'the first new tick moved');
});
