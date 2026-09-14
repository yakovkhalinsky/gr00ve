import { test } from 'node:test';
import assert from 'node:assert/strict';

import { euclidCells } from './store.ts';

/**
 * Only the pure helpers are testable here. Anything touching Web Audio or Web
 * MIDI needs a real browser — see the brief's testing strategy: assert graph
 * and scheduling *state* in Vitest/OfflineAudioContext, and reserve Playwright
 * for real-browser smoke tests, where headless Chromium still has no audio
 * device and cannot be asserted on sound.
 */

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
  const scale = 'minorPentatonic' as const;
  const inScale = new Set([0, 3, 5, 7, 10]);
  for (const cell of euclidCells(7, 16, root, scale)) {
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
