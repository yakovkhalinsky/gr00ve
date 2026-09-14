import { useCallback, useEffect, useRef } from 'react';

import {
  DEFAULT_VOICE, SequencerEngine,
  type EngineState, type EngineTrack, type VoiceParams,
} from '@gr00ve/audio';

import { useGr00ve, type TrackState } from '../state/store.ts';

/**
 * Wire the store to the audio engine.
 *
 * Two things here are load-bearing rather than incidental.
 *
 * **The engine is constructed inside the click handler**, not in an effect.
 * Browsers refuse to start an AudioContext outside a user gesture, and the
 * failure mode is silent — the context simply stays `suspended` and nothing
 * sounds. Creating it on the gesture avoids that entirely.
 *
 * **The engine pulls state rather than being pushed it.** The transport reads
 * `useGr00ve.getState()` through a closure instead of React passing props, so a
 * parameter change mid-playback takes effect on the next scheduled step without
 * re-rendering the tree — the same reasoning as `subscribeTransient` in the
 * store.
 */

/**
 * The engine's view of a track. `cells` is the UI's name for the same thing,
 * and `voice` is attached here rather than passed as a parallel array so that
 * a track carries everything needed to sound it.
 */
function toEngineTrack(track: TrackState): EngineTrack {
  return {
    id: track.id,
    name: track.name,
    grid: track.cells,
    length: track.length,
    mute: track.mute,
    solo: track.solo,
    kind: track.kind,
    drum: track.drum,
    voice: voiceForRegister(track.register),
  };
}

/** The current engine state, read straight from the store. */
export function currentEngineState(): EngineState {
  const s = useGr00ve.getState();
  return {
    bpm: s.bpm,
    stepsPerBeat: s.stepsPerBeat,
    swing: s.swing,
    tracks: s.tracks.map(toEngineTrack),
  };
}

/**
 * Melodic voice settings, derived from a track's **register** rather than its
 * position in the rack.
 *
 * A bass should be darker and a lead brighter, so the register is the musically
 * meaningful axis: low tracks get a lower cutoff and a slightly shorter decay,
 * high tracks open up. Keying this to the track *index* instead — as an earlier
 * version did — makes the timbre change when tracks are reordered, which is
 * exactly what happened when the kit moved from the first four slots to the
 * last four and the melodic tracks silently inherited the darkest half of the
 * spread.
 *
 * Register 0 reproduces `DEFAULT_VOICE` exactly, so the default track sounds
 * as designed and only the extremes are coloured. Deliberately simple:
 * per-track instrument design is a taste decision, not a research finding.
 */
export function voiceForRegister(register: number): VoiceParams {
  // Clamped to ±2 octaves; anything wider is not a register, it is a mistake.
  const octave = Math.max(-2, Math.min(2, register / 12));
  return {
    ...DEFAULT_VOICE,
    cutoff: DEFAULT_VOICE.cutoff + octave * 140,
    envMod: DEFAULT_VOICE.envMod + octave * 400,
    decay: DEFAULT_VOICE.decay + octave * 0.03,
    level: 0.44,
  };
}

export interface EngineHandle {
  /** Start or stop. Call from a click handler — see the note above. */
  readonly toggle: () => void;
  /** The live engine, or undefined before the first toggle. */
  readonly engine: () => SequencerEngine | undefined;
}

export function useEngine(): EngineHandle {
  const engineRef = useRef<SequencerEngine | undefined>(undefined);
  const playing = useGr00ve((s) => s.playing);

  const ensure = useCallback((): SequencerEngine => {
    let engine = engineRef.current;
    if (!engine) {
      engine = new SequencerEngine(currentEngineState, {
        onStep: (globalStep) => useGr00ve.getState().setGlobalStep(globalStep),
      });
      engineRef.current = engine;
    }
    return engine;
  }, []);

  const toggle = useCallback((): void => {
    // Construct on the gesture, before flipping state, so the AudioContext is
    // created inside the click's call stack.
    ensure();
    useGr00ve.getState().setPlaying(!useGr00ve.getState().playing);
  }, [ensure]);

  // Keep the engine's running state in step with the store. start() and stop()
  // are both idempotent, so StrictMode's double-invoked effects are harmless.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (playing) void engine.start();
    else engine.stop();
  }, [playing]);

  // Release the AudioContext on unmount. Without this, hot reload accumulates
  // contexts until the browser refuses to make more.
  useEffect(() => () => {
    engineRef.current?.dispose();
    engineRef.current = undefined;
  }, []);

  return { toggle, engine: () => engineRef.current };
}
