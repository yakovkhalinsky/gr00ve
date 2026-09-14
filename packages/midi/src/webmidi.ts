/**
 * Web MIDI access.
 *
 * **Target platform: Chrome** (decided 2026-09-14). That is a deliberate
 * narrowing and it simplifies things — no Safari or Firefox fallbacks, and a
 * Chromium kiosk on a Pi is a legitimate deployment target.
 *
 * What Chrome-only buys and costs:
 *
 *   + Web MIDI works, including SysEx, so a surface's LEDs and display are
 *     drivable from the app.
 *   + AudioWorklet, WebGPU and PWA install are all available.
 *   + The same engine runs headless on a Raspberry Pi in kiosk mode.
 *   - Chrome 124+ requires a **permission prompt** for MIDI, and SysEx needs a
 *     separate grant, so first run is a two-step consent.
 *   - Secure context only: HTTPS or localhost. A kiosk on a Pi needs either a
 *     TLS cert or a localhost origin.
 *   - No MIDI 2.0 / UMP — the spec issue has been open since 2020.
 *   - Being a MIDI clock *slave* is effectively unsupported: the Audio WG has
 *     said it does not see a way to do stable clock input with existing JS
 *     APIs. Master only — drive external gear, do not follow it.
 *
 * Even Chrome-only, the app must degrade gracefully: every feature should be
 * playable with the on-screen controls alone, and MIDI is an enhancement.
 */

/** Whether this environment can do Web MIDI at all. */
export function midiSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}

/** True when running in a Chromium-based browser, the supported target. */
export function isChromium(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Edge and Opera are Chromium and work; Safari and Firefox are excluded.
  return /Chrome|Chromium|Edg\/|OPR\//.test(ua) && !/Firefox/.test(ua);
}

/** Why MIDI is unavailable, phrased for a user rather than a developer. */
export function unsupportedReason(): string {
  if (typeof navigator === 'undefined') return 'Not running in a browser.';
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Web MIDI needs a secure context — serve over HTTPS or localhost.';
  }
  if (!midiSupported()) {
    return 'This browser has no Web MIDI. This app targets Chrome.';
  }
  return '';
}

/**
 * Request access, with SysEx.
 *
 * `sysex: true` is required for LED and display control on the recommended
 * surface. It also widens the permission request, so it is worth only asking
 * for it when the user has actually attached hardware.
 */
export async function requestAccess(sysex = true): Promise<MIDIAccess> {
  if (!midiSupported()) throw new Error(unsupportedReason());
  return navigator.requestMIDIAccess({ sysex });
}

export interface MidiPorts {
  readonly inputs: MIDIInput[];
  readonly outputs: MIDIOutput[];
}

export async function requestPorts(sysex = true): Promise<MidiPorts> {
  const access = await requestAccess(sysex);
  return { inputs: [...access.inputs.values()], outputs: [...access.outputs.values()] };
}

/**
 * Novation's Launch Control XL 3 exposes **four** USB MIDI interfaces.
 *
 * This is a documented trap: custom-mode surface data arrives only on `Main`,
 * while DAW-mode data arrives only on `DAW`. Binding the wrong pair produces a
 * surface that appears connected and does nothing, which is a genuinely
 * expensive bug to find.
 *
 * The same device also enumerates as a USB mass-storage device on first connect
 * because of its "Easy Start" behaviour; that is disabled by holding both Page
 * buttons while connecting.
 */
export type NovationPortRole = 'main' | 'daw' | 'toDin1' | 'toDin2';

export function classifyNovationPort(name: string): NovationPortRole | undefined {
  const n = name.toLowerCase();
  if (!n.includes('lcxl3') && !n.includes('launch control xl')) return undefined;
  if (n.includes('todin2')) return 'toDin2';
  if (n.includes('todin1')) return 'toDin1';
  if (n.includes('daw')) return 'daw';
  return 'main';
}

/**
 * Find the port pair for a Launch Control XL 3.
 *
 * Prefers `Main` for both directions; falls back to any pair mentioning the
 * device so an unfamiliar firmware naming scheme does not silently break.
 */
export function findLaunchControlXl3(ports: MidiPorts): {
  input: MIDIInput | undefined;
  output: MIDIOutput | undefined;
} {
  const pick = <T extends MIDIInput | MIDIOutput>(list: T[]): T | undefined =>
    list.find((p) => classifyNovationPort(p.name ?? '') === 'main') ??
    list.find((p) => classifyNovationPort(p.name ?? '') !== undefined);

  return { input: pick(ports.inputs), output: pick(ports.outputs) };
}

// TODO(midi-learn): hook raw CC into the mapping layer.
//
// Every incoming CC should resolve to `{ paramId, mode, channel }`, then go
// through learn.ts — `decodeRelative` for endless encoders, `pickupUpdate` for
// absolute faders. Feedback to motorised faders and LED rings is always sent
// ABSOLUTE, even for parameters driven by a relative encoder; sending the
// relative value back is a common and confusing mistake.
