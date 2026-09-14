import type { PlaybackSink } from '@gr00ve/audio';
import {
  midiTimestamp, noteOff, noteOn, clockTick, velocityFor,
  transportStart, transportStop, type ClockDomain,
} from '@gr00ve/midi';

import { channelForTrack, findMidiOutput } from './midiPorts.ts';

/**
 * The bridge from the sequencer to a MIDI output.
 *
 * Takes the engine's note *intent* and turns it into wire messages. Two things
 * here are the difference between playing a rack and playing it in time:
 *
 * **The clock domain is re-sampled per event.** `MIDIOutput.send` timestamps
 * are `DOMHighResTimeStamp`s — the `performance.now()` domain — while the
 * engine schedules in `AudioContext.currentTime` seconds. The two clocks tick
 * at different rates, so a conversion calibrated once drifts by tens of
 * milliseconds over a session. Reading both at the same instant for every event
 * costs two property reads and removes the drift entirely.
 *
 * **Both note-on and note-off are scheduled up front.** A MIDI-to-CV module
 * derives its gate length from the gap between them, so a missing note-off is a
 * gate that never closes — the note hangs and the next one cannot retrigger.
 * `emitNote` in the engine has already clamped the duration to leave a sliver
 * of silence, so a slide still registers as two gates rather than one long one.
 */
export function createMidiSink(
  getContext: () => BaseAudioContext | undefined,
  getOutputId: () => string | null,
): PlaybackSink {
  function domain(): ClockDomain | undefined {
    const ctx = getContext();
    if (!ctx) return undefined;
    return { audioTime: ctx.currentTime, perfNow: performance.now() };
  }

  function send(data: number[], time?: number): void {
    const output = findMidiOutput(getOutputId());
    if (!output) return;
    // Without a timestamp the message goes out immediately, which is worse than
    // slightly late: it would ignore the scheduler's lookahead entirely.
    const dom = time === undefined ? undefined : domain();
    if (time !== undefined && dom === undefined) return;
    output.send(data, time === undefined ? undefined : midiTimestamp(time, dom as ClockDomain));
  }

  return {
    note(event) {
      const channel = channelForTrack(event.trackIndex);
      send(noteOn(channel, event.pitch, velocityFor(event.stepVelocity, event.accent)), event.time);
      send(noteOff(channel, event.pitch), event.time + event.duration);
    },
    clock(time) {
      send(clockTick(), time);
    },
    transportStart() {
      send(transportStart());
    },
    transportStop() {
      send(transportStop());
    },
  };
}
