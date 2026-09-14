/**
 * @gr00ve/midi — MIDI I/O, controller mapping, and device-specific SysEx.
 *
 * Split into three layers on purpose:
 *
 *   webmidi.ts   transport — getting ports, and coping with browser gaps
 *   learn.ts     semantics — what a CC *means* (deltas, takeover)
 *   novation/    devices  — SysEx for a specific surface's LEDs and display
 *
 * The device layer is last because it is the most disposable: the sequencer
 * must work with no hardware at all, and a different surface should be a new
 * file here rather than a change anywhere else.
 */

export * from './learn.ts';
export * from './webmidi.ts';
export * from './novation/lcxl3.ts';
export * from './output.ts';
export * from './akai/apcMiniMk2.ts';
