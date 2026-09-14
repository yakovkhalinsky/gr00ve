import type { StepGrid as Grid } from '@gr00ve/core';

/**
 * The per-track step editor.
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
 * without seeing it. Per-step LED information belongs here rather than encoded
 * as brightness on a knob — multiplexed LED meaning is a documented source of
 * confusion on real hardware.
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
}

export function StepGrid({
  trackName,
  trackIndex,
  steps,
  playhead = -1,
  selected = false,
  onToggle,
  onSelect,
}: StepGridProps): React.JSX.Element {
  return (
    <div
      className={`steps${selected ? ' is-selected' : ''}`}
      role="grid"
      aria-label={`${trackName} steps`}
      onPointerDown={onSelect}
    >
      <div role="row" className="steps__row">
        {steps.map((step, i) => {
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
              // Four-on-the-floor positions get a weaker visual downbeat so the
              // grid is readable at a glance without counting.
              data-beat={i % 4 === 0 ? 'downbeat' : 'offbeat'}
              aria-label={`${trackName}, step ${i + 1}, ${on ? (accent ? 'accented' : 'on') : 'off'}`}
              aria-pressed={on}
              data-track={trackIndex}
              data-step={i}
              onClick={() => onToggle(i)}
            />
          );
        })}
      </div>
    </div>
  );
}
