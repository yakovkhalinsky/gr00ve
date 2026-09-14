/**
 * A registry of the MIDI outputs the browser has handed us.
 *
 * `MIDIOutput` objects are live handles rather than data — they hold a
 * reference to a device and expose `send()` — so they deliberately do **not**
 * live in the zustand store. The store keeps the selected port's *id*, which is
 * serialisable and comparable, and the sink resolves it here.
 *
 * Access also has to be requested from a user gesture (Chrome prompts for it),
 * so nothing here runs until a button is pressed.
 */

let outputs: readonly MIDIOutput[] = [];

export function setMidiOutputs(next: readonly MIDIOutput[]): void {
  outputs = next;
}

export function listMidiOutputs(): readonly MIDIOutput[] {
  return outputs;
}

/** Resolve a stored port id to a live output, if it is still connected. */
export function findMidiOutput(id: string | null): MIDIOutput | undefined {
  if (!id) return undefined;
  return outputs.find((o) => o.id === id);
}

/**
 * The MIDI channel a track plays on.
 *
 * Track 1 is channel 1, up to channel 16. One channel per track is the point:
 * a MIDI-to-CV module maps each channel to its own pitch CV and gate pair, so
 * voices must not share one. A performer whose module is configured differently
 * can change it there, or this can become a per-track setting later.
 */
export function channelForTrack(trackIndex: number): number {
  return Math.max(1, Math.min(16, trackIndex + 1));
}
