/**
 * Transport: tempo, swing, and per-track loop lengths.
 *
 * Swing and polymeter are where exact rational time earns its keep. A swing
 * ratio of 2/3 is a triplet; expressed in floating point it drifts against the
 * bar, and per-track loop lengths only resynchronise exactly if their periods
 * are compared as rationals.
 *
 * Polymeter is the cheapest source of long-form variation in a multi-track
 * sequencer: a 16-step bass against a 12-step arp against a 7-step pad repeats
 * only after lcm(16,12,7) = 336 steps — roughly 21 bars from 35 stored steps —
 * and a listener hears that as composed rather than looped. Elektron implements
 * per-track length too, and its users routinely confuse it with pattern length,
 * so the UI must make "loop length" explicit and independent.
 */

import { fraction, type Fraction } from '@gr00ve/core';
import type { StepGrid } from '@gr00ve/core';

export interface Track {
  readonly id: string;
  readonly name: string;
  readonly grid: StepGrid;
  /**
   * Loop length in steps, independent of the pattern's own length.
   * Defaults to the grid's length when omitted.
   */
  readonly length?: number;
  /** Playback rate multiplier for this track. 1 is normal. */
  readonly speed?: number;
  readonly mute?: boolean;
  readonly solo?: boolean;
}

export interface TransportState {
  readonly bpm: number;
  /** Usually 16 — i.e. 16th-note steps. */
  readonly stepsPerBeat: number;
  /**
   * Swing amount, 0..1. 0 is straight, ~0.33 approximates a triplet feel, and
   * UK garage sits around 0.4–0.6. Applied to odd-numbered steps.
   */
  readonly swing: number;
  readonly tracks: readonly Track[];
}

export const DEFAULT_TRANSPORT: TransportState = {
  bpm: 128,
  stepsPerBeat: 2, // 8th-note steps by default; 4 for 16ths
  swing: 0,
  tracks: [],
};

/** Seconds per step at the current tempo. */
export function stepSeconds(state: Pick<TransportState, 'bpm' | 'stepsPerBeat'>): number {
  return 60 / state.bpm / state.stepsPerBeat;
}

/** Effective loop length of a track, resolving the default. */
export function trackLength(track: Track): number {
  return Math.max(1, track.length ?? track.grid.length);
}

/**
 * Swing displacement for a step, as a fraction of a step.
 *
 * Odd steps are pushed late. Returned as a rational so a triplet swing stays
 * exact indefinitely rather than accumulating error — which requires
 * *approximating* the float ratio rather than scaling it: 2/3 scaled by 1000
 * gives 667/2000, a subtly different rhythm that drifts against the bar.
 *
 * `swing` is a ratio, not a displacement: 2/3 is a triplet feel, and the
 * offset is half of it.
 */
export function swingOffset(stepIndex: number, swing: number): Fraction {
  if (swing === 0 || stepIndex % 2 === 0) return fraction.ZERO;
  // The invariant is offset < 1: a swung step is delayed *within its own slot*,
  // so it only collides with its neighbour once it would reach the next step.
  // Half a step is a valid extreme (the swung note sits midway to the next),
  // not a corruption. Clamping well below 1 keeps that guarantee with room to
  // spare even after rational approximation rounds up.
  const s = Math.max(0, Math.min(0.9, swing));
  return fraction.approximate(s / 2, 12);
}

/**
 * Steps until every track realigns — the polymeter period.
 *
 * Uses the exact integer LCM, so a 16/12/7 stack reports 336 rather than the
 * ~335.9 a floating-point product would give.
 */
export function realignSteps(state: TransportState): number {
  const lengths = state.tracks.map(trackLength);
  if (lengths.length === 0) return 0;
  return lengths.reduce((acc, n) => fraction.lcm(acc, n), 1);
}

/** Which step of its own loop a track is on, given the global step counter. */
export function trackStep(track: Track, globalStep: number): number {
  const len = trackLength(track);
  const speed = track.speed ?? 1;
  const advanced = Math.floor(globalStep * speed);
  return ((advanced % len) + len) % len;
}

/** The step a track should sound at a given global step, or `null`. */
export function stepAt(track: Track, globalStep: number): StepGrid[number] {
  return track.grid[trackStep(track, globalStep)] ?? null;
}

/** Is a track audible, honouring solo? */
export function isAudible(state: TransportState, track: Track): boolean {
  if (state.tracks.some((t) => t.solo)) return track.solo === true;
  return track.mute !== true;
}
