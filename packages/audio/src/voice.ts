/**
 * A monophonic synth voice, modelled on the TB-303.
 *
 * Monophonic per track is the right default for a melodic sequencer — each
 * track is a *line*, not a chord — and it sidesteps voice allocation entirely.
 * It is also the 303's design, and the 303 is the most-copied melodic voice in
 * electronic music.
 *
 * Two behaviours are implemented properly rather than approximated, because
 * they are most of what makes the difference between "notes" and "acid":
 *
 * **Accent brightens as well as loudens.** On real hardware the accent signal
 * drives the VCA *and*, through the Accent Sweep Circuit, the filter. An accent
 * that only raises level sounds flat; the filter movement is the character.
 * (The hardware's resonance coupling — where the sweep capacitor does not fully
 * discharge, so successive accents climb — is not modelled. It is the next
 * thing to add if the accent needs more bite.)
 *
 * **Slide is a property of the NEXT note.** The flag programmed on step *n* is
 * consumed by step *n + 1*: the slid note's gate does not close but ties into
 * the following note, where the pitch changes without a new gate event. So
 * `noteOn` takes a `glide` flag rather than the voice reading its own `slide`.
 */

import type { Instrument } from './instrument.ts';

export interface VoiceParams {
  readonly waveform: OscillatorType;
  /** Resting filter cutoff, Hz. The acid sweep lives here. */
  readonly cutoff: number;
  /** Filter resonance. Must be reasonably high for accent to bite. */
  readonly resonance: number;
  /** Filter envelope depth, Hz. */
  readonly envMod: number;
  /** Filter envelope decay, seconds. */
  readonly decay: number;
  /** Amplitude attack, seconds. Short — a 303 has essentially no attack time. */
  readonly attack: number;
  readonly release: number;
  /** Base level, 0..1. */
  readonly level: number;
}

export const DEFAULT_VOICE: VoiceParams = {
  waveform: 'sawtooth',
  cutoff: 380,
  resonance: 6, // Web Audio Q; around 6–10 is squelchy without being piercing
  envMod: 2200,
  decay: 0.22,
  attack: 0.004,
  release: 0.06,
  level: 0.5,
};

/** The 303's hardware duty cycle — 3.5 of 6 clock pulses. */
export const DEFAULT_GATE = 3.5 / 6;

/** Filter-envelope depth multiplier on an accented note. */
const ACCENT_ENV = 2.4;

/**
 * Filter-envelope *time* multiplier on an accented note.
 *
 * Below 1: the sweep is shorter, which is what turns a wider opening into a
 * chirp. See the note in `noteOn`.
 */
const ACCENT_DECAY = 0.6;

/** Glide time for a slide, seconds. Short: a 303 slide is a smeared step. */
const GLIDE_SECONDS = 0.045;

/** A value Web Audio will accept as "silent" for exponential ramps. */
const EPSILON = 0.0001;

/** MIDI note number to frequency in Hz. */
export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class Voice implements Instrument {
  private readonly ctx: BaseAudioContext;
  private readonly params: VoiceParams;
  private readonly osc: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly amp: GainNode;

  /** Pitch currently sounding, or null if nothing has played. */
  private currentFreq: number | null = null;
  /** Time the last scheduled note stops sounding, including its release. */
  private soundingUntil = 0;

  constructor(ctx: BaseAudioContext, destination: AudioNode, params: VoiceParams = DEFAULT_VOICE) {
    this.ctx = ctx;
    this.params = params;

    this.osc = ctx.createOscillator();
    this.osc.type = params.waveform;
    this.osc.frequency.value = 440;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = params.cutoff;
    this.filter.Q.value = params.resonance;

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;

    this.osc.connect(this.filter).connect(this.amp).connect(destination);
    this.osc.start();
  }

  /** Whether this voice is still sounding at `time`, i.e. a slide can tie to it. */
  isSoundingAt(time: number): boolean {
    return this.currentFreq !== null && time <= this.soundingUntil + 1e-6;
  }

  /**
   * Schedule a note.
   *
   * @param glide Tie from the currently sounding pitch instead of retriggering.
   *              Set when the *previous* step carried the slide flag.
   */
  noteOn(time: number, freq: number, duration: number, accent: boolean, glide = false): void {
    const p = this.params;
    const peak = p.level * (accent ? 1 : 0.62);
    const safeFreq = Math.max(1, freq);

    if (glide && this.currentFreq !== null) {
      // Tie: change pitch without a new gate event.
      this.osc.frequency.cancelScheduledValues(time);
      this.osc.frequency.setValueAtTime(this.currentFreq, time);
      this.osc.frequency.exponentialRampToValueAtTime(safeFreq, time + GLIDE_SECONDS);

      // Hold rather than retrigger. Ramping from wherever the envelope already
      // is avoids the discontinuity a setValueAtTime would introduce.
      this.amp.gain.cancelScheduledValues(time);
      this.amp.gain.linearRampToValueAtTime(peak, time + GLIDE_SECONDS);
    } else {
      this.osc.frequency.cancelScheduledValues(time);
      this.osc.frequency.setValueAtTime(safeFreq, time);

      this.amp.gain.cancelScheduledValues(time);
      this.amp.gain.setValueAtTime(EPSILON, time);
      this.amp.gain.linearRampToValueAtTime(peak, time + p.attack);
    }

    // Filter envelope.
    //
    // Accent raises the peak *and shortens the sweep*. The shortening is the
    // part that is easy to miss and hard to fake: on the hardware the accent
    // drives the second envelope generator, whose time is "fixed short on
    // accented notes" (Whittle). An accent that merely opens the filter wider
    // for the same duration reads as a slightly brighter note; a shorter sweep
    // reads as a chirp, which is what an accent actually sounds like.
    const peakCutoff = Math.min(18000, p.cutoff + p.envMod * (accent ? ACCENT_ENV : 1));
    const sweep = p.decay * (accent ? ACCENT_DECAY : 1);
    this.filter.frequency.cancelScheduledValues(time);
    this.filter.frequency.setValueAtTime(peakCutoff, time);
    this.filter.frequency.exponentialRampToValueAtTime(Math.max(40, p.cutoff), time + sweep);

    const off = time + Math.max(0.01, duration);
    this.amp.gain.setValueAtTime(peak, off);
    this.amp.gain.exponentialRampToValueAtTime(EPSILON, off + p.release);

    this.currentFreq = safeFreq;
    this.soundingUntil = off + p.release;
  }

  /** Silence immediately-ish, with a short release to avoid a click. */
  release(time: number): void {
    const t = Math.max(time, this.ctx.currentTime);
    this.amp.gain.cancelScheduledValues(t);
    // A ramp needs a defined starting point; read the live value.
    this.amp.gain.setValueAtTime(Math.max(EPSILON, this.amp.gain.value), t);
    this.amp.gain.exponentialRampToValueAtTime(EPSILON, t + this.params.release);
    this.currentFreq = null;
    this.soundingUntil = t + this.params.release;
  }

  dispose(): void {
    try {
      this.osc.stop();
    } catch {
      // Already stopped — stopping twice throws, and that is not an error here.
    }
    this.osc.disconnect();
    this.filter.disconnect();
    this.amp.disconnect();
  }
}
