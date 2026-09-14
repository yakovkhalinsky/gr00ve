/**
 * @gr00ve/audio — scheduling and playback.
 *
 * Everything that touches Web Audio lives here; everything musical lives in
 * @gr00ve/core. The split keeps the generators testable without a browser and
 * keeps the audio thread free of logic that could block it.
 */

export * from './scheduler.ts';
export * from './transport.ts';

// TODO(voices): voice allocation and synthesis.
//
// Deliberately unimplemented — this is the part of the project with the least
// research behind it and the most taste involved. Notes from the brief:
//
//   - A monophonic 303-style voice with accent (resonance-coupled, so repeated
//     accents climb) and slide (a flag consumed by the FOLLOWING step) covers
//     acid, the single most-copied melodic voice in electronic music.
//   - Slide between two same-pitch notes at different accents breaks naive
//     allocators that track a single `prev_note`. The reference fix is a
//     Modified-MVA allocator: allow duplicate pitches, release oldest-first.
//   - Open303 (MIT, C++) is the DSP reference if authenticity matters.
//
// Until then, drive an external synth over MIDI — which is also the lowest
// latency path, since Web MIDI output does not involve the audio graph.
