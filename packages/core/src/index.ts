/**
 * @gr00ve/core — generation and pattern logic.
 *
 * Deliberately pure: no DOM, no Web Audio, no MIDI. Everything here is plain
 * arithmetic over arrays and numbers, which is what makes it unit-testable in
 * Node with no browser and no mocks — and what lets the same generators drive a
 * Web Audio app, an offline renderer, or a MIDI-only headless build.
 *
 * The split is one of the few architectural decisions the research argues for
 * unanimously: keep the musical logic away from the audio thread and the
 * render loop.
 */

export * as fraction from './pattern/fraction.ts';
export type { Fraction } from './pattern/fraction.ts';

export * from './pattern/step.ts';
export * from './pattern/track.ts';
export * from './theory/scale.ts';
export * from './gen/rng.ts';
export * from './gen/euclid.ts';
export * from './gen/pitch-mixer.ts';
export * from './gen/walk.ts';
export * from './gen/turing.ts';
export * from './gen/chaos.ts';
