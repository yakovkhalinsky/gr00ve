import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  Status, channelNibble, clockTick, controlChange, midiTimestamp,
  noteOff, noteOn, transportStart, transportStop, velocityFor,
} from './output.ts';

// --- messages ---------------------------------------------------------------

test('channels are converted from 1-based to the wire nibble', () => {
  assert.equal(channelNibble(1), 0);
  assert.equal(channelNibble(16), 15);
  assert.equal(channelNibble(8), 7);
});

test('channel conversion clamps rather than emitting an invalid status byte', () => {
  // A channel of 0 or 17 would otherwise produce a status byte outside the
  // legal range, which some modules treat as a system message and mis-sync on.
  assert.equal(channelNibble(0), 0);
  assert.equal(channelNibble(17), 15);
  assert.equal(channelNibble(-3), 0);
  assert.equal(channelNibble(Number.NaN), 0);
});

test('note on and off carry the channel in the status nibble', () => {
  assert.deepEqual(noteOn(1, 60, 100), [0x90, 60, 100]);
  assert.deepEqual(noteOn(16, 60, 100), [0x9f, 60, 100]);
  assert.deepEqual(noteOff(1, 60), [0x80, 60, 0]);
  assert.deepEqual(noteOff(16, 60), [0x8f, 60, 0]);
});

test('note off is an explicit 0x80, not a zero-velocity note on', () => {
  // Equivalent for most gear, but some converters and older modules only
  // handle the explicit form.
  assert.equal(noteOff(1, 60)[0], Status.noteOff);
});

test('pitch and velocity are clamped to 7 bits', () => {
  assert.deepEqual(noteOn(1, 200, 999), [0x90, 127, 127]);
  assert.deepEqual(noteOn(1, -5, -1), [0x90, 0, 0]);
  assert.deepEqual(noteOn(1, Number.NaN, Number.NaN), [0x90, 0, 0]);
});

test('each track can address its own channel, as a MIDI-CV module wants', () => {
  // Eight tracks on eight channels is the point: a module maps each channel to
  // a pitch CV / gate pair, so voices must not share one.
  const channels = [1, 2, 3, 4, 5, 6, 7, 8];
  const statuses = channels.map((c) => noteOn(c, 60)[0]);
  assert.equal(new Set(statuses).size, 8, 'channels collided');
  statuses.forEach((s, i) => assert.equal(s, 0x90 | i));
});

test('system messages are single bytes', () => {
  assert.deepEqual(clockTick(), [0xf8]);
  assert.deepEqual(transportStart(), [0xfa]);
  assert.deepEqual(transportStop(), [0xfc]);
  assert.deepEqual(controlChange(1, 1, 64), [0xb0, 1, 64]);
});

test('accents go out at full velocity and ordinary notes well below', () => {
  assert.equal(velocityFor(0.75, true), 127);
  assert.equal(velocityFor(1, true), 127);
  // Ordinary notes stay in a band, leaving headroom for accents to be distinct.
  const plain = velocityFor(0.75, false);
  assert.ok(plain > 27 && plain < 127, `got ${plain}`);
  assert.ok(plain < velocityFor(0.75, true));
});

test('velocityFor never emits zero, which some modules read as note-off', () => {
  assert.ok(velocityFor(0, false) >= 1);
  assert.ok(velocityFor(-1, false) >= 1);
  assert.ok(velocityFor(Number.NaN, false) >= 1);
});

// --- the clock domain -------------------------------------------------------

test('audio time converts to the performance.now domain', () => {
  const domain = { audioTime: 10, perfNow: 5000 };
  // Same instant maps to itself.
  assert.equal(midiTimestamp(10, domain), 5000);
  // A second later in audio time is a second later in wall time.
  assert.equal(midiTimestamp(11, domain), 6000);
  // And a scheduled time in the past converts too.
  assert.equal(midiTimestamp(9.5, domain), 4500);
});

test('the conversion is re-sampled per window rather than calibrated once', () => {
  // The two clocks tick at different rates, so a stale reference drifts. Two
  // domains captured a while apart must give different answers for the same
  // audio time — that difference *is* the drift being corrected.
  const early = { audioTime: 10, perfNow: 5000 };
  const late = { audioTime: 70, perfNow: 60010 }; // 60s later, 10ms of drift
  assert.notEqual(midiTimestamp(70, early), midiTimestamp(70, late));
});
