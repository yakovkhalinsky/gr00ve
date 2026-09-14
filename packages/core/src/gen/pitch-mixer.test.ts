import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pitchMixer, pickPitch, pickPitchOnly, emptyMix, withWeight, DEFAULT_MIX, type PitchMix,
} from './pitch-mixer.ts';
import { euclid } from './euclid.ts';
import { makeRng } from './rng.ts';

const pitches = (m: PitchMix, steps: number, seed: number) =>
  pitchMixer(m, steps, makeRng(seed)).map((s) => (s === null ? null : s.pitch));

test('is deterministic for a given seed', () => {
  assert.deepEqual(pitches(DEFAULT_MIX, 64, 7), pitches(DEFAULT_MIX, 64, 7));
});

test('different seeds give different phrases', () => {
  assert.notDeepEqual(pitches(DEFAULT_MIX, 64, 1), pitches(DEFAULT_MIX, 64, 2));
});

test('produces the requested loop length', () => {
  for (const n of [1, 8, 16, 64]) {
    assert.equal(pitchMixer(DEFAULT_MIX, n, makeRng(1)).length, n);
  }
});

test('a zero weight is never selected', () => {
  // Only the root is weighted; no scale, so nothing can be snapped in.
  const mix: PitchMix = { ...emptyMix(60), weights: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], restProbability: 0 };
  const got = pitches(mix, 200, 3);
  assert.ok(got.every((p) => p === 60), `expected only 60, saw ${[...new Set(got)].join(',')}`);
});

test('withWeight leaves other weights alone and is immutable', () => {
  const a = emptyMix(60);
  const b = withWeight(a, 3, 5);
  assert.equal(b.weights[3], 5);
  assert.equal(a.weights[3], 0, 'original was mutated');
  assert.equal(b.weights.length, 12);
});

test('withWeight normalises out-of-range semitones', () => {
  const m = withWeight(emptyMix(), 15, 2); // 15 % 12 === 3
  assert.equal(m.weights[3], 2);
  const neg = withWeight(emptyMix(), -1, 2); // -1 wraps to 11
  assert.equal(neg.weights[11], 2);
});

test('restProbability saturates at 1', () => {
  const mix: PitchMix = { ...DEFAULT_MIX, restProbability: 1 };
  assert.ok(pitchMixer(mix, 32, makeRng(1)).every((s) => s === null));
});

test('restProbability 0 never rests', () => {
  const mix: PitchMix = { ...DEFAULT_MIX, restProbability: 0 };
  assert.ok(pitchMixer(mix, 200, makeRng(2)).every((s) => s !== null));
});

test('all pitches stay in the MIDI range', () => {
  const high: PitchMix = { ...DEFAULT_MIX, root: 120, octaves: [1, 1, 1] };
  const low: PitchMix = { ...DEFAULT_MIX, root: 1, octaves: [1] };
  for (const p of pitches(high, 100, 4)) assert.ok(p === null || (p >= 0 && p <= 127), `got ${p}`);
  for (const p of pitches(low, 100, 5)) assert.ok(p === null || (p >= 0 && p <= 127), `got ${p}`);
});

test('pickPitchOnly never rests, whatever the rest probability', () => {
  // The rest decision is separated from the pitch decision precisely so a
  // rhythm gate can own the former without the latter interfering.
  const mix: PitchMix = { ...DEFAULT_MIX, restProbability: 1 };
  const rng = makeRng(1);
  for (let i = 0; i < 200; i++) assert.notEqual(pickPitchOnly(mix, rng), null);
  // ...while the combined picker still rests, as before.
  assert.equal(pickPitch(mix, makeRng(1)), null);
});

test('pickPitch can return null only when resting is possible', () => {
  const mix: PitchMix = { ...DEFAULT_MIX, restProbability: 0 };
  const rng = makeRng(9);
  for (let i = 0; i < 500; i++) assert.notEqual(pickPitch(mix, rng), null);
});

test('an optional scale confines output to that scale', () => {
  const mix: PitchMix = { ...DEFAULT_MIX, scale: 'minorPentatonic', root: 57, restProbability: 0, octaves: [1, 1] };
  const got = pitches(mix, 300, 11).filter((p): p is number => p !== null);
  for (const p of got) {
    assert.ok([0, 3, 5, 7, 10].includes(((p - 57) % 12 + 12) % 12), `${p} is outside A minor pentatonic`);
  }
});

test('accent and slide probabilities saturate', () => {
  const none: PitchMix = { ...DEFAULT_MIX, restProbability: 0, accentProbability: 0, slideProbability: 0 };
  const all: PitchMix = { ...DEFAULT_MIX, restProbability: 0, accentProbability: 1, slideProbability: 1 };
  const gNone = pitchMixer(none, 100, makeRng(1));
  const gAll = pitchMixer(all, 100, makeRng(1));
  assert.ok(gNone.every((s) => s === null || (!s.accent && !s.slide)));
  assert.ok(gAll.every((s) => s === null || (s.accent && s.slide)));
});

// --- composition with a rhythm gate (Euclidean + mixer) ---------------------
//
// The two generators compose: the gate answers "when", the mix answers "what".
// These tests pin that split, because the failure mode is subtle — a second
// rest roll on top of a gate punches holes in a rhythm the performer dialled
// in, and it looks like the Euclidean generator being broken.

/** E(3,8) as a gate. */
const GATE_3_8 = [true, false, false, true, false, false, true, false];

test('a gate decides exactly which steps sound', () => {
  const cells = pitchMixer({ ...DEFAULT_MIX, restProbability: 0 }, 8, makeRng(1), GATE_3_8);
  assert.equal(cells.length, 8);
  cells.forEach((cell, i) => {
    assert.equal(cell !== null, GATE_3_8[i] === true, `step ${i} did not follow the gate`);
  });
});

test('a gate is honoured even when the mix would rest constantly', () => {
  // restProbability 1 means "always rest" in the ungated path. With a gate it
  // must be ignored, or a Euclidean pattern with three onsets would come back
  // empty and read as a bug in the Euclid generator.
  const cells = pitchMixer({ ...DEFAULT_MIX, restProbability: 1 }, 8, makeRng(1), GATE_3_8);
  assert.equal(cells.filter((c) => c !== null).length, 3);
});

test('a gate keeps the onset count, for every k and n', () => {
  for (const [k, n] of [[3, 8], [5, 8], [4, 16], [7, 16]] as const) {
    const gate = Array.from({ length: n }, (_, i) => euclid(k, n)[i] === true);
    const cells = pitchMixer(DEFAULT_MIX, n, makeRng(2), gate);
    assert.equal(cells.filter((c) => c !== null).length, k, `E(${k},${n})`);
  }
});

test('with a gate, accent follows the metre rather than the mix', () => {
  // Accent placement is part of a rhythm, not part of a pitch choice — so the
  // mix's accentProbability must not scramble where the accents fall.
  const cells = pitchMixer({ ...DEFAULT_MIX, accentProbability: 0 }, 16, makeRng(3), euclid(16, 16));
  cells.forEach((cell, i) => {
    if (cell === null) return;
    assert.equal(cell.accent, i % 4 === 0, `step ${i}`);
  });
});

test('with a gate, a zero-weight semitone is still never chosen', () => {
  const mix: PitchMix = {
    ...emptyMix(60), weights: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], restProbability: 0, octaves: [1],
  };
  const cells = pitchMixer(mix, 8, makeRng(4), GATE_3_8);
  for (const cell of cells) {
    if (cell !== null) assert.equal(cell.pitch, 60, `got ${cell.pitch}`);
  }
});

test('changing the weights changes which pitches a gate yields', () => {
  // This is the property the UI depends on: the faders must be audible through
  // the generate button, using the same seed.
  const gate = euclid(5, 8);
  const low: PitchMix = { ...DEFAULT_MIX, weights: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
  const high: PitchMix = { ...DEFAULT_MIX, weights: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] };
  const a = pitchMixer(low, 8, makeRng(99), gate).map((c) => c?.pitch ?? null);
  const b = pitchMixer(high, 8, makeRng(99), gate).map((c) => c?.pitch ?? null);
  assert.notDeepEqual(a, b);
});

test('a gated render is deterministic for a given seed', () => {
  const a = pitchMixer(DEFAULT_MIX, 16, makeRng(7), euclid(5, 16));
  const b = pitchMixer(DEFAULT_MIX, 16, makeRng(7), euclid(5, 16));
  assert.deepEqual(a, b);
});

test('a gate shorter than the loop does not crash', () => {
  // Defensive: callers pass a mask from the same k/n, but an off-by-one here
  // should rest rather than throw.
  const cells = pitchMixer(DEFAULT_MIX, 8, makeRng(1), [true, true]);
  assert.equal(cells.length, 8);
  assert.equal(cells.filter((c) => c !== null).length, 2);
});
