import { useState } from 'react';

import {
  DRUM_LABELS, DRUM_TYPES, SCALE_LABELS, SCALE_NAMES, noteName, withWeight,
  type DrumType, type ScaleName,
} from '@gr00ve/core';
import { trackStep } from '@gr00ve/audio';
import { useGr00ve, type TrackState } from './state/store.ts';
import { useEngine } from './audio/useEngine.ts';
import { Knob } from './ui/Knob.tsx';
import { StepGrid } from './ui/StepGrid.tsx';

/**
 * Where a track currently is *within its own loop*.
 *
 * Deliberately not the transport's global step. With polymeter every track has
 * its own loop length, so one global index maps to a different position per
 * track — which is why the eight highlights visibly drift apart as a pattern
 * plays, and why a single shared "playhead" would be wrong for all but one
 * track. `length` alone determines this; the step grid is read-only here.
 */
function trackPlayhead(track: TrackState, globalStep: number): number {
  if (globalStep < 0) return -1;
  return trackStep(
    { id: track.id, name: track.name, grid: track.cells, length: track.length },
    globalStep,
  );
}

/**
 * The rack.
 *
 * Layout follows the research's recommendation for an 8-track surface:
 *
 *   - A row of 12 faders for the pitch-probability mixer, laid out by semitone.
 *     This is the recommended centre of gravity for *generation* — it is how
 *     the Vermona meloDICER and the Stochastic Inspiration Generator work — and
 *     it does three jobs with one mechanism: generator, arpeggiator, quantiser.
 *     Zero weight removes a pitch entirely, so no separate enable is needed.
 *   - Eight track strips, each with its own step grid and loop length. Eight is
 *     a cognitive ceiling rather than a technical one; every shared-panel
 *     multitrack design surveyed hits the same wall.
 *   - Loop length is per track and visibly separate from the pattern, because
 *     polymeter is the cheapest long-form variation available and Elektron's
 *     users routinely confuse the two.
 */
export function App(): React.JSX.Element {
  const bpm = useGr00ve((s) => s.bpm);
  const swing = useGr00ve((s) => s.swing);
  const playing = useGr00ve((s) => s.playing);
  const globalStep = useGr00ve((s) => s.globalStep);
  const tracks = useGr00ve((s) => s.tracks);
  const selected = useGr00ve((s) => s.selected);
  const mix = useGr00ve((s) => s.mix);
  const scale = useGr00ve((s) => s.scale);
  const root = useGr00ve((s) => s.root);

  const { toggle } = useEngine();
  const setBpm = useGr00ve((s) => s.setBpm);
  const setSwing = useGr00ve((s) => s.setSwing);
  const select = useGr00ve((s) => s.select);
  const toggleStep = useGr00ve((s) => s.toggleStep);
  const setTrackLength = useGr00ve((s) => s.setTrackLength);
  const toggleMute = useGr00ve((s) => s.toggleMute);
  const euclidize = useGr00ve((s) => s.euclidize);
  const clearTrack = useGr00ve((s) => s.clearTrack);
  const setTrackKind = useGr00ve((s) => s.setTrackKind);
  const setDrum = useGr00ve((s) => s.setDrum);

  // Local generator controls, pending a proper "generator per track" model.
  const [pulses, setPulses] = useState(5);
  const [steps, setSteps] = useState(8);

  return (
    <main className="rack">
      <header className="transport">
        <button
          type="button"
          className="transport__play"
          aria-pressed={playing}
          // `toggle` constructs the AudioContext inside this click's call stack.
          // Browsers refuse to start audio outside a user gesture, and the
          // failure is silent, so this cannot be moved into an effect.
          onClick={toggle}
        >
          {playing ? 'Stop' : 'Play'}
        </button>

        <Knob label="Tempo" value={bpm} min={20} max={300} step={1 / 280} onChange={setBpm}
          format={(v) => `${Math.round(v)} BPM`} />
        <Knob label="Swing" value={swing} min={0} max={0.9} step={1 / 90} onChange={setSwing}
          format={(v) => (v === 0 ? 'straight' : `${Math.round(v * 100)}%`)} />

        <div className="transport__scale">
          <label>
            Scale
            <select
              value={scale}
              onChange={(e) => useGr00ve.setState({ scale: e.target.value as ScaleName })}
            >
              {SCALE_NAMES.map((name) => (
                <option key={name} value={name}>{SCALE_LABELS[name]}</option>
              ))}
            </select>
          </label>
          <span className="transport__root">{noteName(root)}</span>
        </div>

        {/* Links to the rendered markdown on GitHub rather than to the copy in
          * this deployment — GitHub Pages serves .md as plain text, so a
          * relative link would show the reader raw source. */}
        <a
          className="transport__help"
          href="https://github.com/yakovkhalinsky/gr00ve/blob/main/docs/using-gr00ve.md"
          target="_blank"
          rel="noreferrer"
        >
          How to use this
        </a>
      </header>

      <section className="mixer" aria-label="Pitch probability mixer">
        <h2 className="mixer__title">Pitch probability</h2>
        <p className="mixer__hint">
          One fader per semitone — pull one down to remove that pitch from the
          pool, no separate enable needed. This is the meloDICER / SIG model: it
          decides <em>what</em> the generators play, while <strong>E(k,n)</strong>{' '}
          decides <em>when</em>. Press a track&rsquo;s <strong>E</strong> button
          to apply the current weights — editing a pattern by hand won&rsquo;t
          overwrite itself, so nothing changes until you do.
        </p>
        <div className="mixer__faders">
          {mix.weights.map((w, semitone) => (
            <label key={semitone} className="fader">
              <input
                className="fader__input"
                type="range"
                min={0}
                max={4}
                step={0.05}
                value={w}
                aria-label={`Weight for ${noteName(root + semitone)}`}
                onChange={(e) => {
                  const next = withWeight(mix, semitone, Number(e.target.value));
                  useGr00ve.setState({ mix: next });
                }}
              />
              <span className="fader__label">{noteName(root + semitone)}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="tracks" aria-label="Tracks">
        {tracks.map((track, i) => (
          <div key={track.id} className={`track${i === selected ? ' is-selected' : ''}`}>
            <div className="track__head">
              <button
                type="button"
                className="track__name"
                aria-pressed={i === selected}
                onClick={() => select(i)}
              >
                {track.name}
              </button>
              <button
                type="button"
                className="track__mute"
                aria-pressed={track.mute}
                onClick={() => toggleMute(i)}
              >
                Mute
              </button>
              <Knob
                label="Loop"
                value={track.length}
                min={1}
                max={32}
                step={1 / 31}
                size={40}
                onChange={(v) => setTrackLength(i, v)}
                format={(v) => `${Math.round(v)}`}
              />
              {/* Voice / Rhythm. A single mode button rather than a segmented
                * pair, to keep the strip narrow — and because the accessible
                * name is built to *start with* the visible label, so
                * label-in-name holds even though the label changes. A static
                * aria-label over changing text would not. */}
              <div className="track__inst">
                <button
                  type="button"
                  className="track__kind"
                  data-kind={track.kind}
                  aria-label={
                    track.kind === 'rhythm'
                      ? `Rhythm mode. Switch ${track.name} to a pitched voice.`
                      : `Voice mode. Switch ${track.name} to a drum.`
                  }
                  onClick={() => setTrackKind(i, track.kind === 'rhythm' ? 'voice' : 'rhythm')}
                >
                  {track.kind === 'rhythm' ? 'Rhythm' : 'Voice'}
                </button>
                {/* Always rendered, merely disabled on a voice track.
                  *
                  * Removing it instead would change the column's height on
                  * every mode switch, and because the track head centres its
                  * children the mode button above would jump up and down. The
                  * value is also worth seeing while inactive: it is what the
                  * track will play if switched to rhythm, so greying it out
                  * reads as "inactive" rather than "not applicable". */}
                <select
                  className="track__drum"
                  value={track.drum}
                  disabled={track.kind !== 'rhythm'}
                  aria-label={
                    track.kind === 'rhythm'
                      ? `${track.name} drum sound`
                      : `${track.name} drum sound, used only in rhythm mode`
                  }
                  onChange={(e) => setDrum(i, e.target.value as DrumType)}
                >
                  {DRUM_TYPES.map((drum) => (
                    <option key={drum} value={drum}>{DRUM_LABELS[drum]}</option>
                  ))}
                </select>
              </div>

              {/* Euclid and Clear are stacked in one column so the
                * generate/erase pair reads as a unit, and so a track strip
                * stays narrow enough for several tracks to fit on screen. */}
              <div className="track__gen">
                <button
                  type="button"
                  className="track__euclid"
                  aria-label={`Generate Euclidean pattern E(${pulses},${steps}) on ${track.name}`}
                  onClick={() => euclidize(i, pulses, steps)}
                >
                  E({pulses},{steps})
                </button>
                <button
                  type="button"
                  className="track__clear"
                  // Named per track, so the button is unambiguous out of visual
                  // context — eight buttons all reading "Clear" are not.
                  aria-label={`Clear ${track.name}`}
                  onClick={() => clearTrack(i)}
                >
                  Clear
                </button>
              </div>
            </div>
            <StepGrid
              trackName={track.name}
              trackIndex={i}
              steps={track.cells}
              playhead={trackPlayhead(track, globalStep)}
              selected={i === selected}
              onToggle={(step) => toggleStep(i, step)}
              onSelect={() => select(i)}
            />
          </div>
        ))}
      </section>

      <section className="generator" aria-label="Generator">
        <h2 className="generator__title">Euclidean</h2>
        <p className="generator__hint">
          Two encoders, no corpus, no training — and the only generator whose
          parameters are unconditionally legible on first listen.
        </p>
        <Knob label="Pulses" value={pulses} min={1} max={16} step={1 / 15} size={44}
          onChange={(v) => setPulses(Math.round(v))} format={(v) => `${Math.round(v)}`} />
        <Knob label="Steps" value={steps} min={2} max={16} step={1 / 14} size={44}
          onChange={(v) => setSteps(Math.round(v))} format={(v) => `${Math.round(v)}`} />
      </section>

      {/* Playback is wired: @gr00ve/audio's SequencerEngine owns the
       * AudioContext, one 303-ish monophonic voice per track, and a lookahead
       * scheduler. See apps/web/src/audio/useEngine.ts.
       *
       * Still missing:
       *   - Web MIDI in. The mapping semantics (encoder relative modes, fader
       *     pickup) and the Launch Control XL 3 / APC mini mk2 SysEx are
       *     implemented and tested in @gr00ve/midi, but nothing is bound yet.
       *   - Per-track instrument selection. All eight tracks share one voice
       *     shape, differentiated only by register and filter (see
       *     `trackVoice`). A generator-per-track model is the next real step —
       *     the brief argues "melody generation" means something different in
       *     each genre, so the generator should be a per-track choice. */}
    </main>
  );
}
