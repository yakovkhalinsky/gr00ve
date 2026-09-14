/**
 * MIDI output: driving external gear.
 *
 * This is the *opposite* direction to the rest of this package. `learn.ts` and
 * `webmidi.ts` are about a human turning encoders and faders; this is about the
 * sequencer playing a rack. For a Eurorack rig the usual consumer is a
 * MIDI-to-CV module, where the conventions are different from a synth's:
 *
 *   - **One MIDI channel per voice.** A module like an Expert Sleepers FH-2 or
 *     a Mutable Yarns maps each channel to a pitch CV / gate pair, so a track
 *     should own a channel rather than sharing one. That is why channels are
 *     assigned per track here, not globally.
 *   - **Gate length matters.** Such modules derive gate length from the gap
 *     between note-on and note-off, so note-off is not optional the way it can
 *     be with a synth that has its own envelope. Every note-off is scheduled.
 *   - **Clock is how the rack keeps time.** Anything with its own sequencer —
 *     a clocked LFO, a second sequencer, a euclidean module — follows 24 ppqn
 *     clock, so it is emitted alongside the notes rather than instead of them.
 *
 * Two Web MIDI details are load-bearing and easy to get wrong:
 *
 * **Timestamps are in a different clock domain to the audio.** `send()` takes a
 * `DOMHighResTimeStamp` (the `performance.now()` domain), while the scheduler
 * works in `AudioContext.currentTime` seconds. The two drift relative to one
 * another, so the conversion is recomputed every scheduling window rather than
 * calibrated once — see `midiTimestamp`.
 *
 * **Everything here is pure.** Messages are computed as plain arrays so they
 * can be unit-tested without a browser, which matters because an off-by-one in
 * a channel nibble is invisible until something in the rack plays the wrong
 * voice. Clock *scheduling* lives in @gr00ve/audio alongside the rest of the
 * lookahead arithmetic — this module only knows how to turn a tick into bytes.
 */

/** MIDI status bytes, before the channel nibble is OR-ed in. */
export const Status = {
  noteOff: 0x80,
  noteOn: 0x90,
  controlChange: 0xb0,
  /** Timing clock, 24 per quarter note. */
  clock: 0xf8,
  start: 0xfa,
  continue: 0xfb,
  stop: 0xfc,
} as const;

/** MIDI channels as humans number them, 1–16. */
export const MIN_CHANNEL = 1;
export const MAX_CHANNEL = 16;

/** Clamp a 1-based channel and convert to the 0-based nibble used on the wire. */
export function channelNibble(channel: number): number {
  const c = Math.round(channel);
  return Math.max(0, Math.min(15, (Number.isFinite(c) ? c : 1) - 1));
}

export function noteOn(channel: number, pitch: number, velocity = 100): number[] {
  return [Status.noteOn | channelNibble(channel), clamp7(pitch), clamp7(velocity)];
}

/**
 * Note-off, sent as a real 0x80 rather than a note-on with velocity 0.
 *
 * Both are legal and equivalent for almost all gear, but a handful of
 * converters and older modules only handle the explicit form.
 */
export function noteOff(channel: number, pitch: number): number[] {
  return [Status.noteOff | channelNibble(channel), clamp7(pitch), 0];
}

export function controlChange(channel: number, controller: number, value: number): number[] {
  return [Status.controlChange | channelNibble(channel), clamp7(controller), clamp7(value)];
}

export function clockTick(): number[] {
  return [Status.clock];
}

export function transportStart(): number[] {
  return [Status.start];
}

export function transportStop(): number[] {
  return [Status.stop];
}

/**
 * Note velocity for a step.
 *
 * Accents go out at full velocity so a MIDI-CV module can route them to a
 * separate CV if it wants to; everything else lands in a band well below, since
 * velocity-to-CV on these modules is often used for filter or level and a
 * narrow range is more useful than the full 0–127.
 */
export function velocityFor(stepVelocity: number, accent: boolean): number {
  if (accent) return 127;
  const v = Number.isFinite(stepVelocity) ? stepVelocity : 0.75;
  return Math.max(1, Math.min(126, Math.round(27 + v * 100)));
}

function clamp7(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(127, Math.round(value)));
}

/**
 * A reference point tying the audio clock to the `performance.now()` domain.
 *
 * Read both at the same instant and the conversion below is exact at that
 * moment. Because the two clocks tick at slightly different rates, a value
 * captured once drifts — tens of milliseconds over a long session, which is
 * audible. Callers should re-sample this every scheduling window.
 */
export interface ClockDomain {
  /** `AudioContext.currentTime`, seconds. */
  readonly audioTime: number;
  /** `performance.now()`, milliseconds, sampled at the same instant. */
  readonly perfNow: number;
}

/**
 * Convert an audio-clock time to the timestamp `MIDIOutput.send` expects.
 *
 * Getting this wrong is a silent failure: the notes still play, just at the
 * wrong moment, and a few milliseconds of misalignment against a rack that is
 * also being clocked sounds like the whole system is loose.
 */
export function midiTimestamp(audioTime: number, domain: ClockDomain): number {
  return domain.perfNow + (audioTime - domain.audioTime) * 1000;
}
