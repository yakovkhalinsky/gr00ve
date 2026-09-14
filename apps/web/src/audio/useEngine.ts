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
function toEngineTrack(track: TrackState, index: number): EngineTrack {
  return {
    id: track.id,
    name: track.name,
    grid: track.cells,
    length: track.length,
    mute: track.mute,
    solo: track.solo,
    kind: track.kind,
    drum: track.drum,
    voice: trackVoice(index),
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
 * Per-track voice settings.
 *
 * Eight tracks sharing one timbre is mush, and the fastest way to make a
 * generated pattern legible is to spread the register: low tracks darker and
 * shorter, high tracks brighter. Deliberately simple — per-track instrument
 * design is a taste decision, not a research finding.
 */
export function trackVoice(index: number): VoiceParams {
  const spread = Math.max(0, Math.min(7, index));
  return {
    ...DEFAULT_VOICE,
    cutoff: 200 + spread * 95,
    envMod: 1200 + spread * 280,
    decay: 0.13 + spread * 0.025,
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
