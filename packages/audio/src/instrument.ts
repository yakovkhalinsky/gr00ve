/**
 * What the engine needs from anything that can play a step.
 *
 * `Voice` (pitched, 303-ish) and `DrumVoice` (unpitched, one-shot) both satisfy
 * this, so the engine can hold either without caring which. The signature is
 * deliberately shared rather than specialised: a drum ignores `freq` and
 * `glide`, and passing them anyway keeps the engine's per-step call site free
 * of branching.
 */

export interface Instrument {
  /**
   * Schedule a note.
   *
   * @param freq     Pitch in Hz. Ignored by unpitched instruments.
   * @param duration Gate length in seconds.
   * @param accent   Louder, and on a pitched voice also brighter.
   * @param glide    Tie from the sounding pitch rather than retriggering.
   *                 Ignored by instruments that cannot glide (drums are
   *                 one-shots, so a slide on a rhythm track simply does nothing).
   */
  noteOn(time: number, freq: number, duration: number, accent: boolean, glide?: boolean): void;

  /** Whether something is still sounding at `time` — i.e. a glide could tie in. */
  isSoundingAt(time: number): boolean;

  /** Fade out anything sounding, without a click. */
  release(time: number): void;

  dispose(): void;
}
