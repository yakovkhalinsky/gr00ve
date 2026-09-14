import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCALES, SCALE_NAMES, inScale, quantizeNearest, degreeToPitch, pitchToDegree,
  scalePitches, noteName,
} from './scale.ts';

test('all modes have the expected interval counts', () => {
  for (const name of SCALE_NAMES) {
    const set = SCALES[name];
    assert.ok(set.length >= 5, name);
    assert.equal(new Set(set).size, set.length, `${name} has duplicates`);
    assert.equal(set[0], 0, `${name} must start at the root`);
    for (const s of set) assert.ok(s >= 0 && s < 12, `${name} out of range: ${s}`);
  }
});

test('inScale recognises membership', () => {
  // A minor pentatonic from A: A C D E G — i.e. 57, 60, 62, 64, 67.
  assert.ok(inScale(57, 57, 'minorPentatonic'));
  assert.ok(inScale(60, 57, 'minorPentatonic'));
  assert.ok(!inScale(58, 57, 'minorPentatonic'));
  // Membership is octave-independent.
  assert.ok(inScale(69, 57, 'minorPentatonic'));
  // And works below the root: G3 (55) is the flat seventh, F3 (53) is not in it.
  assert.ok(inScale(55, 57, 'minorPentatonic'));
  assert.ok(!inScale(53, 57, 'minorPentatonic'));
});

test('quantizeNearest snaps to the closest in-scale pitch', () => {
  // 61 is a semitone above C; C is in A minor pentatonic, C# is not.
  assert.equal(quantizeNearest(61, 57, 'minorPentatonic'), 60);
  // An in-scale note is left alone.
  assert.equal(quantizeNearest(60, 57, 'minorPentatonic'), 60);
  // Ties resolve downward, deterministically.
  const tie = quantizeNearest(56, 57, 'minorPentatonic');
  assert.ok([55, 57].includes(tie), `expected 55 or 57, got ${tie}`);
});

test('quantizeNearest never moves a note more than a tone in these modes', () => {
  for (const name of SCALE_NAMES) {
    for (let p = 48; p < 84; p++) {
      const q = quantizeNearest(p, 57, name);
      assert.ok(inScale(q, 57, name), `${p} -> ${q} not in ${name}`);
      assert.ok(Math.abs(q - p) <= 2, `${p} -> ${q} moved too far in ${name}`);
    }
  }
});

test('degreeToPitch walks the scale and wraps octaves upward', () => {
  // Minor pentatonic is 5 notes, so degree 5 is the octave.
  assert.equal(degreeToPitch(57, 'minorPentatonic', 0), 57);
  assert.equal(degreeToPitch(57, 'minorPentatonic', 1), 60);
  assert.equal(degreeToPitch(57, 'minorPentatonic', 5), 69);
  assert.equal(degreeToPitch(57, 'minorPentatonic', 10), 81);
});

test('degreeToPitch wraps downward for negative degrees', () => {
  assert.equal(degreeToPitch(57, 'minorPentatonic', -1), 55);
  assert.equal(degreeToPitch(57, 'minorPentatonic', -5), 45);
});

test('degreeToPitch always lands in the scale', () => {
  for (const name of SCALE_NAMES) {
    for (let d = -24; d <= 24; d++) {
      const p = degreeToPitch(57, name, d);
      assert.ok(inScale(p, 57, name), `degree ${d} of ${name} -> ${p}`);
    }
  }
});

test('degree mapping and inversion are consistent', () => {
  for (const name of SCALE_NAMES) {
    for (let d = -12; d <= 24; d++) {
      const p = degreeToPitch(57, name, d);
      assert.equal(pitchToDegree(p, 57, name), d, `${name} degree ${d}`);
    }
  }
});

test('scalePitches returns the requested span', () => {
  const p = scalePitches(57, 'minorPentatonic', 2);
  assert.equal(p.length, 10);
  assert.equal(p[0], 57);
  assert.ok(p.every((x) => inScale(x, 57, 'minorPentatonic')));
});

test('noteName renders octaves the way MIDI does', () => {
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(57), 'A3');
  assert.equal(noteName(0), 'C-1');
  assert.equal(noteName(127), 'G9');
});
