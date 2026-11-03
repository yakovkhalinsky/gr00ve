import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PATTERN_LENGTH, initialTrackerSnapshot, useTracker } from './state.ts';

/**
 * The store's pure transitions. Nothing here touches Web Audio or the DOM, so
 * `node --test` covers it; the preview and the download are browser-only and
 * are exercised by the page.
 */
beforeEach(() => {
  useTracker.setState(initialTrackerSnapshot());
});

const s = () => useTracker.getState();

test('the initial snapshot is internally consistent', () => {
  const state = s();
  assert.equal(state.tracks.length, 8);
  assert.equal(state.turingBits.length, 8);
  assert.equal(state.patternLength, DEFAULT_PATTERN_LENGTH);
  assert.equal(state.generated.length, DEFAULT_PATTERN_LENGTH);
  assert.equal(state.generated.tracks.length, 8);
  for (let i = 0; i < 8; i++) {
    assert.equal(state.generated.tracks[i]?.steps.length, DEFAULT_PATTERN_LENGTH);
  }
});

test('regenerate advances the seed and changes the pattern', () => {
  const before = s();
  before.regenerate();
  const after = s();
  assert.equal(after.seed, (before.seed + 1) >>> 0);
  assert.notDeepEqual(after.generated, before.generated);
});

test('editing one track leaves the others exactly alone', () => {
  const before = s().generated;
  s().updateTrack(0, { euclid: { hits: 7 } });
  const after = s();
  assert.equal(after.tracks[0]?.euclid.hits, 7);
  for (let i = 1; i < 8; i++) {
    assert.deepEqual(after.generated.tracks[i]?.steps, before.tracks[i]?.steps);
  }
});

test('FX toggles keep the two-slot rule and probability keeps Chance', () => {
  // Track 0 defaults to velocity only. Roll then micro would be a third, so
  // velocity is dropped rather than overflowing the file.
  s().setFx(0, 'roll', true);
  assert.deepEqual(s().tracks[0]?.fx, { chance: false, roll: true, micro: false, velocity: true });
  s().setFx(0, 'micro', true);
  assert.deepEqual(s().tracks[0]?.fx, { chance: false, roll: true, micro: true, velocity: false });

  // Track 2 is a probability track: Chance is structural and cannot be turned off.
  s().setFx(2, 'chance', false);
  assert.equal(s().tracks[2]?.fx.chance, true);
});

test('roll division is capped to what the code can encode', () => {
  s().updateTrack(0, { roll: { type: 5, division: 8 } });
  assert.equal(s().tracks[0]?.roll.division, 2);
  assert.equal(s().tracks[0]?.roll.type, 5);
});

test('switching to Turing seeds a register', () => {
  s().updateTrack(6, { generator: 'turing' });
  const state = s();
  assert.equal(state.tracks[6]?.generator, 'turing');
  assert.ok((state.turingBits[6]?.length ?? 0) > 0);
  assert.equal(state.generated.tracks[6]?.turingBits.length, state.turingBits[6]?.length);
});

test('mutate flips the loop at full mutation; lock stops it', () => {
  s().setSelected(3); // default Turing track
  s().updateTrack(3, { turing: { mutation: 1 } });
  const before = [...(s().turingBits[3] ?? [])];

  s().mutateSelected();
  const after = [...(s().turingBits[3] ?? [])];
  assert.deepEqual(after, before.map((bit) => !bit));

  s().lockSelected();
  assert.equal(s().tracks[3]?.turing.mutation, 0);
  const locked = [...(s().turingBits[3] ?? [])];
  s().mutateSelected();
  assert.deepEqual(s().turingBits[3], locked);
});

test('changing the Turing length reseeds its register', () => {
  s().updateTrack(3, { turing: { length: 4 } });
  assert.equal(s().turingBits[3]?.length, 4);
  assert.equal(s().generated.tracks[3]?.turingBits.length, 4);
});

test('pattern length is restricted to the four the Tracker accepts', () => {
  s().setPatternLength(128);
  assert.equal(s().patternLength, 128);
  assert.equal(s().generated.tracks[0]?.steps.length, 128);

  s().setPatternLength(16);
  assert.equal(s().patternLength, 16);
  assert.equal(s().generated.tracks[0]?.steps.length, 16);

  s().setPatternLength(37);
  assert.equal(s().patternLength, DEFAULT_PATTERN_LENGTH);
});

test('a new seed reseeds every Turing register', () => {
  s().setSeed(42);
  assert.equal(s().seed, 42);
  assert.equal(s().turingBits.length, 8);
  for (const bits of s().turingBits) assert.ok(bits.length > 0);
});
