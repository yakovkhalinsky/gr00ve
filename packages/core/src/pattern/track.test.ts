import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACK_KINDS, TRACK_KIND_LABELS, DRUM_TYPES, DRUM_LABELS, DEFAULT_KIT,
  isTrackKind, isDrumType,
} from './track.ts';

test('every track kind has a label', () => {
  for (const kind of TRACK_KINDS) {
    assert.ok(TRACK_KIND_LABELS[kind]?.length > 0, `${kind} has no label`);
  }
});

test('every drum type has a label', () => {
  for (const drum of DRUM_TYPES) {
    assert.ok(DRUM_LABELS[drum]?.length > 0, `${drum} has no label`);
  }
});

test('labels are distinct, so a picker is unambiguous', () => {
  const labels = DRUM_TYPES.map((d) => DRUM_LABELS[d]);
  assert.equal(new Set(labels).size, labels.length);
  const kindLabels = TRACK_KINDS.map((k) => TRACK_KIND_LABELS[k]);
  assert.equal(new Set(kindLabels).size, kindLabels.length);
});

test('isTrackKind accepts only the two kinds', () => {
  assert.ok(isTrackKind('voice'));
  assert.ok(isTrackKind('rhythm'));
  for (const bad of ['Voice', 'drum', '', null, undefined, 0, {}]) {
    assert.equal(isTrackKind(bad), false, `${String(bad)} should be rejected`);
  }
});

test('isDrumType accepts only known drums', () => {
  for (const drum of DRUM_TYPES) assert.ok(isDrumType(drum), drum);
  for (const bad of ['Kick', 'cowbell', '', null, undefined, 3, []]) {
    assert.equal(isDrumType(bad), false, `${String(bad)} should be rejected`);
  }
});

test('the default kit is a usable spread across eight tracks', () => {
  assert.equal(DEFAULT_KIT.length, 8);
  for (const drum of DEFAULT_KIT) assert.ok(isDrumType(drum), `${drum} is not a drum`);
  // A kit with no kick is not a kit.
  assert.ok(DEFAULT_KIT.includes('kick'));
  assert.ok(DEFAULT_KIT.includes('snare') || DEFAULT_KIT.includes('clap'));
  // Hats and claps should not be the only textural options.
  assert.ok(new Set(DEFAULT_KIT).size >= 4, 'kit should use at least four distinct sounds');
});
