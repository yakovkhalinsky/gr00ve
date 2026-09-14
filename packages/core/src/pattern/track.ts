/**
 * Track roles.
 *
 * A track is either a **voice** — pitched, playing notes drawn from a scale —
 * or a **rhythm** — unpitched, playing one percussion sound per step.
 *
 * This split is not cosmetic. The genre research found that the *melody
 * carrier* changes by genre — piano and strings in house, the 303 in acid,
 * a supersaw in trance, sub-bass in drum & bass, an arpeggio in synthwave —
 * which argues for the generator being a per-track choice rather than one
 * global algorithm. And the hardware does the same thing: a Circuit Tracks is
 * two synth tracks plus four drum tracks, and on a Digitakt every track is one
 * sample. A track that can only be melodic is a track that cannot be a
 * drum machine.
 *
 * Consequence worth knowing: on a rhythm track the step's `pitch` field is
 * **ignored**, because the track already fixes which drum it plays. The field
 * is preserved rather than cleared, so switching a track back to `voice`
 * restores the melody it had.
 */

export type TrackKind = 'voice' | 'rhythm';

export const TRACK_KINDS: readonly TrackKind[] = ['voice', 'rhythm'];

export const TRACK_KIND_LABELS: Readonly<Record<TrackKind, string>> = {
  voice: 'Voice',
  rhythm: 'Rhythm',
};

/** The percussion palette. Six is enough for a kit without inviting a menu. */
export type DrumType = 'kick' | 'snare' | 'hat' | 'clap' | 'tom' | 'rim';

export const DRUM_TYPES: readonly DrumType[] = ['kick', 'snare', 'hat', 'clap', 'tom', 'rim'];

export const DRUM_LABELS: Readonly<Record<DrumType, string>> = {
  kick: 'Kick',
  snare: 'Snare',
  hat: 'Hat',
  clap: 'Clap',
  tom: 'Tom',
  rim: 'Rim',
};

export function isTrackKind(value: unknown): value is TrackKind {
  return value === 'voice' || value === 'rhythm';
}

export function isDrumType(value: unknown): value is DrumType {
  return typeof value === 'string' && (DRUM_TYPES as readonly string[]).includes(value);
}

/** A sensible starter kit spread across eight tracks. */
export const DEFAULT_KIT: readonly DrumType[] = ['kick', 'clap', 'hat', 'rim', 'kick', 'snare', 'hat', 'tom'];

/**
 * The MIDI note each drum plays.
 *
 * These are General MIDI drum-map numbers rather than arbitrary ones, so a
 * rhythm track sent out over MIDI behaves sensibly whichever it lands on: a CV
 * converter only cares that a gate opened, but a drum module or a DAW will
 * decode the note, and 36 being a kick is the closest thing to a standard the
 * format has.
 */
export const DRUM_MIDI_PITCH: Readonly<Record<DrumType, number>> = {
  kick: 36, // Bass Drum 1
  rim: 37, // Side Stick
  snare: 38, // Acoustic Snare
  clap: 39, // Hand Clap
  tom: 45, // Low Tom
  hat: 42, // Closed Hi-Hat
};
