/**
 * Step → time mapping.
 *
 * Pure arithmetic, deliberately separated from the engine so it can be tested
 * without an AudioContext. This is the part of playback most likely to be
 * subtly wrong, and the failures are the kind you hear rather than see: swing
 * applied to the wrong parity, a cursor that drifts against the audio clock, or
 * steps skipped across a window boundary.
 *
 * All times are **AudioContext time in seconds**, never `performance.now()`.
 * The whole point of the lookahead design is that event times come from the
 * audio clock, so drift is impossible by construction.
 */

import { fraction } from '@gr00ve/core';

export interface Tempo {
  readonly bpm: number;
  /** Steps per beat. 4 = 16th notes at 4/4. */
  readonly stepsPerBeat: number;
  /** Swing ratio, 0 = straight. Applied to odd-numbered steps. */
  readonly swing: number;
}

/** Seconds per step. */
export function stepDuration(tempo: Tempo): number {
  return 60 / tempo.bpm / tempo.stepsPerBeat;
}

/**
 * Displacement of a step in *step units*: 0 on even steps, `swing / 2` on odd.
 *
 * Delegates to the core's rational `swingOffset` rather than recomputing, so
 * playback and the transport agree about what swing means — including the
 * continued-fraction approximation that keeps a triplet feel exact.
 */
export function swingDisplacement(stepIndex: number, swing: number): number {
  return fraction.toNumber(fraction.approximate(Math.max(0, Math.min(0.9, swing)) / 2, 12)) *
    (stepIndex % 2 === 1 ? 1 : 0);
}

/** Absolute time of a step, given the transport's start time. */
export function stepTime(stepIndex: number, startTime: number, tempo: Tempo): number {
  return startTime + (stepIndex + swingDisplacement(stepIndex, tempo.swing)) * stepDuration(tempo);
}

export interface Cursor {
  /** Next global step to schedule. */
  readonly step: number;
  /** Time that step falls at. */
  readonly time: number;
}

// --- clock generation -------------------------------------------------------
//
// Timing clocks, for driving gear that keeps its own time: a clocked LFO, a
// second sequencer, a euclidean module. The *rate* is a MIDI convention, but
// the scheduling is the same lookahead arithmetic as everything else here, so
// it lives in this package rather than in @gr00ve/midi — the engine hands tick
// times to a sink and never learns what a status byte is.

/** Timing clocks per quarter note. Fixed at 24 by the MIDI spec. */
export const PPQN = 24;

/** A running clock cursor: which tick is next, and when it falls. */
export interface ClockCursor {
  /** Tick index since the transport started. */
  readonly tick: number;
  /** Audio time of that tick, seconds. */
  readonly time: number;
}

/** Seconds between clock ticks at a given tempo. */
export function clockInterval(bpm: number): number {
  return 60 / Math.max(1, bpm) / PPQN;
}

/**
 * Collect every clock tick due before `horizon` and advance the cursor.
 *
 * Same shape as `collectDueSteps`, and for the same reason: ticks come from the
 * audio clock, so drift is impossible by construction rather than corrected
 * later. A tempo change takes effect from the next tick, which is what a rack
 * following the clock expects.
 */
export function collectClockTicks(
  cursor: ClockCursor,
  bpm: number,
  horizon: number,
): { times: number[]; cursor: ClockCursor } {
  const interval = clockInterval(bpm);
  const times: number[] = [];
  let tick = cursor.tick;
  let time = cursor.time;
  // Bounded so a nonsense tempo cannot spin forever and wedge the caller.
  for (let guard = 0; guard < 4096 && time < horizon; guard++) {
    times.push(time);
    time += interval;
    tick += 1;
  }
  return { times, cursor: { tick, time } };
}

export interface DueSteps {
  readonly steps: readonly { step: number; time: number }[];
  readonly cursor: Cursor;
}

/**
 * Collect every step due before `horizon`, and return the advanced cursor.
 *
 * The cursor is monotonic rather than recomputed from the origin each call,
 * which keeps the scheduler cheap. The increment is derived from the difference
 * in swing displacement between consecutive steps rather than from a fixed
 * step duration — swing makes the grid non-uniform, so a constant increment
 * would drift by `swing` seconds per bar.
 */
export function collectDueSteps(cursor: Cursor, tempo: Tempo, horizon: number): DueSteps {
  const duration = stepDuration(tempo);
  const steps: { step: number; time: number }[] = [];

  let step = cursor.step;
  let time = cursor.time;
  // Bounded so a nonsense tempo (or a horizon far in the future) cannot spin
  // forever and wedge the audio thread's caller.
  for (let guard = 0; guard < 4096 && time < horizon; guard++) {
    steps.push({ step, time });
    const here = swingDisplacement(step, tempo.swing);
    const next = swingDisplacement(step + 1, tempo.swing);
    time += (1 + next - here) * duration;
    step += 1;
  }

  return { steps, cursor: { step, time } };
}

/**
 * The inverse mapping, for the playhead display.
 *
 * The UI must not light a step when it is *scheduled* — the lookahead runs
 * ~100ms ahead, so highlighting on schedule makes the playhead visibly lead the
 * sound. The engine instead queues `(step, time)` pairs and releases each one
 * when the audio clock actually reaches it.
 */
export function stepsDueForDisplay(
  queue: readonly { step: number; time: number }[],
  now: number,
): { due: readonly { step: number; time: number }[]; rest: readonly { step: number; time: number }[] } {
  const i = queue.findIndex((e) => e.time > now);
  const split = i === -1 ? queue.length : i;
  return { due: queue.slice(0, split), rest: queue.slice(split) };
}
