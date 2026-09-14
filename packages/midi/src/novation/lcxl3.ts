/**
 * Novation Launch Control XL 3 — SysEx.
 *
 * The XL 3 is the recommended control surface for this project (see
 * docs/research-brief.md): 8 touch-sensitive 60mm faders, 24 *endless* encoders
 * with host-drivable RGB rings, 16 buttons, a 128×64 OLED, and 5-pin DIN in and
 * out — class-compliant, bus-powered, and about $230.
 *
 * What makes it usable as a sequencer surface rather than a dumb CC box is that
 * its LEDs are host-drivable. That matters more than the control count: with
 * 24 endless encoders carrying RGB rings you get three live parameters per
 * track across 8 tracks, with visible state and no page-switch jumps.
 *
 * Framer: F0 00 20 29 <family> <member> <command> … F7
 *         00 20 29 is Focusrite/Novation; the XL 3's ids are 02 15.
 *
 * Verified against Novation's Programmer's Reference Guide. The one thing that
 * is NOT documented is the Custom Mode *push* format (command 05): it has been
 * reverse-engineered by the community and works, but is unversioned and liable
 * to break. Authoring modes in Novation Components and treating programmatic
 * mode writes as a stretch goal is the honest plan — Components has no Linux
 * build, so that needs one Mac/PC session.
 */

/** Focusrite/Novation manufacturer id. */
export const NOVATION_MANUFACTURER: readonly number[] = [0x00, 0x20, 0x29];
/** Launch Control XL 3 family/member ids. */
export const LCXL3: readonly number[] = [0x02, 0x15];

const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;

/** Build a message for the XL 3 from a command byte and payload. */
export function lcxl3Message(command: number, payload: readonly number[] = []): Uint8Array {
  return Uint8Array.from([SYSEX_START, ...NOVATION_MANUFACTURER, ...LCXL3, command, ...payload, SYSEX_END]);
}

/** Commands documented in the Programmer's Reference Guide. */
export const Command = {
  /** Custom RGB for a button or encoder LED. Payload: index, r, g, b. */
  setLedRgb: 0x01,
  /** Enter (0x7F) or leave (0x00) DAW mode. */
  dawMode: 0x02,
  /** Configure the display. Payload: target, config. */
  displayConfig: 0x04,
  /** Set display text. Payload: target, field, ASCII. */
  displayText: 0x06,
  /** Full-screen bitmap, 1216 bytes. One bitmap in memory at a time. */
  displayBitmap: 0x09,
} as const;

/**
 * Number of addressable LEDs: 24 encoder rings + 16 buttons + 8 side.
 *
 * Enough to show three parameter values per track with a ring each and still
 * light every track button — which is the whole reason this device was chosen.
 */
export const LED_COUNT = 48;

/** Indices of the 24 encoder rings. Row-major: encoder (row, col) = row * 8 + col. */
export const ENCODER_LEDS: readonly number[] = Array.from({ length: 24 }, (_, i) => i);

/** Set one LED's colour. */
export function setLedRgb(index: number, r: number, g: number, b: number): Uint8Array {
  const clamp = (v: number): number => Math.max(0, Math.min(127, Math.round(v)));
  return lcxl3Message(Command.setLedRgb, [index & 0x7f, 0x53, clamp(r), clamp(g), clamp(b)]);
}

export function setDawMode(on: boolean): Uint8Array {
  return lcxl3Message(Command.dawMode, [on ? 0x7f : 0x00]);
}

/** Display targets. 5–36 are controls, 53 is the stationary area, 54 an overlay. */
export const DisplayTarget = { stationary: 53, overlay: 54 } as const;

/** Write text to the display. ASCII 0x20–0x7E only. */
export function setDisplayText(target: number, field: number, text: string): Uint8Array {
  const bytes = [...text].map((c) => {
    const code = c.charCodeAt(0);
    return code >= 0x20 && code <= 0x7e ? code : 0x20;
  });
  return lcxl3Message(Command.displayText, [target & 0x7f, field & 0x7f, ...bytes]);
}

/** Bitmap geometry: 19 bytes per row, 64 rows, MSB is the leftmost pixel. */
export const BITMAP_WIDTH = 19 * 8; // 152
export const BITMAP_HEIGHT = 64;
export const BITMAP_BYTES = 19 * BITMAP_HEIGHT; // 1216

/**
 * Render a monochrome bitmap.
 *
 * `pixel(x, y)` returns whether the pixel is lit. Only one bitmap can be held
 * in memory at a time, so an animated step matrix is not possible — this is the
 * XL 3's real limitation, and the reason the research recommends pairing it
 * with a Launchpad Mini for per-step LED state.
 */
export function buildBitmap(pixel: (x: number, y: number) => boolean): Uint8Array {
  const out = new Uint8Array(BITMAP_BYTES);
  for (let y = 0; y < BITMAP_HEIGHT; y++) {
    for (let x = 0; x < BITMAP_WIDTH; x++) {
      if (!pixel(x, y)) continue;
      const byteIndex = y * 19 + (x >> 3);
      out[byteIndex] = (out[byteIndex] ?? 0) | (0x80 >> (x & 7));
    }
  }
  return out;
}

export function setBitmap(target: number, bitmap: Uint8Array): Uint8Array {
  if (bitmap.length !== BITMAP_BYTES) {
    throw new RangeError(`bitmap must be ${BITMAP_BYTES} bytes, got ${bitmap.length}`);
  }
  return lcxl3Message(Command.displayBitmap, [target & 0x7f, ...bitmap, 0x7f]);
}

/**
 * Feature controls arrive on MIDI channel 7 (zero-based 6); queries are sent to
 * channel 8 and replies come back on channel 7.
 */
export const FEATURE_CHANNEL = 6;

/** Feature CC numbers, on the feature channel. */
export const FeatureCc = {
  /** Surface mode. 1/2 = DAW Mixer/Control; 6–9 and 18–29 = Custom Modes 1–16. */
  surfaceMode: 30,
  shift: 63,
  /** Per-row encoder relative mode. */
  encoderRelativeRow1: 69,
  encoderRelativeRow2: 72,
  encoderRelativeRow3: 73,
  /** Fader pickup on/off. NOT on by default — send this to enable it. */
  faderPickup: 70,
  /** Touch events from the capacitive faders. */
  touch: 71,
  globalChannel: 100,
  ledBrightness: 111,
  screenBrightness: 112,
  encoderCurve: 121,
} as const;

/** Fader pickup is off by default; a sequencer almost always wants it on. */
export function enableFaderPickup(): { channel: number; cc: number; value: number } {
  return { channel: FEATURE_CHANNEL, cc: FeatureCc.faderPickup, value: 127 };
}

/** Select a Custom Mode by number (1–16). */
export function selectCustomMode(mode: number): { channel: number; cc: number; value: number } {
  return { channel: FEATURE_CHANNEL, cc: FeatureCc.surfaceMode, value: 5 + Math.max(1, Math.min(16, mode)) };
}
