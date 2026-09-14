/**
 * Lookahead scheduler.
 *
 * The canonical pattern (Chris Wilson's "A Tale of Two Clocks") is still
 * correct and still the recommendation for this project: a coarse JS timer
 * wakes periodically, reads `audioContext.currentTime`, and schedules
 * everything inside a short lookahead window using sample-accurate Web Audio
 * calls. Never let a JS callback's own latency be the note's onset time.
 *
 * Why this matters more than jitter figures suggest: measured jitter is on the
 * order of 8ms, which is 6–10% of a 16th note at 120–180 BPM — audible on dense
 * hats, inaudible on pads. The real hazard is *drift*, which this pattern
 * eliminates by deriving every event time from the audio clock rather than from
 * `performance.now()` or an accumulating counter.
 *
 * Deliberately not a framework. Tone.js's Transport has open clock bugs and a
 * stale `latest` tag; the research recommendation is to use it at most as a
 * node library and own the timing yourself.
 */

export interface SchedulerOptions {
  /** How far ahead to schedule, in milliseconds. */
  readonly lookaheadMs?: number;
  /** How often to wake, in milliseconds. Must be comfortably under lookahead. */
  readonly intervalMs?: number;
}

export type ScheduleFn = (windowStart: number, windowEnd: number, now: number) => void;

const DEFAULTS = { lookaheadMs: 100, intervalMs: 25 } as const;

export class Scheduler {
  // Fields are declared explicitly rather than via constructor parameter
  // properties: `erasableSyntaxOnly` disallows the latter, because they emit
  // real code rather than only types.
  private readonly ctx: Pick<AudioContext, 'currentTime'>;
  private readonly schedule: ScheduleFn;
  private readonly options: SchedulerOptions;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextWindowStart = 0;

  constructor(
    ctx: Pick<AudioContext, 'currentTime'>,
    schedule: ScheduleFn,
    options: SchedulerOptions = {},
  ) {
    this.ctx = ctx;
    this.schedule = schedule;
    this.options = options;
  }

  get running(): boolean {
    return this.timer !== undefined;
  }

  /**
   * Start scheduling.
   *
   * `originTime` lets the caller anchor the first window to a known audio-clock
   * position, so a transport started by a MIDI clock or a UI button both land
   * on the same grid.
   */
  start(originTime?: number): void {
    if (this.timer !== undefined) return;
    const { lookaheadMs, intervalMs } = { ...DEFAULTS, ...this.options };
    this.nextWindowStart = originTime ?? this.ctx.currentTime;

    const tick = (): void => {
      const horizon = this.ctx.currentTime + lookaheadMs / 1000;
      // Catch up if the timer was starved (tab throttling, GC pause) rather
      // than letting the window fall behind the audio clock.
      while (this.nextWindowStart < horizon) {
        const windowEnd = this.nextWindowStart + intervalMs / 1000;
        this.schedule(this.nextWindowStart, windowEnd, this.ctx.currentTime);
        this.nextWindowStart = windowEnd;
      }
    };

    tick();
    this.timer = setInterval(tick, intervalMs);
  }

  stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
