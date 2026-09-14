/**
 * Scales, modes and quantisation.
 *
 * The cheapest layer in the whole system and the one with the highest payoff:
 * quantisation is what makes an arbitrary generator's output sound *intended*
 * rather than random. Everything here is pure arithmetic — no dependencies.
 *
 * The mode list is chosen from the genre research rather than from completeness:
 * Aeolian, Dorian and Phrygian cover nearly the entire electronic-music field,
 * and functional major is almost absent from it. See docs/research-brief.md.
 */

export type ScaleName =
  | 'aeolian'
  | 'dorian'
  | 'phrygian'
  | 'harmonicMinor'
  | 'minorPentatonic'
  | 'majorPentatonic'
  | 'blues'
  | 'ionian'
  | 'lydian'
  | 'mixolydian';

/** Semitone offsets from the root. */
export const SCALES: Readonly<Record<ScaleName, readonly number[]>> = {
  // The workhorse. "99.9% of techno is minor."
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  // Raised 6th: keeps techno pads from sounding merely sad. The default choice
  // for ambient-techno and most of the modal end of house.
  dorian: [0, 2, 3, 5, 7, 9, 10],
  // Flat 2nd: acid, darksynth, dubstep. Unstable on purpose.
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  // The leading tone, for trance and anything wanting a stronger pull home.
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  // Acid-safe: cannot produce a wrong note.
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/** Human-facing names, for the encoder that picks one. */
export const SCALE_LABELS: Readonly<Record<ScaleName, string>> = {
  aeolian: 'Aeolian',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  harmonicMinor: 'Harmonic minor',
  minorPentatonic: 'Minor pentatonic',
  majorPentatonic: 'Major pentatonic',
  blues: 'Blues',
  ionian: 'Ionian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
};

export const SCALE_NAMES = Object.keys(SCALES) as ScaleName[];

/** Is `pitch` a member of the scale rooted at `root`? */
export function inScale(pitch: number, root: number, scale: ScaleName): boolean {
  const degree = ((pitch - root) % 12 + 12) % 12;
  return SCALES[scale].includes(degree);
}

/**
 * Snap to the nearest in-scale pitch.
 *
 * Preserves *closeness* — the contour and the size of every leap survive, and
 * notes only move as far as they must. Good for cleaning up a random walk or an
 * imported phrase.
 */
export function quantizeNearest(pitch: number, root: number, scale: ScaleName): number {
  const set = SCALES[scale];
  for (let d = 0; d <= 6; d++) {
    for (const cand of [pitch - d, pitch + d]) {
      const degree = ((cand - root) % 12 + 12) % 12;
      if (set.includes(degree)) return cand;
    }
  }
  return pitch;
}

/**
 * Map a scale degree to a MIDI pitch, wrapping into higher octaves.
 *
 * Degree 0 is the root, degree 7 is the octave in a 7-note scale. Negative
 * degrees wrap downward, which matters for generators that walk below the root.
 *
 * This is the *contour-preserving* quantiser: unlike `quantizeNearest`, a step
 * of one degree is always one scale step, so a smooth line stays smooth. Use it
 * for generators that think in degrees, and `quantizeNearest` for ones that
 * think in semitones.
 */
export function degreeToPitch(root: number, scale: ScaleName, degree: number): number {
  const set = SCALES[scale];
  const n = set.length;
  const octave = Math.floor(degree / n);
  const index = degree - octave * n;
  return root + 12 * octave + (set[index] as number);
}

/** Inverse of `degreeToPitch`, for the scale degree nearest at or below `pitch`. */
export function pitchToDegree(pitch: number, root: number, scale: ScaleName): number {
  const set = SCALES[scale];
  const n = set.length;
  const rel = pitch - root;
  const octave = Math.floor(rel / 12);
  const within = rel - octave * 12;
  let best = 0;
  for (let i = 0; i < n; i++) if ((set[i] as number) <= within) best = i;
  return octave * n + best;
}

/** All in-scale pitches across `octaves` octaves starting at `root`. */
export function scalePitches(root: number, scale: ScaleName, octaves = 2): number[] {
  const out: number[] = [];
  for (let d = 0; d < SCALES[scale].length * octaves; d++) out.push(degreeToPitch(root, scale, d));
  return out;
}

/** Note names, for display. */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function noteName(pitch: number): string {
  const name = NOTE_NAMES[((pitch % 12) + 12) % 12] as string;
  const octave = Math.floor(pitch / 12) - 1;
  return `${name}${octave}`;
}
