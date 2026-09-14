import { useCallback, useState } from 'react';

import { midiSupported, requestPorts, unsupportedReason } from '@gr00ve/midi';

import { useGr00ve } from '../state/store.ts';
import { setMidiOutputs } from '../audio/midiPorts.ts';

/**
 * MIDI output settings.
 *
 * Deliberately not automatic. `requestMIDIAccess` raises a browser permission
 * prompt, and Chrome refuses to show one that was not triggered by a user
 * gesture — so asking on load would either fail silently or appear as an
 * unexplained dialog. One button, pressed deliberately, is both the only
 * reliable option and the politer one.
 *
 * The panel also states the channel mapping rather than offering a control for
 * it: one channel per track is what a MIDI-to-CV module expects, and eight
 * dropdowns in a rack that is already dense would cost more than they buy.
 */

type Status = 'idle' | 'ready' | 'unsupported' | 'denied';

export function MidiPanel(): React.JSX.Element {
  const [status, setStatus] = useState<Status>('idle');
  const [outputs, setOutputs] = useState<readonly MIDIOutput[]>([]);

  const outputId = useGr00ve((s) => s.midiOutputId);
  const clock = useGr00ve((s) => s.midiClock);
  const setMidiOutput = useGr00ve((s) => s.setMidiOutput);
  const setMidiClock = useGr00ve((s) => s.setMidiClock);

  const enable = useCallback(async (): Promise<void> => {
    if (!midiSupported()) {
      setStatus('unsupported');
      return;
    }
    try {
      // No SysEx: output only needs to send notes and clock, and asking for
      // less is a smaller permission grant.
      const ports = await requestPorts(false);
      setMidiOutputs(ports.outputs);
      setOutputs(ports.outputs);
      setStatus('ready');
      // Pre-select the first port, so Enable then Play does something.
      if (!useGr00ve.getState().midiOutputId && ports.outputs[0]) {
        setMidiOutput(ports.outputs[0].id);
      }
    } catch {
      setStatus('denied');
    }
  }, [setMidiOutput]);

  if (status === 'idle') {
    return (
      <div className="midi">
        <button type="button" className="midi__enable" onClick={() => void enable()}>
          Enable MIDI out
        </button>
        <span className="midi__hint">Drive external gear — one channel per track.</span>
      </div>
    );
  }

  if (status === 'unsupported' || status === 'denied') {
    return (
      <div className="midi">
        <span className="midi__warn">
          {status === 'denied'
            ? 'MIDI access was declined. Reload and allow it to drive external gear.'
            : unsupportedReason()}
        </span>
      </div>
    );
  }

  return (
    <div className="midi">
      <label className="midi__field">
        Output
        <select
          value={outputId ?? ''}
          aria-label="MIDI output"
          onChange={(e) => setMidiOutput(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">None</option>
          {outputs.map((output) => (
            <option key={output.id} value={output.id}>
              {output.name ?? output.id}
            </option>
          ))}
        </select>
      </label>

      <label className="midi__field midi__field--check">
        <input
          type="checkbox"
          checked={clock}
          onChange={(e) => setMidiClock(e.target.checked)}
        />
        Clock (24 ppqn)
      </label>

      <span className="midi__hint">
        {outputs.length === 0
          ? 'No MIDI outputs found — connect a device and reload.'
          : 'Track 1 → ch 1 … track 8 → ch 8. Each track is its own voice, so a MIDI→CV module gets one gate per track.'}
      </span>
    </div>
  );
}
