/**
 * @gr00ve/audio — scheduling and playback.
 *
 * Everything that touches Web Audio lives here; everything musical lives in
 * @gr00ve/core. The split keeps the generators testable without a browser and
 * keeps the audio thread free of logic that could block it.
 *
 * The pure parts (`transport.ts`, `timeline.ts`) are unit-tested under
 * `node --test` with no AudioContext at all. The browser-only parts
 * (`scheduler.ts`, `voice.ts`, `engine.ts`) need a real audio device and are
 * exercised by driving the app.
 */

export * from './scheduler.ts';
export * from './timeline.ts';
export * from './transport.ts';
export * from './instrument.ts';
export * from './voice.ts';
export * from './drums.ts';
export * from './engine.ts';

// Not yet built, and deliberately so:
//
//   - **Resonance-coupled accent.** On real hardware the accent sweep
//     capacitor does not fully discharge, so successive accents climb — the
//     source of the classic screaming acid line. `Voice` raises level and
//     cutoff on accent but does not model that accumulation. It is the single
//     highest-value next addition to the voice.
//   - **Per-track drum tuning.** `DrumParams` carries `tune` and `decay`
//     multipliers, and `DrumVoice` honours both, but nothing in the UI exposes
//     them — every drum currently plays at its designed tuning. Wiring two
//     encoders per rhythm track is the obvious next step.
//   - **A polyphonic allocator.** Tracks are monophonic, which is right for
//     melodic lines and matches the 303. If a track ever needs chords, note
//     that the slide rule breaks naive allocators that track one `prev_note`:
//     two same-pitch notes at different accents need Modified-MVA (duplicate
//     pitches allowed, release oldest-first).
//   - **Open303-faithful DSP.** `Voice` is a plain saw → lowpass → VCA, tuned
//     to sit in the right place. Open303 (MIT, C++) is the reference if the
//     filter ever needs to be authentic rather than merely convincing.
