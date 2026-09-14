import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  grid, step, rotate, retrograde, palindrome, invert, transpose, thin, thicken,
  setGate, accent, humanize, shuffle, ratchet, applyEvery, type StepGrid,
} from './step.ts';
import { makeRng } from '../gen/rng.ts';

const g = grid([60, null, 62, null, 64, null, 65, null]);

const pitches = (x: StepGrid) => x.map((s) => (s === null ? null : s.pitch));

test('grid builds onsets and rests', () => {
  assert.equal(g.length, 8);
  assert.equal(g[0]?.pitch, 60);
  assert.equal(g[1], null);
});

test('step applies defaults and overrides', () => {
  const s = step(60, { accent: true });
  assert.equal(s.pitch, 60);
  assert.equal(s.accent, true);
  assert.equal(s.slide, false);
  // The 303's hardware duty cycle.
  assert.ok(Math.abs(s.gate - 0.58) < 1e-9);
});

test('rotate shifts and wraps in both directions', () => {
  assert.deepEqual(pitches(rotate(g, 1)), [null, 60, null, 62, null, 64, null, 65]);
  assert.deepEqual(pitches(rotate(g, -1)), [null, 62, null, 64, null, 65, null, 60]);
  assert.deepEqual(pitches(rotate(g, 8)), pitches(g));
  assert.deepEqual(pitches(rotate(g, 0)), pitches(g));
  // Rotating past the length wraps rather than failing.
  assert.deepEqual(pitches(rotate(g, 9)), pitches(rotate(g, 1)));
  assert.deepEqual(pitches(rotate(g, -9)), pitches(rotate(g, -1)));
  // Rotating by n then -n is the identity.
  assert.deepEqual(pitches(rotate(rotate(g, 3), -3)), pitches(g));
});

test('rotate returns a fresh array when it actually moves', () => {
  // Identity rotations may return the input; a real rotation must not alias it,
  // or the React layer would see a stale reference and skip the re-render.
  assert.notEqual(rotate(g, 1), g);
  assert.equal(rotate(g, 0), g);
});

test('retrograde is its own inverse', () => {
  assert.deepEqual(pitches(retrograde(retrograde(g))), pitches(g));
});

test('palindrome doubles the loop', () => {
  const p = palindrome(g);
  assert.equal(p.length, 16);
  assert.deepEqual(pitches(p).slice(0, 8), pitches(g));
  assert.deepEqual(pitches(p).slice(8), pitches(g).reverse());
});

test('invert reflects pitch and leaves the rhythm untouched', () => {
  const inv = invert(g, 64);
  assert.deepEqual(pitches(inv), [68, null, 66, null, 64, null, 63, null]);
  // Rests stay rests — inversion must not disturb the groove.
  assert.deepEqual(inv.map((s) => s === null), g.map((s) => s === null));
  assert.deepEqual(pitches(invert(inv, 64)), pitches(g));
});

test('transpose shifts and clamps to the MIDI range', () => {
  assert.deepEqual(pitches(transpose(g, 12)), [72, null, 74, null, 76, null, 77, null]);
  const high = transpose(grid([120]), 20);
  assert.equal(high[0]?.pitch, 127);
  const low = transpose(grid([2]), -20);
  assert.equal(low[0]?.pitch, 0);
});

test('thin saturates at both ends', () => {
  const rng = makeRng(1);
  assert.deepEqual(pitches(thin(g, 0, rng)), pitches(g));
  assert.ok(thin(g, 1, rng).every((s) => s === null));
});

test('thicken only ever adds onsets', () => {
  const rng = makeRng(2);
  const t = thicken(g, 0.5, rng);
  assert.equal(t.length, g.length);
  for (let i = 0; i < g.length; i++) {
    if (g[i] !== null) assert.notEqual(t[i], null, 'existing onset was removed');
  }
});

test('setGate scales and clamps', () => {
  const s = setGate(g, 2);
  assert.ok(Math.abs((s[0]?.gate ?? 0) - 1.16) < 1e-9);
  assert.equal(setGate(g, 100)[0]?.gate, 4);
  assert.equal(setGate(g, 0)[0]?.gate, 0);
});

test('accent saturates', () => {
  const rng = makeRng(3);
  assert.ok(accent(g, 1, rng).every((s) => s === null || s.accent));
  assert.ok(accent(g, 0, rng).every((s) => s === null || !s.accent));
});

test('humanize keeps velocity in range', () => {
  const rng = makeRng(4);
  for (const s of humanize(g, 1, rng)) {
    if (s) assert.ok(s.velocity >= 0 && s.velocity <= 1, `velocity ${s.velocity}`);
  }
});

test('shuffle preserves the multiset of onsets', () => {
  const rng = makeRng(5);
  const s = shuffle(g, rng);
  assert.deepEqual([...pitches(s)].sort(), [...pitches(g)].sort());
});

test('ratchet subdivides without losing onsets', () => {
  const r = ratchet(g, 3);
  assert.equal(r.length, 24);
  assert.equal(r.filter((x) => x !== null).length, g.filter((x) => x !== null).length * 3);
});

test('applyEvery fires on the right passes', () => {
  const doubled = (x: StepGrid) => transpose(x, 12);
  assert.deepEqual(pitches(applyEvery(g, 0, 4, doubled)), pitches(doubled(g)));
  assert.deepEqual(pitches(applyEvery(g, 4, 4, doubled)), pitches(doubled(g)));
  assert.deepEqual(pitches(applyEvery(g, 1, 4, doubled)), pitches(g));
  assert.deepEqual(pitches(applyEvery(g, 3, 4, doubled)), pitches(g));
  // n <= 0 is a no-op rather than a crash.
  assert.deepEqual(pitches(applyEvery(g, 0, 0, doubled)), pitches(g));
});

test('transforms do not mutate their input', () => {
  const before = JSON.stringify(g);
  const rng = makeRng(6);
  rotate(g, 3);
  retrograde(g);
  invert(g, 60);
  transpose(g, 5);
  thin(g, 0.5, rng);
  shuffle(g, rng);
  assert.equal(JSON.stringify(g), before);
});
