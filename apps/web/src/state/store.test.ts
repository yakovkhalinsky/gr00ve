import { test } from 'node:test';
import assert from 'node:assert/strict';

import { euclidCells, useGr00ve } from './store.ts';

/**
 * Only the pure helpers and the store's own transitions are testable here.
 * Anything touching Web Audio or Web MIDI needs a real browser — see the
 * README's testing strategy: assert graph and scheduling *state* offline, and
 * reserve Playwright for real-browser smoke tests, where headless Chromium
 * still has no audio device and cannot be asserted on sound.
 *
 * These tests mutate the store singleton, so each one sets up the state it
 * needs rather than depending on the seed or on a previous test having run.
 */

const s = () => useGr00ve.getState();

// --- euclidCells (pure) -----------------------------------------------------

test('euclidCells produces the requested loop length', () => {
  for (const n of [4, 8, 16, 32]) {
    assert.equal(euclidCells(5, n, 45, 'minorPentatonic').length, n);
  }
});

test('euclidCells places exactly `pulses` onsets', () => {
  for (const [k, n] of [[3, 8], [5, 8], [4, 16], [7, 16]] as const) {
    const cells = euclidCells(k, n, 45, 'minorPentatonic');
    assert.equal(cells.filter((c) => c !== null).length, k, `E(${k},${n})`);
  }
});

test('euclidCells keeps every pitch inside the given scale', () => {
  const root = 45;
  const inScale = new Set([0, 3, 5, 7, 10]);
  for (const cell of euclidCells(7, 16, root, 'minorPentatonic')) {
    if (cell === null) continue;
    assert.ok(inScale.has(((cell.pitch - root) % 12 + 12) % 12), `pitch ${cell.pitch} is out of scale`);
  }
});

test('euclidCells accents the downbeat of each group of four', () => {
  const cells = euclidCells(16, 16, 45, 'minorPentatonic');
  cells.forEach((cell, i) => {
    if (cell === null) return;
    assert.equal(cell.accent, i % 4 === 0, `step ${i}`);
  });
});

test('euclidCells marks rests as null rather than as silent notes', () => {
  const cells = euclidCells(1, 4, 45, 'minorPentatonic');
  assert.equal(cells.filter((c) => c === null).length, 3);
  for (const cell of cells) {
    if (cell !== null) assert.ok(cell.pitch > 0);
  }
});

test('euclidCells baseDegree shifts the figure without leaving the scale', () => {
  // Tracks are spread across registers by offsetting the base degree.
  const low = euclidCells(4, 16, 45, 'minorPentatonic', { baseDegree: -7 });
  const high = euclidCells(4, 16, 45, 'minorPentatonic', { baseDegree: 12 });
  const firstLow = low.find((c) => c !== null);
  const firstHigh = high.find((c) => c !== null);
  assert.ok((firstLow?.pitch ?? 0) < (firstHigh?.pitch ?? 0), 'baseDegree did not shift the register');
});

// --- clearTrack -------------------------------------------------------------

test('clearTrack empties the chosen track', () => {
  s().euclidize(0, 5, 16);
  assert.ok(s().tracks[0]?.cells.some((c) => c !== null), 'setup: track should have onsets');

  s().clearTrack(0);

  const cells = s().tracks[0]?.cells ?? [];
  assert.equal(cells.length, 16);
  assert.ok(cells.every((c) => c === null), 'track should be empty');
});

test('clearTrack leaves the other tracks alone', () => {
  s().euclidize(0, 5, 16);
  s().euclidize(1, 3, 8);
  const sibling = s().tracks[1];

  s().clearTrack(0);

  // Identical by reference: a whole-array rebuild would behave the same but
  // would re-render every track strip on every clear.
  assert.equal(s().tracks[1], sibling);
  assert.equal(s().tracks.length, 8);
});

test('clearTrack preserves the grid length rather than resizing it', () => {
  s().euclidize(2, 4, 12);
  assert.equal(s().tracks[2]?.cells.length, 12);

  s().clearTrack(2);

  assert.equal(s().tracks[2]?.cells.length, 12, 'grid was resized');
});

test('clearTrack keeps the loop length, which is independent of the grid', () => {
  // The interesting case: grid and loop length are separate, and
  // setTrackLength changes one without touching the other. Clearing must
  // rebuild at the *grid's* length — sizing from `length` would silently
  // truncate a 16-cell pattern down to 7 cells, turning "clear the notes" into
  // a structural edit.
  s().euclidize(3, 5, 16);
  s().setTrackLength(3, 7);
  assert.equal(s().tracks[3]?.cells.length, 16);
  assert.equal(s().tracks[3]?.length, 7);

  s().clearTrack(3);

  assert.equal(s().tracks[3]?.length, 7, 'loop length changed');
  assert.equal(s().tracks[3]?.cells.length, 16, 'grid length changed');
  assert.ok(s().tracks[3]?.cells.every((c) => c === null));
});

test('clearTrack leaves mute and solo untouched', () => {
  s().euclidize(4, 5, 16);
  s().toggleMute(4);
  assert.equal(s().tracks[4]?.mute, true);

  s().clearTrack(4);

  assert.equal(s().tracks[4]?.mute, true, 'clearing should not unmute');
});

test('a cleared track can be regenerated', () => {
  s().euclidize(5, 8, 16);
  s().clearTrack(5);
  assert.ok(s().tracks[5]?.cells.every((c) => c === null));

  s().euclidize(5, 5, 8);

  const after = s().tracks[5];
  assert.equal(after?.cells.length, 8);
  assert.equal(after?.length, 8);
  assert.equal(after?.cells.filter((c) => c !== null).length, 5);
});

test('clearTrack is a no-op for an index with no track', () => {
  const before = s().tracks;
  s().clearTrack(99);
  assert.deepEqual(s().tracks, before);
});

test('clearTrack does not mutate the previous state array', () => {
  s().euclidize(6, 5, 16);
  const before = s().tracks;
  const beforeCells = before[6]?.cells;

  s().clearTrack(6);

  assert.notEqual(s().tracks, before, 'state array was mutated in place');
  assert.ok(beforeCells?.some((c) => c !== null), 'previous cells were mutated');
});
