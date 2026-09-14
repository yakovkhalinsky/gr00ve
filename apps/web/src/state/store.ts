import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  DEFAULT_MIX, DEFAULT_KIT, combineSeed, degreeToPitch, euclid, grid, makeRng, pitchMixer,
  type DrumType, type PitchMix, type ScaleName, type Step, type StepGrid as Cells, type TrackKind,
} from '@gr00ve/core';

/**
 * Application state.
 *
 * Zustand rather than React state, and the reason is specific: a sequencer
 * changes parameters at pointer-event rate (60+ per second while a knob is
 * being dragged), and routing that through React's reconciler is exactly the
 * wrong tool. Zustand's store lives *outside* React, so `subscribeTransient`
 * below can drive an `AudioParam` at pointer rate with **zero renders**.
 *
 * The rule that follows from this: React renders the *shape* of the UI; the
 * store feeds the *values* to the audio thread. Anything high-frequency must
 * take the subscription path, not the render path.
 */

export const TRACK_COUNT = 8;
export const DEFAULT_STEPS = 16;

/**
 * How many versions of a track's steps are kept.
 *
 * Sixteen is roughly a minute of pressing generate at a listening pace — enough
 * to cover the workflow this exists for, which is to press generate a few
 * times, hear something worth keeping, overshoot it, and want it back. Bounded
 * rather than unbounded because it is per track: eight tracks of unlimited
 * history is a memory leak with a friendly name.
 */
export const HISTORY_LIMIT = 16;

/**
 * One version of a track's steps.
 *
 * Holds the *cells*, not just the seed. Regenerating from a seed would restore
 * the generated pattern but discard anything edited by hand afterwards, and
 * "put back what I had" should mean exactly that. The seed rides along so it
 * can be shown and, later, dialled back to directly.
 */
export interface Snapshot {
  readonly seed: number;
  readonly cells: Cells;
  /** Loop length at the time. `euclidize` sets this to the pattern's length. */
  readonly length: number;
}

export interface TrackState {
  readonly id: string;
  readonly name: string;
  readonly cells: Cells;
  /**
   * Loop length in steps, independent of the pattern length.
   *
   * Polymeter is the cheapest source of long-form variation: a 16-step bass
   * against a 12-step arp against a 7-step pad realigns only after lcm = 336
   * steps, which a listener hears as composed rather than looped. Elektron
   * exposes the same thing and its users routinely confuse it with pattern
   * length, so this stays explicit and separate in the UI.
   */
  readonly length: number;
  readonly mute: boolean;
  readonly solo: boolean;
  /**
   * Whether this track plays pitched notes or one percussion sound.
   *
   * On a `'rhythm'` track the steps' `pitch` values are ignored — the track
   * already fixes which drum it plays — but they are preserved rather than
   * cleared, so switching back to `'voice'` restores the melody.
   */
  readonly kind: TrackKind;
  /** Which drum, when `kind` is `'rhythm'`. */
  readonly drum: DrumType;
  /**
   * Semitone offset applied to pitches drawn from the mixer. ±12, ±24.
   *
   * The pitch mixer is global — one shared pool of notes for the whole rack —
   * so without a per-track offset every voice track would generate in the same
   * octave and the result would be mud. Register is the property that makes a
   * shared pitch source usable across eight tracks, and it is a real hardware
   * concept too (track transpose on an Elektron box).
   *
   * Not exposed in the UI yet; seeded per track. Wiring an encoder to it is a
   * small, obvious follow-up.
   */
  readonly register: number;
  /**
   * Euclidean phase offset, in steps.
   *
   * Stored per track rather than re-picked each time, so pressing E preserves
   * where a pattern sits. Without this, re-generating the backbeat snare would
   * silently move it from beats 2 and 4 back to 1 and 3 — E(2,16) is maximally
   * even only at phase 0, so a rotation is the only way to place it.
   *
   * Not exposed in the UI; seeded per track. A rotate control is in the brief's
   * operator catalogue and is the natural way to surface it.
   */
  readonly rotation: number;
  /**
   * Generation seed. Advanced on every generate.
   *
   * The pattern is a pure function of this and the current mixer, so storing it
   * keeps a phrase reproducible — the same seed and weights give the same notes
   * — while still letting the generate button produce something *new* each
   * time. An earlier version derived the seed from the parameters alone, which
   * made generate idempotent: clicking it twice with the same k and n returned
   * the identical pattern, and a button that does nothing when pressed reads as
   * broken regardless of how defensible the reasoning was.
   *
   * Surfacing it as a control — so a phrase can be dialled back to, the way
   * Marbles' DEJA VU and the Turing Machine's mutation knob work — is the
   * researched next step.
   */
  readonly seed: number;
  /**
   * Versions of this track's steps, oldest first.
   *
   * Both generate and clear push one, so the same control recovers a pattern
   * that was regenerated past *or* wiped — the two ways a track loses its steps.
   */
  readonly history: readonly Snapshot[];
  /** Which entry of `history` the track is currently showing. */
  readonly historyIndex: number;
}

export interface Gr00veState {
  readonly bpm: number;
  /** Steps per beat. 4 = 16th notes, so a 16-step pattern is one bar of 4/4. */
  readonly stepsPerBeat: number;
  readonly swing: number;
  readonly playing: boolean;
  /**
   * The transport's monotonic step counter, or -1 when stopped.
   *
   * Deliberately *not* called "playhead": with polymeter each track is at a
   * different point in its own loop, so a single playhead index would be wrong
   * for all but one track. Callers map this through `trackStep` per track to
   * get a position within that track's grid.
   */
  readonly globalStep: number;
  readonly selected: number;
  readonly root: number;
  readonly scale: ScaleName;
  readonly mix: PitchMix;
  readonly tracks: readonly TrackState[];

  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setPlaying: (playing: boolean) => void;
  setGlobalStep: (step: number) => void;
  select: (index: number) => void;
  toggleStep: (trackIndex: number, step: number) => void;
  setTrackLength: (trackIndex: number, length: number) => void;
  toggleMute: (trackIndex: number) => void;
  euclidize: (trackIndex: number, pulses: number, steps: number) => void;
  clearTrack: (trackIndex: number) => void;
  setTrackKind: (trackIndex: number, kind: TrackKind) => void;
  setDrum: (trackIndex: number, drum: DrumType) => void;
  /**
   * Step through a track's versions. `delta` is -1 for older, +1 for newer.
   *
   * A no-op at either end of the history, so callers can wire a button to it
   * without bounds-checking.
   */
  stepHistory: (trackIndex: number, delta: number) => void;

  /**
   * Id of the selected MIDI output, or null for none.
   *
   * An id rather than the `MIDIOutput` itself: the handle does not belong in a
   * store, and resolving it late means a device unplugged and replugged keeps
   * working. See `audio/midiPorts.ts`.
   */
  readonly midiOutputId: string | null;
  /** Send 24 ppqn timing clocks. Live — toggling mid-playback takes effect. */
  readonly midiClock: boolean;
  setMidiOutput: (id: string | null) => void;
  setMidiClock: (on: boolean) => void;
}

/**
 * Default content.
 *
 * The app ships *playing something* rather than an empty grid, for two reasons.
 * An empty sequencer with a Play button gives no signal about whether playback
 * works — the first click produces silence and reads as broken. And these
 * particular patterns demonstrate the features that are hardest to explain in
 * prose: Euclidean rhythm, polymeter, and the voice/rhythm split.
 *
 * Two tracks are melodic and six are a kit, because eight identical sawtooth
 * voices was never a groove — the genre research is explicit that rhythm and
 * timbre carry the material that pitch carries elsewhere, and a sequencer that
 * cannot be a drum machine is not an electronic music instrument.
 *
 * The whole rack is deliberately polymetric. Loop lengths are 16 and 7 for the
 * melodic pair and 16, 16, 16, 16, 5 and 7 for the kit, so the composite
 * realigns only after lcm(16, 7, 5) = 560 steps — about 35 bars of 4/4. The
 * listener hears composed variation where there are eight stored rows.
 */
interface SeedSpec {
  readonly pulses: number;
  readonly steps: number;
  /** Euclidean phase offset in steps. */
  readonly rotation: number;
  /** Semitone offset applied to the mixer's pitches. */
  readonly register: number;
  readonly kind: TrackKind;
  readonly drum: DrumType;
}

const SEED: readonly SeedSpec[] = [
  // Two melodic tracks: a bass, and a lead whose 7-step loop drifts against
  // the bass's 16 (they realign after lcm(16,7) = 112 steps, about 7 bars).
  { pulses: 4, steps: 16, rotation: 0, register: -12, kind: 'voice', drum: 'kick' },
  { pulses: 4, steps: 7, rotation: 0, register: 0, kind: 'voice', drum: 'kick' },

  // Six percussion tracks, one drum each, in kit order.
  //
  // Two of them use rotation, and it is load-bearing rather than decorative:
  // E(2,16) is maximally even only at phase 0, which puts its onsets on beats
  // 1 and 3. A backbeat needs beats 2 and 4, so rotation is the only way to
  // place it — the pattern's *shape* is fixed, only its phase moves.
  //
  // Register is unused on a rhythm track; drums ignore pitch.
  { pulses: 4, steps: 16, rotation: 0, register: 0, kind: 'rhythm', drum: 'kick' }, // four-on-the-floor
  { pulses: 2, steps: 16, rotation: 4, register: 0, kind: 'rhythm', drum: 'snare' }, // backbeat
  { pulses: 8, steps: 16, rotation: 0, register: 0, kind: 'rhythm', drum: 'hat' }, // eighth notes
  { pulses: 2, steps: 16, rotation: 2, register: 0, kind: 'rhythm', drum: 'clap' }, // offbeat
  // Odd loop lengths, so the percussion drifts against the four-four kit.
  { pulses: 2, steps: 5, rotation: 0, register: 0, kind: 'rhythm', drum: 'tom' },
  { pulses: 3, steps: 7, rotation: 0, register: 0, kind: 'rhythm', drum: 'rim' },
];

/**
 * Build a grid from a Euclidean mask, taking pitches from the **scale itself**
 * rather than from the mixer.
 *
 * This is the degree-based Euclidean melody the brief calls underrated — it
 * yields a Sturmian contour with only two interval sizes, so it is even rather
 * than random. It is **not** what the E button runs: that goes through
 * `generateCells`, so the twelve pitch faders are what decide the notes. Kept
 * exported and tested as an alternative generator, and as the thing to reach
 * for if the mixer ever needs a degree-based counterpart.
 */
export function euclidCells(
  pulses: number,
  steps: number,
  root: number,
  scale: ScaleName,
  opts: { rotation?: number; baseDegree?: number } = {},
): Cells {
  const rotation = opts.rotation ?? 0;
  const baseDegree = opts.baseDegree ?? 0;
  const mask = euclid(pulses, steps, rotation);
  return mask.map((on, i) =>
    on
      ? ({
          // Onsets walk up the scale so a Euclidean mask reads as a melodic
          // figure rather than one repeated note.
          pitch: degreeToPitch(root, scale, baseDegree + (i % 5)),
          velocity: 0.75,
          accent: i % 4 === 0,
          slide: false,
          gate: 0.58,
        } satisfies Step)
      : null,
  );
}

/**
 * Compose a rhythm with a pitch source.
 *
 * **Euclidean answers *when*, the pitch mixer answers *what*.** This is the one
 * place the two meet, so the generate button, the startup seed and any future
 * generator all behave identically — and so there is a single function to look
 * at when the output is wrong.
 *
 * Callers pass the seed explicitly, and it is stored on the track: the seed
 * plus the mixer fully determines the notes, so a phrase is reproducible rather
 * than lost, while `euclidize` advances it so each press produces something
 * new. See `TrackState.seed`.
 */
export function generateCells(opts: {
  readonly pulses: number;
  readonly steps: number;
  /** Phase offset in steps. See `TrackState.rotation`. */
  readonly rotation?: number | undefined;
  readonly seed: number;
  readonly mix: PitchMix;
  readonly root: number;
  readonly scale: ScaleName;
  readonly register: number;
}): Cells {
  const gate = euclid(opts.pulses, opts.steps, opts.rotation ?? 0);
  return pitchMixer(
    // The store's root and scale are the single source of truth; the mix's own
    // copies are overridden so a scale change in the transport bar applies to
    // generation rather than being shadowed by a stale value on the mix.
    { ...opts.mix, root: opts.root + opts.register, scale: opts.scale },
    opts.steps,
    makeRng(opts.seed),
    gate,
  );
}

/**
 * Append a snapshot, trimming the oldest once the limit is reached.
 *
 * Truncates anything *ahead* of the cursor first. Stepping back and then
 * generating branches the history rather than leaving entries that can never be
 * reached — the same behaviour an editor's undo stack has, and the reason the
 * cursor is an index rather than the list simply being a stack.
 */
function pushSnapshot(
  history: readonly Snapshot[],
  historyIndex: number,
  snapshot: Snapshot,
): { history: Snapshot[]; historyIndex: number } {
  const kept = [...history.slice(0, historyIndex + 1), snapshot];
  const trimmed = kept.slice(-HISTORY_LIMIT);
  return { history: trimmed, historyIndex: trimmed.length - 1 };
}

/** A snapshot of a track as it stands. */
function snapshotOf(track: TrackState): Snapshot {
  return { seed: track.seed, cells: track.cells, length: track.length };
}

/**
 * Record a change to a track's steps, keeping the state it replaces.
 *
 * The subtlety is hand edits. A track's visible cells are not necessarily the
 * version its cursor points at — editing a step leaves the stored version
 * behind, because the store's history is only written by generate and clear.
 * Generating from there and storing only the new pattern would drop the edit
 * out of reach entirely: stepping back would land on the version *before* it
 * and jump straight past.
 *
 * Reference equality is enough to detect that, and cheap: every action here
 * builds a new cells array rather than mutating one, so a differing reference
 * means an unrecorded edit.
 */
function recordVersion(track: TrackState, next: Snapshot): { history: Snapshot[]; historyIndex: number } {
  const stored = track.history[track.historyIndex];
  const edited = stored === undefined || stored.cells !== track.cells;

  const base = edited
    ? pushSnapshot(track.history, track.historyIndex, snapshotOf(track))
    : { history: track.history, historyIndex: track.historyIndex };

  return pushSnapshot(base.history, base.historyIndex, next);
}

function seedTrack(index: number, root: number, scale: ScaleName): TrackState {
  const pattern: SeedSpec = SEED[index % SEED.length] ?? {
    pulses: 4, steps: 16, rotation: 0, register: 0, kind: 'voice', drum: 'kick',
  };
  const seed = combineSeed(index, pattern.pulses, pattern.steps);
  const cells = generateCells({
    pulses: pattern.pulses,
    steps: pattern.steps,
    rotation: pattern.rotation,
    seed,
    mix: DEFAULT_MIX,
    root,
    scale,
    register: pattern.register,
  });
  return {
    id: `track-${index + 1}`,
    name: `Track ${index + 1}`,
    cells,
    // Loop length matches the generated grid, and stays independent of it —
    // editing the length later must not rewrite the pattern.
    length: pattern.steps,
    mute: false,
    solo: false,
    kind: pattern.kind,
    drum: pattern.drum ?? DEFAULT_KIT[index % DEFAULT_KIT.length] ?? 'kick',
    register: pattern.register,
    rotation: pattern.rotation,
    seed,
    // The seeded pattern is version one, so stepping back has a floor rather
    // than landing on nothing.
    history: [{ seed, cells, length: pattern.steps }],
    historyIndex: 0,
  };
}

/**
 * The eight seeded tracks, built fresh.
 *
 * Exported so the tests can reset the store singleton between cases. Without
 * it they share whatever earlier cases left behind, and a test asserting what a
 * *fresh* track looks like quietly depends on no previous test having touched
 * it — which is a claim that gets less true every time a test is added.
 */
export function initialTracks(root = 45, scale: ScaleName = 'minorPentatonic'): TrackState[] {
  return Array.from({ length: TRACK_COUNT }, (_, i) => seedTrack(i, root, scale));
}

export const useGr00ve = create<Gr00veState>()(
  subscribeWithSelector((set, get) => ({
    bpm: 128,
    stepsPerBeat: 4,
    swing: 0,
    playing: false,
    globalStep: -1,
    selected: 0,
    root: 45,
    scale: 'minorPentatonic',
    mix: DEFAULT_MIX,
    tracks: initialTracks(),

    setBpm: (bpm) => set({ bpm: Math.max(20, Math.min(300, bpm)) }),
    setSwing: (swing) => set({ swing: Math.max(0, Math.min(0.9, swing)) }),
    setPlaying: (playing) => set({ playing }),
    setGlobalStep: (globalStep) => set({ globalStep }),
    select: (selected) => set({ selected }),

    toggleStep: (trackIndex, step) => {
      const { tracks, root, scale } = get();
      const track = tracks[trackIndex];
      if (!track) return;
      const cells = [...track.cells];
      const existing = cells[step];
      cells[step] = existing
        ? null
        : {
            pitch: degreeToPitch(root, scale, step % 5),
            velocity: 0.75,
            accent: false,
            slide: false,
            gate: 0.58,
          };
      const next = tracks.map((t, i) => (i === trackIndex ? { ...t, cells } : t));
      set({ tracks: next });
    },

    /**
     * Set a track's loop length.
     *
     * Ceiling is the pattern's own length, not an arbitrary maximum. A longer
     * loop reads past the end of the grid, where the lookup finds nothing and
     * the step resolves to a rest — so "make the loop longer" would silently
     * turn the tail of the loop into dead air rather than playing anything.
     * Capping at the grid makes that unreachable.
     */
    setTrackLength: (trackIndex, length) => {
      const tracks = get().tracks.map((t, i) => {
        if (i !== trackIndex) return t;
        const max = Math.max(1, t.cells.length);
        return { ...t, length: Math.max(1, Math.min(max, Math.round(length))) };
      });
      set({ tracks });
    },

    toggleMute: (trackIndex) => {
      const tracks = get().tracks.map((t, i) => (i === trackIndex ? { ...t, mute: !t.mute } : t));
      set({ tracks });
    },

    euclidize: (trackIndex, pulses, steps) => {
      const { tracks, root, scale, mix } = get();
      const track = tracks[trackIndex];
      if (!track) return;

      // Advance the seed, so generate produces something new every time. A
      // seed derived from the parameters alone made this idempotent, and a
      // generate button that returns the identical phrase when pressed reads
      // as broken — which is exactly how it was reported.
      const seed = (track.seed + 1) >>> 0;

      const cells = generateCells({
        pulses,
        steps,
        // Preserved from the track, so re-generating a backbeat keeps it on
        // beats 2 and 4 rather than snapping it back to the even-but-wrong
        // phase 0 the pattern shape alone would give.
        rotation: track.rotation,
        seed,
        mix,
        root,
        scale,
        register: track.register,
      });
      // Every generate is recoverable, so overshooting the pattern you wanted
      // is no longer the end of it.
      const { history, historyIndex } = recordVersion(track, { seed, cells, length: steps });

      const next = tracks.map((t, i) =>
        (i === trackIndex ? { ...t, cells, length: steps, seed, history, historyIndex } : t),
      );
      set({ tracks: next });
    },

    stepHistory: (trackIndex, delta) => {
      const tracks = get().tracks;
      const track = tracks[trackIndex];
      if (!track) return;

      const index = track.historyIndex + Math.sign(delta);
      const snapshot = track.history[index];
      if (!snapshot) return; // at an end of the history

      set({
        tracks: tracks.map((t, i) =>
          i === trackIndex
            ? {
                ...t,
                cells: snapshot.cells,
                // Restored along with the steps: a version *is* its pattern and
                // its length, and bringing back the notes without the loop they
                // were written for would leave the tail silent.
                length: snapshot.length,
                seed: snapshot.seed,
                historyIndex: index,
              }
            : t,
        ),
      });
    },

    /**
     * Empty a track's steps, keeping its grid length and loop length.
     *
     * The grid array and the loop length are independent — `setTrackLength`
     * changes the loop without touching the array — so this rebuilds at the
     * *array's* length rather than the loop's. Sizing it from `length` instead
     * would silently truncate or pad a track whose two have diverged, turning a
     * "clear the notes" action into a structural edit.
     */
    clearTrack: (trackIndex) => {
      const tracks = get().tracks.map((t, i) => {
        if (i !== trackIndex) return t;
        const cells = new Array<Step | null>(t.cells.length).fill(null);
        // Clearing records a version too, so it is recoverable through the same
        // control. That closes the "no undo for Clear" gap without a second
        // mechanism: both ways a track loses its steps are now steppable.
        const { history, historyIndex } = recordVersion(t, {
          seed: t.seed,
          cells,
          length: t.length,
        });
        return { ...t, cells, history, historyIndex };
      });
      set({ tracks });
    },

    /**
     * Switch a track between pitched and percussive.
     *
     * Only `kind` changes. The steps keep their pitches, so switching a rhythm
     * track back to a voice returns the melody rather than an empty grid — and
     * switching a melodic track to rhythm makes it a drum part of the same
     * rhythm without losing anything.
     */
    setTrackKind: (trackIndex, kind) => {
      const tracks = get().tracks.map((t, i) => (i === trackIndex ? { ...t, kind } : t));
      set({ tracks });
    },

    setDrum: (trackIndex, drum) => {
      const tracks = get().tracks.map((t, i) => (i === trackIndex ? { ...t, drum } : t));
      set({ tracks });
    },

    midiOutputId: null,
    midiClock: false,
    setMidiOutput: (midiOutputId) => set({ midiOutputId }),
    setMidiClock: (midiClock) => set({ midiClock }),
  })),
);

/**
 * Subscribe to a slice of state **without re-rendering**.
 *
 * This is the path for anything that runs at pointer or audio rate. It is the
 * documented mitigation for React's reconciliation cost in an audio UI: the
 * component tree never re-renders, and the value goes straight to an
 * `AudioParam` via `setTargetAtTime` (which also avoids the clicks that direct
 * `value` assignment causes).
 *
 * ```ts
 * subscribeTransient(
 *   (s) => s.tracks[0]?.cells,
 *   (cells) => schedulePattern(0, cells),
 * );
 * ```
 */
export function subscribeTransient<T>(
  selector: (state: Gr00veState) => T,
  listener: (value: T, previous: T) => void,
): () => void {
  return useGr00ve.subscribe(selector, listener);
}

/**
 * Apply a parameter to an AudioParam without a click.
 *
 * `setTargetAtTime` rather than `value =`, because assigning `value` directly
 * produces a discontinuity — an audible click on every knob movement. The time
 * constant is short enough to feel immediate and long enough to smooth.
 */
export function rampParam(param: AudioParam, value: number, ctx: BaseAudioContext, seconds = 0.01): void {
  param.setTargetAtTime(value, ctx.currentTime, seconds);
}
