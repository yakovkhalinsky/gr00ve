import { useCallback, useRef, useState } from 'react';

/**
 * A rotary control.
 *
 * The interaction model matters more than the drawing, and it is where most
 * knob implementations go wrong:
 *
 *   - **Relative drag, never jump-to-cursor.** On pointer down we capture the
 *     pointer and accumulate `movementY` from wherever the cursor already is.
 *     Jumping the value to the cursor's angle is the "jumps on grab" bug, and
 *     it is the single most common complaint about on-screen knobs.
 *   - **Shift for fine.** Because a fixed encoder curve is the most-complained-
 *     about detail in the whole survey: one drag covering a parameter's full
 *     range makes a four-value parameter feel broken.
 *   - **Wheel, arrows and Home/End** for precision without a drag.
 *   - **Double-click to type a value**, for when you know the number.
 *
 * The rendered element is a real `slider` for assistive tech — not a div with
 * an aria-label bolted on — with `aria-valuenow`/`min`/`max` and a text label.
 *
 * It deliberately mirrors a hardware endless encoder rather than a pot: there
 * is no detent or absolute position, so it can be re-targeted to a different
 * parameter without a value jump. That is the same property that makes the
 * Launch Control XL 3's 24 endless encoders worth more than 24 pots.
 */

export interface KnobProps {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  /** Normalised step as a fraction of the range. Default 1/100. */
  readonly step?: number;
  readonly onChange: (value: number) => void;
  readonly size?: number;
  /** Optional value formatter for the readout. */
  readonly format?: (value: number) => string;
}

const ANGLE_MIN = -135;
const ANGLE_MAX = 135;

export function Knob({
  label,
  value,
  min = 0,
  max = 1,
  step,
  onChange,
  size = 52,
  format,
}: KnobProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const dragStart = useRef<{ y: number; value: number } | null>(null);

  const range = max - min;
  // A knob with nothing to choose between — a one-step loop, say — has range 0,
  // and dividing by it would push NaN through quantise and into the store,
  // where it would sit as a silently broken value. Guarded rather than assumed
  // away, because the range is now derived from data (a pattern's length)
  // rather than being a literal.
  const resolution = (step ?? 1 / 100) * (range === 0 ? 1 : range);

  const clamp = useCallback((v: number) => Math.max(min, Math.min(max, v)), [min, max]);

  const commit = useCallback(
    (v: number) => {
      // Never emit NaN, whatever arrives.
      onChange(clamp(Number.isFinite(v) ? v : min));
    },
    [clamp, min, onChange],
  );

  const quantise = useCallback(
    (v: number) => {
      if (range === 0) {
        commit(min);
        return;
      }
      // Snap to the resolution so values stay stable and displayable.
      const snapped = Math.round((v - min) / resolution) * resolution + min;
      commit(snapped);
    },
    [commit, min, range, resolution],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (editing) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStart.current = { y: e.clientY, value };
      setDragging(true);
    },
    [editing, value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = dragStart.current;
      if (!start) return;
      // Relative movement only — the value never jumps to the cursor.
      // 150px of travel spans the full range; Shift makes it 10× finer.
      const sensitivity = e.shiftKey ? 1500 : 150;
      const delta = ((start.y - e.clientY) / sensitivity) * range;
      quantise(start.value + delta);
    },
    [quantise, range],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStart.current = null;
    setDragging(false);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const big = resolution * 10;
      switch (e.key) {
        case 'ArrowUp': case 'ArrowRight': quantise(value + (e.shiftKey ? resolution : big)); break;
        case 'ArrowDown': case 'ArrowLeft': quantise(value - (e.shiftKey ? resolution : big)); break;
        case 'Home': commit(min); break;
        case 'End': commit(max); break;
        default: return;
      }
      e.preventDefault();
    },
    [commit, max, min, quantise, resolution, value],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // React attaches wheel passively; the value still updates, and preventing
      // page scroll on a knob is handled by CSS `overscroll-behavior` on the rack.
      quantise(value - Math.sign(e.deltaY) * resolution);
    },
    [quantise, resolution, value],
  );

  const fraction = range === 0 ? 0 : (value - min) / range;
  const angle = ANGLE_MIN + fraction * (ANGLE_MAX - ANGLE_MIN);
  const display = format ? format(value) : `${Math.round(fraction * 100)}%`;

  return (
    <div className="knob">
      <div
        className={`knob__dial${dragging ? ' is-dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onWheel={onWheel}
        onDoubleClick={() => setEditing(true)}
      >
        <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
          <circle className="knob__track" cx="24" cy="24" r="19" />
          <circle
            className="knob__arc"
            cx="24" cy="24" r="19"
            strokeDasharray={`${fraction * 89.5} 200`}
            transform="rotate(135 24 24)"
          />
          <g transform={`rotate(${angle} 24 24)`}>
            <line className="knob__pointer" x1="24" y1="9" x2="24" y2="18" />
          </g>
        </svg>
      </div>
      <span className="knob__label">{label}</span>
      {editing ? (
        <input
          className="knob__input"
          type="number"
          autoFocus
          defaultValue={value}
          min={min}
          max={max}
          onBlur={(e) => {
            setEditing(false);
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed)) commit(parsed);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span className="knob__value">{display}</span>
      )}
    </div>
  );
}
