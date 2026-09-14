import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DRUM_TYPES, DrumVoice, DRUM_DEFAULTS, type DrumType } from './drums.ts';

/**
 * Offline renders of the drum voices.
 *
 * Same reasoning as `voice.offline.test.ts`: a drum that schedules silently, or
 * one whose decay is wrong by an order of magnitude, is invisible to a
 * type-check and a green build. `node-web-audio-api` lets these be rendered and
 * measured. The noise source is a seeded PRNG rather than `Math.random`, so
 * every render here is reproducible and the assertions are stable.
 *
 * The helpers are deliberately duplicated from the voice tests rather than
 * shared: a shared module would either be compiled into the published package
 * or need a tsconfig exclusion, and thirty lines of test scaffolding is not
 * worth either.
 */

const SR = 44100;

interface OfflineLike {
  readonly destination: AudioNode;
  readonly currentTime: number;
  startRendering(): Promise<AudioBuffer>;
}

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineLike;

let Offline: OfflineCtor | undefined;
try {
  const mod = await import('node-web-audio-api');
  Offline = mod.OfflineAudioContext as unknown as OfflineCtor;
} catch {
  Offline = undefined;
}

const skip = Offline === undefined
  ? 'node-web-audio-api not installed — run `make install` at the repo root'
  : false;

async function renderDrum(
  type: DrumType,
  accent = false,
  seconds = 0.6,
): Promise<Float32Array> {
  const ctx = new Offline!(1, Math.round(SR * seconds), SR);
  const drum = new DrumVoice(ctx as unknown as BaseAudioContext, ctx.destination, DRUM_DEFAULTS[type]);
  drum.noteOn(0.05, 0, 0.5, accent);
  return (await ctx.startRendering()).getChannelData(0);
}

function rms(data: Float32Array, fromSec: number, toSec: number): number {
  const a = Math.max(0, Math.floor(fromSec * SR));
  const b = Math.min(data.length, Math.floor(toSec * SR));
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += (data[i] ?? 0) ** 2;
  return Math.sqrt(sum / (b - a));
}

test('every drum type produces sound', { skip }, async () => {
  for (const type of DRUM_TYPES) {
    const data = await renderDrum(type);
    const hit = rms(data, 0.05, 0.12);
    assert.ok(hit > 0.001, `${type} produced no audible output (RMS ${hit})`);
  }
});

test('nothing sounds before the hit', { skip }, async () => {
  for (const type of DRUM_TYPES) {
    const data = await renderDrum(type);
    assert.ok(rms(data, 0, 0.04) < 1e-4, `${type} sounded before its hit`);
  }
});

test('every drum decays to silence', { skip }, async () => {
  // A drum machine whose hits never stop is not a drum machine.
  for (const type of DRUM_TYPES) {
    const data = await renderDrum(type);
    const tail = rms(data, 0.45, 0.58);
    assert.ok(tail < 1e-4, `${type} did not decay (tail RMS ${tail})`);
  }
});

test('a hat is much shorter than a kick', { skip }, async () => {
  // The clearest structural difference between a kit's extremes, and the one
  // that would show up as mud if the decays were crossed.
  const kick = await renderDrum('kick');
  const hat = await renderDrum('hat');
  const kickLate = rms(kick, 0.18, 0.3);
  const hatLate = rms(hat, 0.18, 0.3);
  assert.ok(hatLate < kickLate * 0.1, `hat should be gone long before a kick: hat ${hatLate}, kick ${kickLate}`);
  // ...but both are present at the attack.
  assert.ok(rms(hat, 0.05, 0.07) > 0.001);
});

test('an accent makes a drum louder', { skip }, async () => {
  for (const type of DRUM_TYPES) {
    const plain = await renderDrum(type, false);
    const accented = await renderDrum(type, true);
    const p = rms(plain, 0.05, 0.15);
    const q = rms(accented, 0.05, 0.15);
    assert.ok(q > p * 1.2, `${type} accent not louder: plain ${p}, accented ${q}`);
  }
});

test('drums are one-shots that never claim to be sounding', { skip }, async () => {
  // This is what makes a slide on a rhythm track inert without the engine
  // needing to special-case it: the engine only glides when the instrument
  // reports itself as still sounding.
  const ctx = new Offline!(1, 128, SR);
  const drum = new DrumVoice(ctx as unknown as BaseAudioContext, ctx.destination, DRUM_DEFAULTS.kick);
  assert.equal(drum.isSoundingAt(), false);
  drum.noteOn(0, 0, 0.5, false);
  assert.equal(drum.isSoundingAt(), false);
});

test('a drum ignores the pitch and glide it is passed', { skip }, async () => {
  // Both are part of the shared Instrument signature. A drum that changed
  // character with pitch would make a rhythm track's melodic data leak into its
  // sound, and switching kinds back and forth would be audible.
  //
  // Both hits go through ONE context so the noise buffer, the sample rate and
  // every other per-context detail are shared. An earlier version rendered each
  // hit in its own context and compared the buffers; that folded the renderer's
  // own variance into the result and failed intermittently in CI — passing on a
  // re-run of the identical commit. Same-context comparison tests the property
  // more tightly and cannot be perturbed by anything outside it.
  const WINDOW = 3000;
  const ctx = new Offline!(1, Math.round(SR * 0.8), SR);
  const drum = new DrumVoice(ctx as unknown as BaseAudioContext, ctx.destination, DRUM_DEFAULTS.clap);
  drum.noteOn(0.05, 55, 0.3, false, false);
  drum.noteOn(0.4, 880, 0.3, false, true);
  const data = (await ctx.startRendering()).getChannelData(0);

  // Assert there is something to compare first, so a render that comes back
  // silent fails as "no audio" rather than as a 3000-element diff of zeros.
  assert.ok(rms(data, 0.05, 0.2) > 0.001, 'the low-pitch hit produced no sound');
  assert.ok(rms(data, 0.4, 0.55) > 0.001, 'the high-pitch hit produced no sound');

  const win = (t: number): Float32Array =>
    data.slice(Math.round(t * SR), Math.round(t * SR) + WINDOW);
  const low = win(0.05);
  const high = win(0.4);

  // Compared with a tolerance, not bit-exactly, and that is not laxity — it is
  // the correct assertion. Web Audio computes an exponential ramp from the
  // *absolute* timestamp, so two identical envelopes scheduled at 0.05s and
  // 0.4s do not round to the same floats. Demanding bit-equality was this
  // test's original mistake: it failed intermittently in CI on an unchanged
  // commit, and on inspection the two renders differ by at most ~7e-6 — about
  // -66 dB, three orders of magnitude below anything audible.
  let maxDiff = 0;
  for (let i = 0; i < WINDOW; i++) {
    maxDiff = Math.max(maxDiff, Math.abs((low[i] ?? 0) - (high[i] ?? 0)));
  }
  assert.ok(maxDiff < 1e-4, `pitch changed the drum sound: max difference ${maxDiff}`);
});

test('release() silences a ringing drum', { skip }, async () => {
  const ctx = new Offline!(1, Math.round(SR * 0.6), SR);
  const drum = new DrumVoice(ctx as unknown as BaseAudioContext, ctx.destination, DRUM_DEFAULTS.kick);
  drum.noteOn(0.05, 0, 0.5, false);
  drum.release(0.12);
  const data = (await ctx.startRendering()).getChannelData(0);
  assert.ok(rms(data, 0.05, 0.1) > 0.001, 'should sound before release');
  assert.ok(rms(data, 0.2, 0.5) < 1e-4, 'should be silent after release');
});

test('rendering is deterministic despite the noise source', { skip }, async () => {
  const a = await renderDrum('hat');
  const b = await renderDrum('hat');
  assert.deepEqual(Array.from(a.slice(0, 4000)), Array.from(b.slice(0, 4000)));
});

test('tune and decay multipliers take effect', { skip }, async () => {
  // Both are honoured by DrumVoice but nothing in the UI exposes them yet.
  // Asserting they work means wiring encoders to them later is not a surprise.
  async function kickWith(params: { tune?: number; decay?: number }): Promise<Float32Array> {
    const ctx = new Offline!(1, Math.round(SR * 0.8), SR);
    const drum = new DrumVoice(ctx as unknown as BaseAudioContext, ctx.destination, {
      ...DRUM_DEFAULTS.kick, ...params,
    });
    drum.noteOn(0.05, 0, 0.5, false);
    return (await ctx.startRendering()).getChannelData(0);
  }
  const normal = await kickWith({});
  const short = await kickWith({ decay: 0.25 });
  assert.ok(
    rms(short, 0.15, 0.3) < rms(normal, 0.15, 0.3),
    'a shorter decay should leave less energy in the tail',
  );

  // Tuning shifts the fundamental, which changes the waveform outright.
  // Slice from *after* the hit — the first 2000 samples are silence, and two
  // silent buffers compare equal no matter what the pitch is.
  const hitFrom = Math.floor(0.05 * SR);
  const hitTo = Math.floor(0.15 * SR);
  const tuned = await kickWith({ tune: 2 });
  assert.notDeepEqual(
    Array.from(tuned.slice(hitFrom, hitTo)),
    Array.from(normal.slice(hitFrom, hitTo)),
  );
});
