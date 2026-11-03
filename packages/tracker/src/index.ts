/**
 * @gr00ve/tracker — generative patterns for the Polyend Tracker.
 *
 * Pure model, generators and `.mtp` export. No DOM, no audio: the page drives
 * it, the tests exercise it in Node, and the same code could run headless.
 *
 * The pieces:
 *
 *   - `types.ts`      the generated pattern model and its documented ranges
 *   - `pitch.ts`      scale/register helpers, melodic line and Markov step
 *   - `generators.ts` Euclid, probability, Turing, walk, Markov + FX decoration
 *   - `fx.ts`         the four documented step-effect codes and their packing
 *   - `export.ts`     tracker-lib conversion, filename and writer
 */

export * from './types.ts';
export * from './pitch.ts';
export * from './generators.ts';
export * from './fx.ts';
export * from './export.ts';
