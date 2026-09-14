import { useState } from 'react';

import { SCALE_LABELS, SCALE_NAMES, noteName, withWeight, type ScaleName } from '@gr00ve/core';
import { useGr00ve } from './state/store.ts';
import { Knob } from './ui/Knob.tsx';
import { StepGrid } from './ui/StepGrid.tsx';

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
  const playhead = useGr00ve((s) => s.playhead);
  const tracks = useGr00ve((s) => s.tracks);
  const selected = useGr00ve((s) => s.selected);
  const mix = useGr00ve((s) => s.mix);
  const scale = useGr00ve((s) => s.scale);
  const root = useGr00ve((s) => s.root);

  const setBpm = useGr00ve((s) => s.setBpm);
  const setSwing = useGr00ve((s) => s.setSwing);
  const setPlaying = useGr00ve((s) => s.setPlaying);
  const select = useGr00ve((s) => s.select);
  const toggleStep = useGr00ve((s) => s.toggleStep);
  const setTrackLength = useGr00ve((s) => s.setTrackLength);
  const toggleMute = useGr00ve((s) => s.toggleMute);
  const euclidize = useGr00ve((s) => s.euclidize);

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
          onClick={() => setPlaying(!playing)}
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
      </header>

      <section className="mixer" aria-label="Pitch probability mixer">
        <h2 className="mixer__title">Pitch probability</h2>
        <p className="mixer__hint">
          One fader per semitone. Pull one down to remove that pitch from the pool —
          no separate enable needed. This is the meloDICER / SIG model.
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
              <button
                type="button"
                className="track__euclid"
                onClick={() => euclidize(i, pulses, steps)}
              >
                E({pulses},{steps})
              </button>
            </div>
            <StepGrid
              trackName={track.name}
              trackIndex={i}
              steps={track.cells}
              playhead={i === selected ? playhead : -1}
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

      {/* TODO: wire the Scheduler + Web MIDI. The pieces exist and are tested:
       *   @gr00ve/audio  Scheduler (lookahead), Transport (swing, polymeter)
       *   @gr00ve/midi   learn.ts (encoder modes, fader pickup), lcxl3 SysEx
       * What is missing is the glue: an AudioContext, voice allocation, and the
       * subscribeTransient path from this store into the scheduler. Kept out of
       * the scaffold because voice design is a taste decision, not a research
       * finding — see docs/research-brief.md. */}
    </main>
  );
}
