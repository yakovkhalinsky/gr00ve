/**
 * MIDI Learn: encoder modes and fader takeover.
 *
 * Two problems live here, and both are places where a naive implementation
 * feels broken to a performer.
 *
 * 1. **Encoders speak at least three different dialects.** A relative encoder
 *    sends a delta, not a value, and the encoding is not standardised. Auto-
 *    detection is unreliable — the research is explicit that users must be able
 *    to override the detected mode, so the mode is an explicit setting here.
 *
 * 2. **Absolute faders and software state are fundamentally mismatched.** MIDI
 *    1.0 has no query mechanism: a host cannot ask a controller where its fader
 *    is. So when a preset changes a parameter, the physical fader is now
 *    pointing somewhere that does not match — and if you apply it on touch, the
 *    value jumps. The "comb filter you were damping suddenly loses all its
 *    damping" complaint is this bug. Pickup (a.k.a. takeover/soft-takeover)
 *    fixes it by ignoring the fader until it crosses the stored value, but it
 *    is off by default on real hardware and must be actively enabled.
 */

/** How a controller encodes a relative (endless) encoder's movement. */
export type RelativeMode =
  /** No delta encoding — the value is the value. */
  | 'absolute'
  /** Two's complement. +1 = 0x01, -1 = 0x7F. (Mackie, REAPER Relative 1.) */
  | 'signed'
  /** Binary offset, centre 0x40. +1 = 0x41, -1 = 0x3F. (Korg, Native Instruments.) */
  | 'binaryOffset'
  /** +1 = 0x01, -1 = 0x41. (REAPER Relative 3.) */
  | 'type3';

/** Human-facing names, for a settings encoder. */
export const RELATIVE_MODE_LABELS: Readonly<Record<RelativeMode, string>> = {
  absolute: 'Absolute',
  signed: 'Signed (two’s complement)',
  binaryOffset: 'Binary offset',
  type3: 'Type 3',
};

/**
 * Decode a 7-bit CC value into a signed delta.
 *
 * Returns 0 for `absolute`, since an absolute CC carries a position rather
 * than a movement.
 */
export function decodeRelative(value: number, mode: RelativeMode): number {
  const v = value & 0x7f;
  switch (mode) {
    case 'absolute':
      return 0;
    case 'signed':
      return v < 64 ? v : v - 128;
    case 'binaryOffset':
      return v - 64;
    case 'type3':
      if (v === 0x41) return -1;
      // 0x01 is +1; anything else is treated as an unsigned step count.
      return v === 0x01 ? 1 : v - 64;
  }
}

/** Encode a delta back into a CC value, for tests and for feedback loops. */
export function encodeRelative(delta: number, mode: RelativeMode): number {
  switch (mode) {
    case 'absolute':
      return Math.max(0, Math.min(127, delta));
    case 'signed':
      return delta >= 0 ? delta & 0x7f : (128 + delta) & 0x7f;
    case 'binaryOffset':
      return (64 + delta) & 0x7f;
    case 'type3':
      if (delta === -1) return 0x41;
      if (delta === 1) return 0x01;
      return (64 + delta) & 0x7f;
  }
}

/**
 * Apply a relative delta to a value, clamped.
 *
 * `step` is the encoder's resolution in value units; `acceleration` scales it
 * by how fast the encoder is being turned. Fixed encoder curves are the single
 * most-complained-about detail in the survey: one turn covering a parameter's
 * whole range makes a four-value parameter feel broken, so `step` should be a
 * fraction of the parameter's range rather than a constant.
 */
export function applyDelta(value: number, delta: number, step: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value + delta * step));
}

/** Takeover state for one absolute control. */
export interface PickupState {
  /** The software's current value for the parameter. */
  target: number;
  /** False until the hardware crosses the target. */
  engaged: boolean;
  /** Previous hardware reading, for crossing detection. */
  last: number | undefined;
}

export function initialPickup(target: number): PickupState {
  return { target, engaged: false, last: undefined };
}

/**
 * Feed a hardware reading; get the value to apply, or `null` to ignore it.
 *
 * Before engagement the fader is inert. On the first reading it is also inert,
 * because a single sample gives no direction — applying it would reintroduce
 * exactly the jump this exists to prevent.
 *
 * Engagement is sticky until `retarget` is called, so a parameter that changes
 * under the performer's hand re-arms pickup rather than jumping.
 */
export function pickupUpdate(state: PickupState, hardware: number): { value: number | null; state: PickupState } {
  if (state.engaged) {
    return { value: hardware, state: { ...state, last: hardware } };
  }
  const prev = state.last;
  if (prev === undefined) {
    // First sample: learn the direction, apply nothing.
    const engaged = hardware === state.target;
    return { value: engaged ? hardware : null, state: { ...state, last: hardware, engaged } };
  }
  // Crossed if the target lies between the previous reading and this one,
  // inclusive of the endpoint in either direction.
  const lo = Math.min(prev, hardware);
  const hi = Math.max(prev, hardware);
  const crossed = state.target >= lo && state.target <= hi;
  if (crossed) return { value: state.target, state: { ...state, last: hardware, engaged: true } };
  return { value: null, state: { ...state, last: hardware } };
}

/**
 * Re-arm pickup because the software value changed underneath the control.
 *
 * Call this on preset load, page switch, or any programmatic parameter write.
 */
export function retarget(state: PickupState, target: number): PickupState {
  return { target, engaged: false, last: state.last };
}
