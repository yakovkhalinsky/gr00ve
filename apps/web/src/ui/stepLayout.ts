/**
 * Step-grid layout.
 *
 * Kept as plain `.ts` rather than inline in `StepGrid.tsx` for a concrete
 * reason: Node's built-in type stripping cannot handle JSX, so a `.tsx` module
 * cannot be imported by `node --test` at all. Anything worth asserting about
 * the grid has to live outside the component — and the wrap rule is worth
 * asserting, because getting it wrong silently renumbers steps.
 */

import { noteName } from '@gr00ve/core';

/**
 * Steps per visual row.
 *
 * Eight, because one row of 16 at a 44px touch target is ~790px before gaps —
 * it overflows the track strip entirely past 16 steps, and per-track loop
 * length (the polymeter feature) routinely goes past 16. Eight also lands on a
 * musical boundary: at 4 steps per beat it is exactly two beats, so every row
 * is a half-bar.
 */
export const STEPS_PER_ROW = 8;

/** Steps per beat, used only to describe the layout. */
export const STEPS_PER_BEAT = 4;

export interface StepRow<T> {
  /** Absolute index of this row's first step. Never resets per row. */
  readonly base: number;
  readonly steps: readonly T[];
  /**
   * Placeholder cells to append so the final short row keeps its columns
   * aligned with the rows above it. Without this, a 12-step loop would put its
   * last four cells under the *first* four columns and the beat grid would
   * visually shear.
   */
  readonly padding: number;
}

/**
 * Split steps into rows, preserving absolute indices.
 *
 * Step numbering is deliberately absolute — step 9 is step 9, not "row 2, step
 * 1" — because that is what every piece of step-sequencing hardware does and
 * what someone counting bars expects.
 */
export function layoutRows<T>(steps: readonly T[], perRow: number = STEPS_PER_ROW): StepRow<T>[] {
  const width = Math.max(1, Math.floor(perRow));
  const rows: StepRow<T>[] = [];
  for (let base = 0; base < steps.length; base += width) {
    const slice = steps.slice(base, base + width);
    rows.push({ base, steps: slice, padding: width - slice.length });
  }
  return rows;
}

/** Whether an absolute step index falls on a downbeat. */
export function isDownbeat(index: number, stepsPerBeat: number = STEPS_PER_BEAT): boolean {
  return index % stepsPerBeat === 0;
}

/** Human description of the layout, for the grid's accessible name. */
export function describeLayout(total: number, perRow: number = STEPS_PER_ROW): string {
  const rows = Math.ceil(total / Math.max(1, perRow));
  const rowWord = rows === 1 ? 'row' : 'rows';
  return `${total} steps in ${rows} ${rowWord} of ${perRow}`;
}

/**
 * The note text shown inside a step, or `''` for nothing.
 *
 * Two cases produce nothing, and both matter:
 *
 *   - **Rests.** A rest has no pitch, and a stale label from a cleared step
 *     would be worse than blank.
 *   - **Rhythm tracks.** A drum track carries pitches in its cells — they are
 *     preserved so switching the track back to a voice restores the melody —
 *     but the drum ignores them. Labeling a kick step "C3" would assert
 *     something false about what plays, so rhythm grids stay unlabelled. The
 *     drum it plays is already named in the picker above.
 *
 * Note names include the octave, which is the point: the mixer's octave weight
 * means two steps of the same pitch class can sit an octave apart, and that is
 * invisible without it.
 */
export function stepNoteText(pitch: number | null | undefined, showNotes: boolean): string {
  if (!showNotes || pitch === null || pitch === undefined) return '';
  return noteName(pitch);
}

/**
 * The accessible name for a step.
 *
 * Carries position, state and — when one is shown — the note, so the grid is
 * navigable without sight. Screen-reader users get the same information the
 * label gives everyone else rather than a bare "on".
 */
export function stepAriaLabel(
  trackName: string,
  index: number,
  state: { readonly on: boolean; readonly accent: boolean; readonly note: string },
): string {
  const status = state.on ? (state.accent ? 'accented' : 'on') : 'off';
  const parts = [`${trackName}, step ${index + 1}`, status];
  if (state.note) parts.push(state.note);
  return parts.join(', ');
}
