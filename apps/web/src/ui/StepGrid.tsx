import type { StepGrid as Grid } from '@gr00ve/core';

import { STEPS_PER_ROW, describeLayout, isDownbeat, layoutRows } from './stepLayout.ts';

/**
 * The per-track step editor.
 *
 * Steps wrap into **rows of 8** — see `stepLayout.ts` for why, and for the
 * wrap rule itself, which lives there so it can be unit-tested. Node's type
 * stripping cannot parse JSX, so nothing defined in this file is reachable from
 * `node --test`; keep anything worth asserting out of here.
 *
 * **DOM, not canvas** — and not for performance reasons. At 8 tracks × 16 steps
 * a canvas would be faster, but canvas elements cannot receive focus, so a
 * screen reader cannot announce per-step state and keyboard users cannot reach
 * a step at all. A sequencer is a small grid; the forcing function is
 * accessibility and touch accuracy, not frame rate.
 *
 * Sizing follows WCAG 2.5.5: below roughly 24px targets a thumb-drumming
 * performer misses about a quarter of their taps, so 44px is the floor here.
 *
 * Each step is a real `button` inside a `grid`, and its accessible name carries
 * both position and state ("Track 1, step 5, on") so the grid is navigable
 * without seeing it.
 */

export interface StepGridProps {
  readonly trackName: string;
  readonly trackIndex: number;
  readonly steps: Grid;
  /** Current playing step, or -1 when stopped. */
  readonly playhead?: number;
  readonly selected?: boolean;
  readonly onToggle: (index: number) => void;
  readonly onSelect?: () => void;
  /** Override the wrap width. */
  readonly perRow?: number;
}

export function StepGrid({
  trackName,
  trackIndex,
  steps,
  playhead = -1,
  selected = false,
  onToggle,
  onSelect,
  perRow = STEPS_PER_ROW,
}: StepGridProps): React.JSX.Element {
  const rows = layoutRows(steps, perRow);

  return (
    <div
      className={`steps${selected ? ' is-selected' : ''}`}
      role="grid"
      aria-label={`${trackName}, ${describeLayout(steps.length, perRow)}`}
      onPointerDown={onSelect}
    >
      {rows.map((row) => (
        <div role="row" className="steps__row" key={row.base}>
          {row.steps.map((step, col) => {
            const i = row.base + col;
            const on = step !== null;
            const accent = step?.accent === true;
            const playing = i === playhead;
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                className={[
                  'step',
                  on ? 'is-on' : '',
                  accent ? 'is-accent' : '',
                  playing ? 'is-playing' : '',
                ].filter(Boolean).join(' ')}
                // Absolute index, so downbeat marks stay on the beat no matter
                // where the row wraps.
                data-beat={isDownbeat(i) ? 'downbeat' : 'offbeat'}
                // Marks the half-bar boundary, i.e. the row start.
                data-row-start={col === 0 ? 'true' : undefined}
                aria-label={`${trackName}, step ${i + 1}, ${on ? (accent ? 'accented' : 'on') : 'off'}`}
                aria-pressed={on}
                data-track={trackIndex}
                data-step={i}
                onClick={() => onToggle(i)}
              />
            );
          })}
          {/* Spacers are aria-hidden: an empty gridcell is just noise to a
            * screen reader, but the cell footprint keeps columns aligned. */}
          {Array.from({ length: row.padding }, (_, k) => (
            <span key={`pad-${k}`} className="step step--pad" aria-hidden="true" />
          ))}
        </div>
      ))}
    </div>
  );
}
