/**
 * Akai APC mini mk2 — RGB pad SysEx.
 *
 * Recommended as the **step grid** to sit alongside the Launch Control XL 3,
 * for one reason that inverts the obvious expectation: of Akai's entire current
 * controller line, this is the only one whose LEDs a host app can drive with
 * *true arbitrary RGB*, via documented SysEx.
 *
 * The comparison that makes the point:
 *   APC mini mk2   arbitrary RGB SysEx, documented            64 pads, no encoders
 *   APC40 MKII     128-entry velocity palette, monochrome rings 16 endless encoders
 *   APC64          no documented host LED protocol at all      8 capacitive strips
 *   MIDImix        no LED feedback on any knob                 24 absolute pots
 *
 * So the cheap APC mini mk2 is the best *grid* Akai makes, and the expensive
 * APC64 is host-blind — you can read its pads but cannot light them.
 *
 * Framer: F0 47 <devID> <modelID> <msgID> <lenMSB> <lenLSB> <data…> F7
 *         47 is Akai; model 0x4F is the APC mini mk2, device id 0x7F.
 */

export const AKAI_MANUFACTURER = 0x47;
export const APC_MINI_MK2 = 0x4f;
export const APC_MINI_MK2_DEVICE_ID = 0x7f;

/** Message ids. */
export const Message = {
  /** Arbitrary per-pad RGB, addressable as a range. */
  rgbLed: 0x24,
} as const;

/** Grid geometry: 8 × 8. */
export const GRID_SIZE = 8;
export const PAD_COUNT = 64;

/**
 * Note numbers.
 *
 * Pads are 0x00–0x3F row-major from the bottom-left. The track buttons and
 * scene buttons are separate ranges.
 */
export const PadNote = {
  first: 0x00,
  last: 0x3f,
  /** Eight track buttons. */
  trackFirst: 0x64,
  trackLast: 0x6b,
  /** Eight scene buttons. */
  sceneFirst: 0x70,
  sceneLast: 0x77,
} as const;

/** Fader CCs: 0x30–0x38 (eight faders plus master), on channel 0, port 0. */
export const FADER_CC = { first: 0x30, last: 0x38 } as const;

/** Pack an 8-bit colour component as the MSB/LSB pair the device expects. */
function component(v: number): [number, number] {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return [(c >> 4) & 0x0f, c & 0x0f];
}

/**
 * Light a range of pads with one colour.
 *
 * Colours are 0–255 per channel, expressed as MSB/LSB nibble pairs — so this is
 * genuine 8-bit RGB, not a palette index. One message can address a contiguous
 * range, which makes redrawing a whole pattern cheap: a step row is one message.
 */
export function setPadRangeRgb(startPad: number, endPad: number, r: number, g: number, b: number): Uint8Array {
  const lo = Math.max(0, Math.min(255, startPad));
  const hi = Math.max(lo, Math.min(255, endPad));
  const [rM, rL] = component(r);
  const [gM, gL] = component(g);
  const [bM, bL] = component(b);
  return Uint8Array.from([
    0xf0,
    AKAI_MANUFACTURER,
    APC_MINI_MK2_DEVICE_ID,
    APC_MINI_MK2,
    Message.rgbLed,
    0x00, // length MSB — the payload is always short enough for the LSB alone
    0x0b, // length LSB: start, end, and three MSB/LSB pairs
    lo,
    hi,
    rM, rL,
    gM, gL,
    bM, bL,
    0xf7,
  ]);
}

/** Light a single pad. */
export function setPadRgb(pad: number, r: number, g: number, b: number): Uint8Array {
  return setPadRangeRgb(pad, pad, r, g, b);
}

/** Row-major pad index from grid coordinates, origin at the bottom-left. */
export function padIndex(row: number, col: number): number {
  return Math.max(0, Math.min(GRID_SIZE - 1, row)) * GRID_SIZE + Math.max(0, Math.min(GRID_SIZE - 1, col));
}

/**
 * Colour for a step, given whether it is an onset / accented / playing.
 *
 * A fixed mapping rather than a configurable one, because the meaning of these
 * LEDs must stay stable — the research is unambiguous that wherever LED meaning
 * is multiplexed or changes per page, users get the modality wrong.
 */
export const STEP_COLOUR = {
  off: [0, 0, 0],
  on: [40, 90, 200],
  accent: [230, 90, 30],
  playhead: [220, 220, 220],
} as const;

/** Render a whole step row (one message for 8 pads). */
export function renderStepRow(
  trackIndex: number,
  steps: readonly (boolean | 'accent')[],
  playhead = -1,
): Uint8Array[] {
  const row = Math.max(0, Math.min(GRID_SIZE - 1, trackIndex));
  const out: Uint8Array[] = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    const pad = padIndex(row, col);
    const colour =
      col === playhead ? STEP_COLOUR.playhead
      : steps[col] === 'accent' ? STEP_COLOUR.accent
      : steps[col] ? STEP_COLOUR.on
      : STEP_COLOUR.off;
    out.push(setPadRgb(pad, colour[0], colour[1], colour[2]));
  }
  return out;
}
