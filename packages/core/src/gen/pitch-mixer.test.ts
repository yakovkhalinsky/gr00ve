import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pitchMixer, pickPitch, emptyMix, withWeight, DEFAULT_MIX, type PitchMix } from './pitch-mixer.ts';
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
