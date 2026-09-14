/**
 * Step-grid layout.
 *
 * Kept as plain `.ts` rather than inline in `StepGrid.tsx` for a concrete
 * reason: Node's built-in type stripping cannot handle JSX, so a `.tsx` module
 * cannot be imported by `node --test` at all. Anything worth asserting about
 * the grid has to live outside the component — and the wrap rule is worth
 * asserting, because getting it wrong silently renumbers steps.
 */

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
