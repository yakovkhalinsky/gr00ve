import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_VOICE, Voice, type VoiceParams } from './voice.ts';

/**
 * Offline audio renders.
 *
 * These exist because "does it make sound" is otherwise unverifiable without a
 * browser — and a voice that schedules silently is a failure you cannot see in
 * a type-check, a build, or a green test run. `node-web-audio-api` provides a
 * real Web Audio implementation in Node, so the voice can be rendered and
 * *measured*: amplitude, brightness, and the envelope continuity that the 303
 * slide rule depends on.
 *
 * The dependency is optional and probed at runtime, so the rest of the suite
 * still runs with nothing installed. Skips rather than fails when absent.
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

/** Render the voice with the given scheduling, returning the output samples. */
async function render(
  setup: (voice: Voice) => void,
  opts: { seconds?: number; params?: VoiceParams } = {},
): Promise<Float32Array> {
  const seconds = opts.seconds ?? 0.8;
  const ctx = new Offline!(1, Math.round(SR * seconds), SR);
  const voice = new Voice(
    ctx as unknown as BaseAudioContext,
    ctx.destination,
    opts.params ?? DEFAULT_VOICE,
  );
  setup(voice);
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0);
}

/** Root-mean-square amplitude over a time window. */
function rms(data: Float32Array, fromSec: number, toSec: number): number {
  const a = Math.max(0, Math.floor(fromSec * SR));
  const b = Math.min(data.length, Math.floor(toSec * SR));
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += (data[i] ?? 0) ** 2;
  return Math.sqrt(sum / (b - a));
}

/** Zero-crossing rate — a coarse pitch proxy. Scale-invariant. */
function zcr(data: Float32Array, fromSec: number, toSec: number): number {
  const a = Math.max(0, Math.floor(fromSec * SR));
  const b = Math.min(data.length, Math.floor(toSec * SR));
  if (b <= a + 1) return 0;
  let crossings = 0;
  for (let i = a + 1; i < b; i++) {
    const prev = data[i - 1] ?? 0;
    const cur = data[i] ?? 0;
    if ((prev < 0 && cur >= 0) || (prev >= 0 && cur < 0)) crossings++;
  }
  return crossings / ((b - a) / SR);
}

/**
 * Scale-invariant brightness: mean absolute sample-to-sample difference,
 * normalised by RMS.
 *
 * Zero-crossing rate will not do here. It is scale-invariant, but a sawtooth
 * through a lowpass crosses zero at the same *indices* whether the gain is 0.3
 * or 0.5 — so ZCR reports a gain change and a filter change identically, which
 * is precisely the distinction the accent test needs to make. This measure
 * responds to harmonic content instead, and dividing by RMS removes the level.
 */
function brightness(data: Float32Array, fromSec: number, toSec: number): number {
  const a = Math.max(1, Math.floor(fromSec * SR));
  const b = Math.min(data.length, Math.floor(toSec * SR));
  if (b <= a) return 0;
  let diffSum = 0;
  let sqSum = 0;
  for (let i = a; i < b; i++) {
    diffSum += Math.abs((data[i] ?? 0) - (data[i - 1] ?? 0));
    const v = data[i] ?? 0;
    sqSum += v * v;
  }
  const r = Math.sqrt(sqSum / (b - a));
  return r === 0 ? 0 : diffSum / (b - a) / r;
}

/**
 * Peak brightness over short sliding windows.
 *
 * An accent's filter effect is a *transient* — a chirp at the note's onset. It
 * is also deliberately shorter on accented notes (the hardware shortens the
 * sweep), so averaging over the whole note can actually make an accented note
 * measure *darker* than a plain one, because it has already closed back down.
 * The accent question is only answerable at the moment of attack.
 */
function peakBrightness(data: Float32Array, fromSec: number, toSec: number, windowMs = 5): number {
  const win = windowMs / 1000;
  let best = 0;
  for (let t = fromSec; t + win <= toSec; t += win / 2) {
    best = Math.max(best, brightness(data, t, t + win));
  }
  return best;
}

test('a scheduled note actually produces sound', { skip }, async () => {
  const data = await render((v) => v.noteOn(0.1, 220, 0.2, false));
  assert.ok(data.length > 0, 'render produced no samples');
  const during = rms(data, 0.12, 0.28);
  assert.ok(during > 0.001, `expected audible output during the note, got RMS ${during}`);
});

test('nothing sounds before the note starts', { skip }, async () => {
  const data = await render((v) => v.noteOn(0.2, 220, 0.2, false));
  const before = rms(data, 0.0, 0.18);
  assert.ok(before < 1e-4, `expected silence before the note, got RMS ${before}`);
});

test('the note stops after its gate and release', { skip }, async () => {
  const data = await render((v) => v.noteOn(0.1, 220, 0.1, false));
  const after = rms(data, 0.45, 0.75);
  assert.ok(after < 1e-4, `expected silence after release, got RMS ${after}`);
});

test('a lower cutoff really does darken the tone', { skip }, async () => {
  // Sanity check on the measure itself: without this, a brightness assertion
  // could pass against a filter that is not connected at all.
  const dark = await render((v) => v.noteOn(0.05, 220, 0.3, false), {
    params: { ...DEFAULT_VOICE, cutoff: 120, envMod: 0 },
  });
  const open = await render((v) => v.noteOn(0.05, 220, 0.3, false), {
    params: { ...DEFAULT_VOICE, cutoff: 8000, envMod: 0 },
  });
  assert.ok(
    brightness(open, 0.08, 0.25) > brightness(dark, 0.08, 0.25) * 1.5,
    'the filter does not appear to affect the output',
  );
});

test('an accent is louder', { skip }, async () => {
  const plain = await render((v) => v.noteOn(0.1, 220, 0.25, false));
  const accented = await render((v) => v.noteOn(0.1, 220, 0.25, true));
  const a = rms(plain, 0.12, 0.3);
  const b = rms(accented, 0.12, 0.3);
  assert.ok(b > a * 1.2, `accent should be louder: plain ${a}, accented ${b}`);
});

test('an accent opens the filter further, not just the gain', { skip }, async () => {
  // The regression this guards: implementing accent as a gain boost only. On
  // real hardware the accent drives the filter too, and that movement is most
  // of what makes an accent sound like an accent.
  const plain = await render((v) => v.noteOn(0.05, 220, 0.3, false));
  const accented = await render((v) => v.noteOn(0.05, 220, 0.3, true));
  const p = peakBrightness(plain, 0.05, 0.3);
  const q = peakBrightness(accented, 0.05, 0.3);
  assert.ok(q > p * 1.08, `accent should open the filter further: plain ${p}, accented ${q}`);
});

test('the accent brightness comes from the filter, not from the gain', { skip }, async () => {
  // Control for the test above. With no filter envelope there is nothing for
  // the accent to modulate, so brightness must be unchanged even though the
  // level still rises. If this fails, the brightness above was just the gain
  // boost leaking into the measure.
  const flat: VoiceParams = { ...DEFAULT_VOICE, envMod: 0 };
  const plain = await render((v) => v.noteOn(0.05, 220, 0.3, false), { params: flat });
  const accented = await render((v) => v.noteOn(0.05, 220, 0.3, true), { params: flat });
  const ratio = peakBrightness(accented, 0.05, 0.3) / peakBrightness(plain, 0.05, 0.3);
  assert.ok(Math.abs(ratio - 1) < 0.05, `expected no brightness change with envMod 0, got ${ratio}`);
  // ...while still being louder, which is the part that does not depend on the filter.
  assert.ok(rms(accented, 0.1, 0.2) > rms(plain, 0.1, 0.2) * 1.2);
});

test('a higher note has a higher fundamental', { skip }, async () => {
  const low = await render((v) => v.noteOn(0.05, 110, 0.25, false));
  const high = await render((v) => v.noteOn(0.05, 440, 0.25, false));
  assert.ok(zcr(high, 0.07, 0.2) > zcr(low, 0.07, 0.2) * 2, 'pitch is not being applied');
});

test('a slide ties into the next note instead of retriggering', { skip }, async () => {
  // The 303 rule: the flag on step n is consumed by step n+1, and the slid
  // note's gate does not close — it ties into the following note. So a glided
  // pair must be *continuous* across the boundary, while a retriggered pair
  // dips to zero and attacks again.
  const retriggered = await render((v) => {
    v.noteOn(0.1, 220, 0.1, false, false); // releases at 0.2
    v.noteOn(0.3, 330, 0.1, false, false); // fresh attack at 0.3
  });
  const glided = await render((v) => {
    v.noteOn(0.1, 220, 0.2, false, false); // holds through to 0.3
    v.noteOn(0.3, 330, 0.1, false, true); // tie: no new gate event
  });

  // A window straddling the boundary.
  const a = rms(retriggered, 0.296, 0.306);
  const b = rms(glided, 0.296, 0.306);
  assert.ok(b > a * 1.2, `glide should hold through the boundary: retrigger ${a}, glide ${b}`);
});

test('a glide is only honoured when something is already sounding', { skip }, async () => {
  // Gliding with no prior note must not silence the voice — it should attack
  // normally. A naive implementation ramps from a null previous frequency.
  const data = await render((v) => v.noteOn(0.1, 220, 0.2, false, true));
  const during = rms(data, 0.12, 0.28);
  assert.ok(during > 0.001, `glide-from-nothing produced no sound: RMS ${during}`);
});

test('the release ramps rather than cutting — no click at the end', { skip }, async () => {
  // A discontinuity at note-off is an audible click. Check the sample-to-sample
  // step never jumps the way a hard cut would.
  const data = await render((v) => v.noteOn(0.1, 220, 0.1, false));
  const from = Math.floor(0.1 * SR);
  const to = Math.floor(0.3 * SR);
  let maxStep = 0;
  for (let i = from + 1; i < to; i++) {
    maxStep = Math.max(maxStep, Math.abs((data[i] ?? 0) - (data[i - 1] ?? 0)));
  }
  assert.ok(maxStep < 0.5, `sample discontinuity of ${maxStep} suggests a click`);
});

test('release() silences a sounding voice', { skip }, async () => {
  const ctx = new Offline!(1, Math.round(SR * 0.6), SR);
  const voice = new Voice(ctx as unknown as BaseAudioContext, ctx.destination, DEFAULT_VOICE);
  voice.noteOn(0.05, 220, 5, false); // deliberately long gate
  voice.release(0.2);
  const data = (await ctx.startRendering()).getChannelData(0);
  assert.ok(rms(data, 0.08, 0.18) > 0.001, 'should sound before release');
  assert.ok(rms(data, 0.35, 0.55) < 1e-4, 'should be silent after release');
});

test('rendering is deterministic — the same schedule gives the same samples', { skip }, async () => {
  const a = await render((v) => v.noteOn(0.1, 220, 0.2, true));
  const b = await render((v) => v.noteOn(0.1, 220, 0.2, true));
  assert.deepEqual(Array.from(a.slice(0, 2000)), Array.from(b.slice(0, 2000)));
});
