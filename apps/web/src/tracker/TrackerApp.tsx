import { useEffect, useRef, useState } from 'react';

import { SCALE_LABELS, SCALE_NAMES, noteName, type ScaleName } from '@gr00ve/core';
import {
  FX_CHANCE, FX_MICRO_MOVE, FX_ROLL, FX_VELOCITY, PATTERN_LENGTHS, ROLL_DIVISION_LABELS,
  ROLL_TYPE_LABELS, maxDegree, maxRollDivision, mtpFileName, packedFx,
  type GeneratedStep, type GeneratedTrack, type GeneratorId, type FxSettings, type TrackConfig,
} from '@gr00ve/tracker';

import { Knob } from '../ui/Knob.tsx';
import { isDownbeat, layoutRows } from '../ui/stepLayout.ts';
import { TrackerPreview } from './preview.ts';
import { useTracker, type TrackPatch } from './state.ts';

/** One normalised step that lands on an integer value. */
function intStep(min: number, max: number): number {
  return max > min ? 1 / (max - min) : 1;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const GENERATOR_LABELS: Readonly<Record<GeneratorId, string>> = {
  euclid: 'Euclidean',
  probability: 'Per-step probability',
  turing: 'Turing machine',
  walk: 'Scale walk',
  markov: 'Markov chain',
};

const FX_BADGE: Readonly<Record<number, string>> = {
  [FX_CHANCE]: 'C',
  [FX_ROLL]: 'R',
  [FX_MICRO_MOVE]: 'm',
  [FX_VELOCITY]: 'V',
};

function fxSummary(step: GeneratedStep, fx: FxSettings): string {
  return packedFx(step, fx)
    .map((effect) => `${FX_BADGE[effect.index] ?? '?'}${effect.value}`)
    .join(' ');
}

/** The compact per-track grid. A view, not an editor: the export is generated. */
function TrackGrid({
  name,
  steps,
  fx,
  length,
  playhead,
  selected,
  onSelect,
}: {
  readonly name: string;
  readonly steps: readonly (GeneratedStep | null)[];
  readonly fx: FxSettings;
  readonly length: number;
  readonly playhead: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): React.JSX.Element {
  const rows = layoutRows(Array.from({ length }, (_, i) => i), 16);
  const position = playhead >= 0 ? ((playhead % length) + length) % length : -1;

  return (
    <div
      className={`tk-grid${selected ? ' is-selected' : ''}`}
      role="grid"
      aria-label={`${name}, ${length} steps`}
      onPointerDown={onSelect}
    >
      {rows.map((row) => (
        <div className="tk-grid__row" role="row" key={row.base}>
          {row.steps.map((i) => {
            const step = steps[i] ?? null;
            const effects = step ? fxSummary(step, fx) : '';
            const playing = i === position;
            return (
              <span
                key={i}
                role="gridcell"
                className={[
                  'tk-cell',
                  step ? 'is-on' : '',
                  playing ? 'is-playing' : '',
                ].filter(Boolean).join(' ')}
                data-downbeat={isDownbeat(i) ? 'true' : undefined}
                title={step ? `${noteName(step.pitch)} ${effects}`.trim() : 'rest'}
                aria-label={`${name}, step ${i + 1}, ${step ? noteName(step.pitch) : 'rest'}${
                  effects ? `, ${effects}` : ''
                }${playing ? ', playing' : ''}`}
              >
                <span className="tk-cell__note">{step ? noteName(step.pitch) : '·'}</span>
                {effects ? <span className="tk-cell__fx">{effects}</span> : null}
              </span>
            );
          })}
          {Array.from({ length: row.padding }, (_, k) => (
            <span key={`pad-${k}`} className="tk-cell tk-cell--pad" aria-hidden="true" />
          ))}
        </div>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly hint?: string;
}): React.JSX.Element {
  return (
    <label className="tk-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <label className="tk-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  disabled = false,
  title,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <label className="tk-toggle" title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function GeneratorControls({
  config,
  patternLength,
  bits,
  onChange,
  onMutate,
  onLock,
}: {
  readonly config: TrackConfig;
  readonly patternLength: number;
  readonly bits: readonly boolean[];
  readonly onChange: (patch: TrackPatch) => void;
  readonly onMutate: () => void;
  readonly onLock: () => void;
}): React.JSX.Element {
  switch (config.generator) {
    case 'euclid':
      return (
        <>
          <Knob label="Hits (k)" value={config.euclid.hits} min={0} max={config.euclid.steps}
            step={intStep(0, config.euclid.steps)} size={44}
            format={(v) => `${Math.round(v)}`}
            onChange={(v) => onChange({ euclid: { hits: Math.round(v) } })} />
          <Knob label="Cycle (n)" value={config.euclid.steps} min={1} max={patternLength}
            step={intStep(1, patternLength)} size={44}
            format={(v) => `${Math.round(v)}`}
            onChange={(v) => {
              const steps = Math.round(v);
              onChange({
                euclid: {
                  steps,
                  hits: Math.min(config.euclid.hits, steps),
                  rotation: Math.min(config.euclid.rotation, steps - 1),
                },
              });
            }} />
          <Knob label="Rotation" value={config.euclid.rotation} min={0}
            max={Math.max(0, config.euclid.steps - 1)}
            step={intStep(0, Math.max(1, config.euclid.steps - 1))} size={44}
            format={(v) => `${Math.round(v)}`}
            onChange={(v) => onChange({ euclid: { rotation: Math.round(v) } })} />
          <p className="tk-hint">E(k,n) spreads k hits over an n-step cycle, then rotates it.</p>
        </>
      );

    case 'probability':
      return (
        <>
          <Knob label="Density" value={config.probability.density} min={0} max={100} step={0.01}
            size={44} format={(v) => `${Math.round(v)}%`}
            onChange={(v) => onChange({ probability: { density: Math.round(v) } })} />
          <Knob label="Spread" value={config.probability.spread} min={0} max={100} step={0.01}
            size={44} format={(v) => `±${Math.round(v)}`}
            onChange={(v) => onChange({ probability: { spread: Math.round(v) } })} />
          <p className="tk-hint">
            Every step is written with its own Chance value, so the Tracker rolls it
            differently on each pass. This generator needs the <strong>C</strong> slot.
          </p>
        </>
      );

    case 'turing':
      return (
        <>
          <Knob label="Loop length" value={config.turing.length} min={1} max={patternLength}
            step={intStep(1, patternLength)} size={44}
            format={(v) => `${Math.round(v)}`}
            onChange={(v) => onChange({ turing: { length: Math.round(v) } })} />
          <Knob label="Mutation" value={config.turing.mutation} min={0} max={1} step={0.01}
            size={44} format={percent}
            onChange={(v) => onChange({ turing: { mutation: v } })} />
          <Knob label="Rest" value={config.turing.rest} min={0} max={1} step={0.01}
            size={44} format={percent}
            onChange={(v) => onChange({ turing: { rest: v } })} />
          <Knob label="Low degree" value={config.turing.lowDegree} min={0}
            max={maxDegree(config.scale, 2)} step={intStep(0, maxDegree(config.scale, 2))} size={44}
            format={(v) => `${Math.round(v)}`}
            onChange={(v) => onChange({ turing: { lowDegree: Math.round(v) } })} />
          <Knob label="High degree" value={config.turing.highDegree} min={0}
            max={maxDegree(config.scale, 2)} step={intStep(0, maxDegree(config.scale, 2))} size={44}
            format={(v) => `${Math.round(v)}`}
            onChange={(v) => onChange({ turing: { highDegree: Math.round(v) } })} />
          <div className="tk-bits" aria-label="Turing register">
            {bits.map((bit, i) => (
              <span key={i} className={`tk-bit${bit ? ' is-on' : ''}`} aria-label={`bit ${i + 1} ${bit ? 'on' : 'off'}`} />
            ))}
          </div>
          <div className="tk-buttons">
            <button type="button" onClick={onMutate}>Mutate</button>
            <button type="button" onClick={onLock}>Lock</button>
          </div>
          <p className="tk-hint">
            Mutation is applied to the loop that is written back, so a change lands on the
            next press. Lock sets mutation to 0 — the loop stops drifting.
          </p>
        </>
      );

    case 'walk':
      return (
        <>
          <Knob label="Range" value={config.walk.range} min={1} max={3} step={0.5} size={44}
            format={(v) => `${Math.round(v)} oct`}
            onChange={(v) => onChange({ walk: { range: Math.round(v) } })} />
          <Knob label="Step size" value={config.walk.stepSize} min={1} max={6} step={0.2} size={44}
            format={(v) => `${Math.round(v)} deg`}
            onChange={(v) => onChange({ walk: { stepSize: Math.round(v) } })} />
          <Knob label="Gravity" value={config.walk.gravity} min={0} max={1} step={0.01} size={44}
            format={percent}
            onChange={(v) => onChange({ walk: { gravity: v } })} />
          <Knob label="Bias" value={config.walk.bias} min={-1} max={1} step={0.005} size={44}
            format={(v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
            onChange={(v) => onChange({ walk: { bias: v } })} />
          <Knob label="Rest" value={config.walk.rest} min={0} max={1} step={0.01} size={44}
            format={percent}
            onChange={(v) => onChange({ walk: { rest: v } })} />
        </>
      );

    case 'markov':
      return (
        <>
          <Knob label="Range" value={config.markov.range} min={1} max={3} step={0.5} size={44}
            format={(v) => `${Math.round(v)} oct`}
            onChange={(v) => onChange({ markov: { range: Math.round(v) } })} />
          <Knob label="Leap" value={config.markov.leap} min={0} max={1} step={0.01} size={44}
            format={percent}
            onChange={(v) => onChange({ markov: { leap: v } })} />
          <Knob label="Rest" value={config.markov.rest} min={0} max={1} step={0.01} size={44}
            format={percent}
            onChange={(v) => onChange({ markov: { rest: v } })} />
          <p className="tk-hint">
            A first-order chain over scale degrees: small intervals dominate, and Leap
            mixes in wider jumps. Optional, as the brief allows.
          </p>
        </>
      );
  }
}

export function TrackerApp(): React.JSX.Element {
  const state = useTracker();
  const {
    seed, patternLength, bpm, swing, tracks, generated, turingBits, selected, playhead,
    patternNumber, exportStatus,
  } = state;

  const setSeed = useTracker((s) => s.setSeed);
  const setPatternLength = useTracker((s) => s.setPatternLength);
  const setBpm = useTracker((s) => s.setBpm);
  const setSwing = useTracker((s) => s.setSwing);
  const setPatternNumber = useTracker((s) => s.setPatternNumber);
  const setSelected = useTracker((s) => s.setSelected);
  const regenerate = useTracker((s) => s.regenerate);
  const mutateSelected = useTracker((s) => s.mutateSelected);
  const lockSelected = useTracker((s) => s.lockSelected);
  const updateTrack = useTracker((s) => s.updateTrack);
  const setGenerator = useTracker((s) => s.setGenerator);
  const setFx = useTracker((s) => s.setFx);
  const exportMtp = useTracker((s) => s.exportMtp);

  const [playing, setPlaying] = useState(false);
  const previewRef = useRef<TrackerPreview | undefined>(undefined);

  useEffect(() => () => {
    previewRef.current?.dispose();
    previewRef.current = undefined;
  }, []);

  const ensurePreview = (): TrackerPreview => {
    let preview = previewRef.current;
    if (!preview) {
      preview = new TrackerPreview(
        () => {
          const live = useTracker.getState();
          return { pattern: live.generated, bpm: live.bpm, swing: live.swing };
        },
        (step) => useTracker.getState().setPlayhead(step),
      );
      previewRef.current = preview;
    }
    return preview;
  };

  const togglePlay = (): void => {
    // Construct on the gesture, as the live app does: a browser will not start
    // an AudioContext outside a user action, and the failure is silent.
    const preview = ensurePreview();
    if (playing) {
      preview.stop();
      setPlaying(false);
    } else {
      void preview.start();
      setPlaying(true);
    }
  };

  const track = tracks[selected] ?? tracks[0];
  const generatedTrack: GeneratedTrack | undefined = generated.tracks[selected];
  const config = generatedTrack?.config ?? track;

  return (
    <main className="tk">
      <header className="tk-bar">
        <a className="tk-back" href={import.meta.env.BASE_URL}>← gr00ve</a>
        <h1>Tracker .mtp generator</h1>
        <span className="tk-kicker">Polyend Tracker Mini · Community Edition</span>

        <button type="button" className="tk-play" aria-pressed={playing} onClick={togglePlay}>
          {playing ? 'Stop' : 'Play preview'}
        </button>

        <Knob label="Tempo" value={bpm} min={20} max={300} step={1 / 280} size={44}
          format={(v) => `${Math.round(v)} BPM`} onChange={setBpm} />
        <Knob label="Swing" value={swing} min={0} max={0.9} step={1 / 90} size={44}
          format={(v) => (v === 0 ? 'straight' : `${Math.round(v * 100)}%`)} onChange={setSwing} />

        <label className="tk-field">
          <span>Pattern length</span>
          <select value={patternLength} onChange={(e) => setPatternLength(Number(e.target.value))}>
            {PATTERN_LENGTHS.map((length) => (
              <option key={length} value={length}>{length} steps</option>
            ))}
          </select>
        </label>

        <NumberField label="Seed" value={seed} min={0} max={4294967295} onChange={setSeed} />
        <button type="button" className="tk-generate" onClick={regenerate}>Regenerate</button>

        <NumberField label="Pattern slot" value={patternNumber} min={1} max={255}
          onChange={setPatternNumber} hint="1–255" />
        <button type="button" className="tk-export" onClick={() => void exportMtp()}>
          Export {mtpFileName(patternNumber)}
        </button>
        {exportStatus ? <span className="tk-status" role="status">{exportStatus}</span> : null}

        <a className="tk-help" href={`${import.meta.env.BASE_URL}guide.html#polyend-tracker-export`}>
          How to use this
        </a>
      </header>

      <section className="tk-tracks" aria-label="Generated tracks">
        {tracks.map((trackConfig, i) => {
          const generatedForTrack = generated.tracks[i];
          const configForTrack = generatedForTrack?.config ?? trackConfig;
          const steps = generatedForTrack?.steps ?? [];
          return (
            <div key={i} className={`tk-track${i === selected ? ' is-selected' : ''}`}>
              <div className="tk-track__head">
                <button type="button" className="tk-track__name" onClick={() => setSelected(i)}>
                  {trackConfig.name}
                </button>
                <span className="tk-track__gen">{GENERATOR_LABELS[configForTrack.generator]}</span>
                <NumberField label="Inst" value={configForTrack.instrument} min={0} max={47}
                  onChange={(v) => updateTrack(i, { instrument: v })} />
                <NumberField label="Root" value={configForTrack.root} min={0} max={127}
                  hint={noteName(configForTrack.root)}
                  onChange={(v) => updateTrack(i, { root: v })} />
                <SelectField label="Scale" value={configForTrack.scale}
                  options={SCALE_NAMES.map((name) => ({ value: name, label: SCALE_LABELS[name] }))}
                  onChange={(v) => updateTrack(i, { scale: v })} />
                <SelectField label="Generator" value={configForTrack.generator}
                  options={(Object.keys(GENERATOR_LABELS) as GeneratorId[])
                    .map((id) => ({ value: id, label: GENERATOR_LABELS[id] }))}
                  onChange={(v) => setGenerator(i, v)} />
                <button type="button" className="tk-track__edit" onClick={() => setSelected(i)}>
                  Edit
                </button>
              </div>
              <TrackGrid
                name={trackConfig.name}
                steps={steps}
                fx={configForTrack.fx}
                length={patternLength}
                playhead={playhead}
                selected={i === selected}
                onSelect={() => setSelected(i)}
              />
            </div>
          );
        })}
      </section>

      {config ? (
        <section className="tk-editor" aria-label={`${config.name} generator`}>
          <h2>{config.name} · {GENERATOR_LABELS[config.generator]}</h2>

          <div className="tk-editor__row">
            <GeneratorControls
              config={config}
              patternLength={patternLength}
              bits={turingBits[selected] ?? []}
              onChange={(patch) => updateTrack(selected, patch)}
              onMutate={mutateSelected}
              onLock={lockSelected}
            />
          </div>

          <div className="tk-editor__row tk-fx">
            <h3>Step FX</h3>
            <p className="tk-hint">
              The Tracker has <strong>two FX slots per step</strong>. Enabling a third
              drops the lowest-priority one (velocity → micro → roll → chance). Every code
              below is documented in tracker-lib and Tracker CE; nothing is invented.
            </p>
            <div className="tk-toggleRow">
              <Toggle label="C · Chance (index 4)" checked={config.fx.chance}
                disabled={config.generator === 'probability'}
                title={config.generator === 'probability'
                  ? 'The probability generator is Chance — this slot cannot be turned off.'
                  : 'Per-step probability, 0–100.'}
                onChange={(on) => setFx(selected, 'chance', on)} />
              <Toggle label="R · Roll (index 3)" checked={config.fx.roll}
                onChange={(on) => setFx(selected, 'roll', on)} />
              <Toggle label="m · Micro-move (index 2)" checked={config.fx.micro}
                onChange={(on) => setFx(selected, 'micro', on)} />
              <Toggle label="V · Velocity (index 18)" checked={config.fx.velocity}
                onChange={(on) => setFx(selected, 'velocity', on)} />
            </div>

            <div className="tk-fxGrid">
              <fieldset className="tk-fxGroup" data-on={config.fx.chance}>
                <legend>C · Chance</legend>
                {config.generator === 'probability' ? (
                  <p className="tk-hint">Drawn per step from Density and Spread above.</p>
                ) : (
                  <>
                    <Knob label="Base" value={config.chance.base} min={0} max={100} step={0.01}
                      size={40} format={(v) => `${Math.round(v)}%`}
                      onChange={(v) => updateTrack(selected, { chance: { base: Math.round(v) } })} />
                    <Knob label="Spread" value={config.chance.spread} min={0} max={100} step={0.01}
                      size={40} format={(v) => `±${Math.round(v)}`}
                      onChange={(v) => updateTrack(selected, { chance: { spread: Math.round(v) } })} />
                  </>
                )}
              </fieldset>

              <fieldset className="tk-fxGroup" data-on={config.fx.velocity}>
                <legend>V · Velocity</legend>
                <Knob label="Base" value={config.velocity.base} min={0} max={100} step={0.01}
                  size={40} format={(v) => `${Math.round(v)}`}
                  onChange={(v) => updateTrack(selected, { velocity: { base: Math.round(v) } })} />
                <Knob label="Spread" value={config.velocity.spread} min={0} max={100} step={0.01}
                  size={40} format={(v) => `±${Math.round(v)}`}
                  onChange={(v) => updateTrack(selected, { velocity: { spread: Math.round(v) } })} />
              </fieldset>

              <fieldset className="tk-fxGroup" data-on={config.fx.roll}>
                <legend>R · Roll</legend>
                <Knob label="Chance" value={config.roll.probability} min={0} max={1} step={0.01}
                  size={40} format={percent}
                  onChange={(v) => updateTrack(selected, { roll: { probability: v } })} />
                <label className="tk-field">
                  <span>Type</span>
                  <select value={config.roll.type}
                    onChange={(e) => updateTrack(selected, { roll: { type: Number(e.target.value) } })}>
                    {ROLL_TYPE_LABELS.map((label, type) => (
                      <option key={label} value={type}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="tk-field">
                  <span>Division</span>
                  <select value={config.roll.division}
                    onChange={(e) => updateTrack(selected, { roll: { division: Number(e.target.value) } })}>
                    {ROLL_DIVISION_LABELS.map((label, division) => (
                      division === 0 || division > maxRollDivision(config.roll.type)
                        ? null
                        : <option key={label} value={division}>{label}</option>
                    ))}
                  </select>
                </label>
              </fieldset>

              <fieldset className="tk-fxGroup" data-on={config.fx.micro}>
                <legend>m · Micro-move</legend>
                <Knob label="Chance" value={config.micro.probability} min={0} max={1} step={0.01}
                  size={40} format={percent}
                  onChange={(v) => updateTrack(selected, { micro: { probability: v } })} />
                <Knob label="Amount" value={config.micro.amount} min={0} max={100} step={0.01}
                  size={40} format={(v) => `${Math.round(v)}`}
                  onChange={(v) => updateTrack(selected, { micro: { amount: Math.round(v) } })} />
              </fieldset>
            </div>
          </div>
        </section>
      ) : null}

      <section className="tk-doc">
        <h2>Putting the file on the Tracker</h2>
        <ol>
          <li>
            <strong>Back up the project first.</strong> Copy the whole
            <code>Projects/&lt;YourProject&gt;/</code> folder off the SD card. The Community
            Edition changelog warns that saving updates a project to pattern format 6, which
            older firmware cannot read, and that a backup is the only way back.
          </li>
          <li>
            The project's pattern folder is <code>Projects/&lt;YourProject&gt;/patterns/</code>
            (<code>tracker-ce/core/FileManager/fileManagerDefs.h:63,71-72</code>).
          </li>
          <li>
            Copy the download into that folder and rename it
            <code>pattern_XX.mtp</code> — <code>XX</code> is a pattern number from
            <strong>01 to 255</strong>, two digits minimum
            (<code>fileManagerDefs.h:71</code> uses <code>pattern_%02d.mtp</code>;
            <code>core/source/mtStructs.h:123-124</code> sets the 1–255 range).
            This page names the download with the same rule.
          </li>
          <li>
            Prefer <strong>replacing an existing pattern file</strong>. The project's
            <code>project.mt</code> records which slots are occupied, so a new file alone
            may not appear in the pattern list. Save a throwaway pattern into the slot on
            the device first, then swap the file on the card.
          </li>
          <li>
            Eject the card safely, open the project, and select that pattern. The
            <code>.mtp</code> carries instrument <em>slot numbers</em>, not samples: make
            sure slots 0–47 in the project have the instruments you want, or the notes will
            be silent.
          </li>
        </ol>
        <p className="tk-hint">
          The Tracker's pattern file has no tempo: tempo, swing and the track names live in
          the project (<code>project.mt</code>). The BPM and Swing controls here are for the
          preview only.
        </p>

        <h2>Step FX used</h2>
        <table>
          <thead>
            <tr><th>FX</th><th>Stored code</th><th>What this page writes</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Chance</td><td><code>C</code> · index 4</td>
              <td>0–100 per-step probability; 100 is omitted</td>
              <td><code>tracker-lib/src/types/patterns.ts:289</code>;
                <code>tracker-ce/core/source/mtSequencer.h:132</code>;
                <code>core/interface/core/interfaceFxDesc.h:61-62</code></td>
            </tr>
            <tr>
              <td>Roll</td><td><code>R</code> · index 3</td>
              <td>1–47, encoded as type × 9 + division</td>
              <td><code>tracker-lib/src/types/patterns.ts:288</code>;
                <code>mtSequencer.h:131</code>;
                <code>mtSequencer.cpp:3220-3223</code>;
                <code>interfaceFxDesc.h:68-76</code></td>
            </tr>
            <tr>
              <td>Micro-move</td><td><code>m</code> · index 2</td>
              <td>1–100, mapped by the device to 1–48 microsteps</td>
              <td><code>tracker-lib/src/types/patterns.ts:287</code>;
                <code>mtSequencer.h:130</code>;
                <code>mtSequencer.cpp:518-531</code>;
                <code>interfaceFxDesc.h:51-52</code></td>
            </tr>
            <tr>
              <td>Volume / Velocity</td><td><code>V</code> · index 18</td>
              <td>0–100 per-step velocity; 100 is omitted</td>
              <td><code>tracker-lib/src/types/patterns.ts:341-343</code>;
                <code>mtSequencer.h:147</code>;
                <code>mtSequencer.cpp:533-541</code>;
                <code>interfaceFxDesc.h:13-19</code></td>
            </tr>
          </tbody>
        </table>
        <p className="tk-hint">
          <strong>Deliberately left out:</strong> every other documented step effect —
          Off, Random Note/Instrument/Volume/FX, MIDI CC A–F, Break Pattern, MIDI Chord,
          Tempo, Swing, Glide, Gate Length, Arp, Position, the LFO selectors, Slice,
          Reverse, the filters, Delay/Reverb Send, Panning, Overdrive, Bit Depth, Tune,
          Slide Up/Down, and the CE-only wavetable/granular envelopes. The page writes only
          the four codes above, each traceable to the sources in the table.
        </p>

        <h2>What the export is and is not</h2>
        <ul>
          <li><strong>16-track version-5 file</strong>: 8 sample tracks filled, 8 MIDI tracks
            empty. Tracker CE translates it to its version-6 layout on load
            (<code>tracker-ce/core/FileManager/fileManagerPattern.cpp:325-330,489-523</code>).</li>
          <li><strong>Notes, instruments and FX only.</strong> No samples, no projects, no
            tempo, no track names.</li>
          <li><strong>Preview is approximate.</strong> It plays gr00ve's 303-ish voice, not the
            Tracker's instruments; velocity is approximated as accent; roll types other than
            constant are played as even repeats.</li>
          <li><strong>Seeded and reproducible.</strong> The seed, every track's parameters and
            the Turing registers determine the pattern exactly.</li>
        </ul>
      </section>
    </main>
  );
}
