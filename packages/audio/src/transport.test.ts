import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fraction, grid } from '@gr00ve/core';
import {
  stepSeconds, trackLength, swingOffset, realignSteps, trackStep, stepAt,
  isAudible, type Track, type TransportState,
} from './transport.ts';

const track = (over: Partial<Track> = {}): Track => ({
  id: 't', name: 'Track', grid: grid([60, null, 62, null]), ...over,
});

const state = (over: Partial<TransportState> = {}): TransportState => ({
  bpm: 120, stepsPerBeat: 4, swing: 0, tracks: [], ...over,
});

test('step duration follows tempo', () => {
  // 120 BPM = 0.5s per beat; 4 steps per beat = 0.125s per step.
  assert.ok(Math.abs(stepSeconds(state()) - 0.125) < 1e-12);
  assert.ok(Math.abs(stepSeconds(state({ bpm: 240 })) - 0.0625) < 1e-12);
});

test('track length defaults to the grid length', () => {
  assert.equal(trackLength(track()), 4);
  assert.equal(trackLength(track({ length: 12 })), 12);
});

test('swing pushes odd steps late and leaves even steps alone', () => {
  assert.equal(fraction.show(swingOffset(0, 0.4)), '0');
  assert.equal(fraction.show(swingOffset(2, 0.4)), '0');
  assert.notEqual(fraction.show(swingOffset(1, 0.4)), '0');
  // Swing of 0 is straight, at every step.
  assert.equal(fraction.show(swingOffset(1, 0)), '0');
});

test('swing can never push a step into or past the following one', () => {
  // The real invariant is offset < 1 step, even for absurd input.
  for (const swing of [0.5, 0.9, 1, 5, 100]) {
    const off = fraction.toNumber(swingOffset(1, swing));
    assert.ok(off >= 0 && off < 1, `swing ${swing} gave an offset of ${off} steps`);
  }
});

test('swing offset grows monotonically with the control', () => {
  const at = (s: number) => fraction.toNumber(swingOffset(1, s));
  assert.ok(at(0.2) < at(0.5));
  assert.ok(at(0.5) < at(0.8));
});

test('swing offset is exact — a triplet swing does not drift', () => {
  // 2/3 of a step is the classic triplet swing.
  const offset = swingOffset(1, 2 / 3);
  assert.equal(fraction.show(offset), '1/3');
});

test('realignSteps is the exact LCM of the track lengths — the polymeter period', () => {
  const s = state({
    tracks: [track({ length: 16 }), track({ length: 12 }), track({ length: 7 })],
  });
  // lcm(16,12,7) = 336 steps ~= 21 bars of 16 steps, from 35 stored steps.
  assert.equal(realignSteps(s), 336);
});

test('realignSteps handles simple and degenerate cases', () => {
  assert.equal(realignSteps(state({ tracks: [track({ length: 8 })] })), 8);
  assert.equal(realignSteps(state({ tracks: [track({ length: 16 }), track({ length: 16 })] })), 16);
  assert.equal(realignSteps(state()), 0);
});

test('trackStep wraps within each track’s own loop', () => {
  const t = track({ length: 4 });
  assert.equal(trackStep(t, 0), 0);
  assert.equal(trackStep(t, 3), 3);
  assert.equal(trackStep(t, 4), 0);
  assert.equal(trackStep(t, 5), 1);
  // Different lengths drift against each other — the source of the variation.
  const seven = track({ length: 7 });
  assert.equal(trackStep(seven, 4), 4);
  assert.equal(trackStep(seven, 7), 0);
});

test('speed advances a track faster than the global step', () => {
  const t = track({ length: 4, speed: 2 });
  assert.equal(trackStep(t, 1), 2);
  assert.equal(trackStep(t, 2), 0);
});

test('stepAt reads the right step and returns null on a rest', () => {
  const t = track();
  assert.equal(stepAt(t, 0)?.pitch, 60);
  assert.equal(stepAt(t, 1), null);
  assert.equal(stepAt(t, 2)?.pitch, 62);
  assert.equal(stepAt(t, 4)?.pitch, 60, 'should wrap');
});

test('solo overrides mute, and mute silences when nothing is soloed', () => {
  const a = track({ id: 'a', mute: true });
  const b = track({ id: 'b' });
  assert.equal(isAudible(state({ tracks: [a, b] }), a), false);
  assert.equal(isAudible(state({ tracks: [a, b] }), b), true);

  // With one solo active, only soloed tracks sound — even a muted one.
  const soloed = track({ id: 'c', solo: true });
  const s = state({ tracks: [a, b, soloed] });
  assert.equal(isAudible(s, soloed), true);
  assert.equal(isAudible(s, b), false);
  assert.equal(isAudible(s, a), false, 'solo should override a mute');
});
