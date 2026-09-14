import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_GATE, DEFAULT_VOICE, midiToFreq } from './voice.ts';

test('MIDI note numbers map to the right frequencies', () => {
  assert.equal(midiToFreq(69), 440); // A4, the reference
  assert.equal(midiToFreq(57), 220); // A3, an octave down
  assert.equal(midiToFreq(81), 880); // A5, an octave up
  assert.ok(Math.abs(midiToFreq(60) - 261.6256) < 1e-3); // middle C
});

test('an octave doubles the frequency, at every register', () => {
  for (const midi of [21, 40, 57, 69, 84, 108]) {
    assert.ok(Math.abs(midiToFreq(midi + 12) / midiToFreq(midi) - 2) < 1e-12, `midi ${midi}`);
  }
});

test('frequency is always positive across the whole MIDI range', () => {
  for (let m = 0; m <= 127; m++) assert.ok(midiToFreq(m) > 0, `midi ${m}`);
});

test('the default gate is the 303 hardware duty cycle', () => {
  // 3.5 of 6 clock pulses.
  assert.ok(Math.abs(DEFAULT_GATE - 3.5 / 6) < 1e-9);
  assert.ok(Math.abs(DEFAULT_GATE - 0.5833) < 1e-3);
});

test('default voice is a plausible acid voice', () => {
  assert.equal(DEFAULT_VOICE.waveform, 'sawtooth');
  assert.ok(DEFAULT_VOICE.cutoff > 100 && DEFAULT_VOICE.cutoff < 1000);
  // Resonance must be high enough for accent to bite; the brief is explicit
  // that a thin accent is what makes an acid line sound flat.
  assert.ok(DEFAULT_VOICE.resonance >= 5);
  assert.ok(DEFAULT_VOICE.envMod > DEFAULT_VOICE.cutoff);
  assert.ok(DEFAULT_VOICE.attack < 0.01, 'a 303 has essentially no attack time');
  assert.ok(DEFAULT_VOICE.level > 0 && DEFAULT_VOICE.level <= 1);
});
