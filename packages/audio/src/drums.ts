/**
 * Drum voices.
 *
 * One-shot percussion, synthesised rather than sampled — a sample would mean
 * shipping audio files, licensing them, and deciding what "the" kick is, none
 * of which this project has any basis for. Synthesised drums are a few lines
 * each and are tunable, which matters more here than authenticity.
 *
 * These are written in the idiom of the TR-808/909 rather than the 303: a kick
 * is a sine whose pitch drops fast, a snare is noise plus a tuned body, a hat is
 * high-passed noise with a very short decay. That is genuinely how the classic
 * machines work, and it is why they are recognisable.
 *
 * Nodes are built per hit and thrown away. Drums are one-shots with no
 * sustained state to preserve, so reusing oscillators across hits would buy
 * nothing and cost a great deal of bookkeeping.
 *
 * The noise source is a *deterministic* PRNG, not `Math.random`. Offline
 * renders then come out identical run to run, which is what makes the drum
 * tests assertable at all — and it means a pattern sounds the same every time
 * the performer returns to it.
 */

import type { DrumType } from '@gr00ve/core';
import type { Instrument } from './instrument.ts';

// The vocabulary lives in @gr00ve/core, alongside the rest of the musical
// domain; only the synthesis parameters and the DSP belong here.
export { DRUM_LABELS, DRUM_TYPES, type DrumType } from '@gr00ve/core';

export interface DrumParams {
  readonly type: DrumType;
  readonly level: number;
  /** Pitch multiplier. 1 is the designed tuning; 2 is an octave up. */
  readonly tune: number;
  /** Decay multiplier. 1 is the designed length. */
  readonly decay: number;
}

export const DRUM_DEFAULTS: Readonly<Record<DrumType, DrumParams>> = {
  kick: { type: 'kick', level: 1.0, tune: 1, decay: 1 },
  snare: { type: 'snare', level: 0.7, tune: 1, decay: 1 },
  hat: { type: 'hat', level: 0.42, tune: 1, decay: 1 },
  clap: { type: 'clap', level: 0.62, tune: 1, decay: 1 },
  tom: { type: 'tom', level: 0.75, tune: 1, decay: 1 },
  rim: { type: 'rim', level: 0.55, tune: 1, decay: 1 },
};

/** A level Web Audio accepts as silent for exponential ramps. */
const EPSILON = 0.0001;

/** An accent raises a drum's level by this factor. */
const ACCENT_BOOST = 1.45;

/**
 * One shared noise buffer per audio context.
 *
 * Half a second is longer than any of these decays, and caching it avoids
 * regenerating a megabyte of noise on every hat hit.
 */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;

  const frames = Math.floor(ctx.sampleRate * 0.5);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Deterministic LCG — see the note at the top of the file.
  let seed = 0x2f6e2b1;
  for (let i = 0; i < frames; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = (seed / 4294967296) * 2 - 1;
  }

  noiseCache.set(ctx, buffer);
  return buffer;
}

export class DrumVoice implements Instrument {
  private readonly ctx: BaseAudioContext;
  private readonly destination: AudioNode;
  private readonly params: DrumParams;
  /** Gains for hits still ringing, so `release` can fade them out. */
  private readonly ringing = new Set<GainNode>();

  constructor(ctx: BaseAudioContext, destination: AudioNode, params: DrumParams) {
    this.ctx = ctx;
    this.destination = destination;
    this.params = params;
  }

  get type(): DrumType {
    return this.params.type;
  }

  /** Drums are one-shots: nothing sustains, so nothing can glide into them. */
  isSoundingAt(): boolean {
    return false;
  }

  /**
   * `freq`, `duration` and `glide` are all ignored.
   *
   * They are declared anyway rather than dropped, because a 4-parameter version
   * is *structurally* assignable to `Instrument` (a function may always ignore
   * trailing arguments) — so dropping them would type-check at the call site in
   * the engine while failing for anyone holding a concrete `DrumVoice`.
   * Declaring the full signature keeps the concrete type and the interface in
   * agreement.
   */
  noteOn(time: number, _freq: number, _duration: number, accent: boolean, _glide?: boolean): void {
    const { level, tune, decay } = this.params;
    const gain = level * (accent ? ACCENT_BOOST : 1);
    const t = Math.max(time, this.ctx.currentTime);

    switch (this.params.type) {
      case 'kick': this.kick(t, gain, tune, decay); break;
      case 'snare': this.snare(t, gain, tune, decay); break;
      case 'hat': this.hat(t, gain, tune, decay); break;
      case 'clap': this.clap(t, gain, tune, decay); break;
      case 'tom': this.tom(t, gain, tune, decay); break;
      case 'rim': this.rim(t, gain, tune, decay); break;
    }
  }

  release(time: number): void {
    const t = Math.max(time, this.ctx.currentTime);
    for (const gain of this.ringing) {
      try {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(Math.max(EPSILON, gain.gain.value), t);
        gain.gain.exponentialRampToValueAtTime(EPSILON, t + 0.02);
      } catch {
        // The node may already be gone; silencing is best-effort by design.
      }
    }
  }

  dispose(): void {
    for (const gain of this.ringing) gain.disconnect();
    this.ringing.clear();
  }

  // --- per-drum synthesis ---------------------------------------------------

  private track(gain: GainNode): GainNode {
    this.ringing.add(gain);
    return gain;
  }

  /** A sine whose pitch drops fast through a short amplitude decay. */
  private kick(t: number, level: number, tune: number, decay: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const amp = this.track(this.ctx.createGain());

    osc.frequency.setValueAtTime(150 * tune, t);
    osc.frequency.exponentialRampToValueAtTime(45 * tune, t + 0.08 * decay);

    amp.gain.setValueAtTime(level, t);
    amp.gain.exponentialRampToValueAtTime(EPSILON, t + 0.45 * decay);

    osc.connect(amp).connect(this.destination);
    osc.start(t);
    osc.stop(t + 0.5 * decay);
  }

  /** Noise plus a tuned body — the two components are what make a snare read. */
  private snare(t: number, level: number, tune: number, decay: number): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer(this.ctx);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400 * tune;
    const noiseAmp = this.track(this.ctx.createGain());
    noiseAmp.gain.setValueAtTime(level * 0.9, t);
    noiseAmp.gain.exponentialRampToValueAtTime(EPSILON, t + 0.18 * decay);
    noise.connect(hp).connect(noiseAmp).connect(this.destination);
    noise.start(t);
    noise.stop(t + 0.2 * decay);

    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    const bodyAmp = this.track(this.ctx.createGain());
    body.frequency.setValueAtTime(190 * tune, t);
    body.frequency.exponentialRampToValueAtTime(120 * tune, t + 0.1 * decay);
    bodyAmp.gain.setValueAtTime(level * 0.5, t);
    bodyAmp.gain.exponentialRampToValueAtTime(EPSILON, t + 0.1 * decay);
    body.connect(bodyAmp).connect(this.destination);
    body.start(t);
    body.stop(t + 0.12 * decay);
  }

  /** High-passed noise with a very short decay. */
  private hat(t: number, level: number, tune: number, decay: number): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer(this.ctx);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000 * tune;
    const amp = this.track(this.ctx.createGain());
    amp.gain.setValueAtTime(level, t);
    amp.gain.exponentialRampToValueAtTime(EPSILON, t + 0.06 * decay);
    noise.connect(hp).connect(amp).connect(this.destination);
    noise.start(t);
    noise.stop(t + 0.08 * decay);
  }

  /**
   * Band-passed noise burst repeated a few times, then a longer tail.
   *
   * The repeats are the whole character: a clap is many hands, and a single
   * burst reads as a snare.
   */
  private clap(t: number, level: number, tune: number, decay: number): void {
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100 * tune;
    bp.Q.value = 1.2;
    bp.connect(this.destination);

    for (let i = 0; i < 3; i++) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer(this.ctx);
      const amp = this.track(this.ctx.createGain());
      const at = t + i * 0.011;
      amp.gain.setValueAtTime(level * 0.6, at);
      amp.gain.exponentialRampToValueAtTime(EPSILON, at + 0.012);
      noise.connect(amp).connect(bp);
      noise.start(at);
      noise.stop(at + 0.02);
    }

    const tail = this.ctx.createBufferSource();
    tail.buffer = noiseBuffer(this.ctx);
    const tailAmp = this.track(this.ctx.createGain());
    const tailAt = t + 0.033;
    tailAmp.gain.setValueAtTime(level * 0.5, tailAt);
    tailAmp.gain.exponentialRampToValueAtTime(EPSILON, tailAt + 0.16 * decay);
    tail.connect(tailAmp).connect(bp);
    tail.start(tailAt);
    tail.stop(tailAt + 0.2 * decay);
  }

  /** Sine with a gentler pitch drop than a kick. */
  private tom(t: number, level: number, tune: number, decay: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const amp = this.track(this.ctx.createGain());
    osc.frequency.setValueAtTime(220 * tune, t);
    osc.frequency.exponentialRampToValueAtTime(110 * tune, t + 0.16 * decay);
    amp.gain.setValueAtTime(level, t);
    amp.gain.exponentialRampToValueAtTime(EPSILON, t + 0.35 * decay);
    osc.connect(amp).connect(this.destination);
    osc.start(t);
    osc.stop(t + 0.4 * decay);
  }

  /** A very short band-passed burst — a stick on a rim. */
  private rim(t: number, level: number, tune: number, decay: number): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer(this.ctx);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200 * tune;
    bp.Q.value = 4;
    const amp = this.track(this.ctx.createGain());
    amp.gain.setValueAtTime(level, t);
    amp.gain.exponentialRampToValueAtTime(EPSILON, t + 0.03 * decay);
    noise.connect(bp).connect(amp).connect(this.destination);
    noise.start(t);
    noise.stop(t + 0.04 * decay);
  }
}
