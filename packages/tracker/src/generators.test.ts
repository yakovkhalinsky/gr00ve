import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inScale, pitchToDegree } from '@gr00ve/core';

import {
  chanceFires, clampDegree, defaultTrackConfig, defaultTrackConfigs, generatePattern,
  maxDegree, maxRollDivision, mutateTuringBits, normaliseFxSettings, packedFx, pitchForDegree,
  rollValue, seedTuringBits,
  type TrackConfig,
} from './index.ts';
import { DOCUMENTED_FX_INDICES, FX_CHANCE, FX_MICRO_MOVE, FX_ROLL, FX_VELOCITY } from './fx.ts';

function track(overrides: Partial<TrackConfig> = {}): TrackConfig {
  return { ...defaultTrackConfig(0), ...overrides };
}

test('the default rack has eight valid tracks and two FX at most', () => {
  const tracks = defaultTrackConfigs();
  assert.equal(tracks.length, 8);
  for (const config of tracks) {
    assert.ok(config.instrument >= 0 && config.instrument <= 47);
    assert.ok(config.root >= 0 && config.root <= 127);
    const enabled = Object.values(config.fx).filter(Boolean).length;
    assert.ok(enabled <= 2, `${config.name} enables ${enabled} effects`);
  }
});

test('generation is deterministic from the seed', () => {
  const tracks = defaultTrackConfigs();
  const a = generatePattern(tracks, 32, 1234);
  const b = generatePattern(tracks, 32, 1234);
  const c = generatePattern(tracks, 32, 1235);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('one track changing cannot move another track', () => {
  const tracks = defaultTrackConfigs();
  const baseline = generatePattern(tracks, 32, 77);
  const edited = tracks.map((config, i) =>
    i === 0 ? { ...config, probability: { density: 10, spread: 5 } } : config);
  const changed = generatePattern(edited, 32, 77);
  for (let i = 1; i < 8; i++) {
    assert.deepEqual(changed.tracks[i]?.steps, baseline.tracks[i]?.steps);
  }
});

test('Euclidean onsets and rotation survive the pattern length', () => {
  const cycle = 16;
  const config = track({
    generator: 'euclid',
    euclid: { hits: 5, steps: cycle, rotation: 0 },
    fx: { chance: false, roll: false, micro: false, velocity: false },
  });

  const straight = generatePattern([config], cycle, 9).tracks[0]!;
  const straightOnsets = straight.steps.flatMap((step, i) => (step ? [i] : []));
  assert.equal(straightOnsets.length, 5);

  const rotated = generatePattern([
    { ...config, euclid: { ...config.euclid, rotation: 4 } },
  ], cycle, 9).tracks[0]!;
  const rotatedOnsets = rotated.steps.flatMap((step, i) => (step ? [i] : []));
  const expected = straightOnsets.map((i) => (i + 4) % cycle).sort((a, b) => a - b);
  assert.deepEqual(rotatedOnsets, expected);
});

test('a Euclidean cycle shorter than the pattern repeats', () => {
  const config = track({
    generator: 'euclid',
    euclid: { hits: 2, steps: 4, rotation: 0 },
    fx: { chance: false, roll: false, micro: false, velocity: false },
  });
  const generated = generatePattern([config], 16, 3).tracks[0]!;
  const onsets = generated.steps.flatMap((step, i) => (step ? [i] : []));
  assert.deepEqual(onsets, [0, 2, 4, 6, 8, 10, 12, 14]);
});

test('the probability generator writes a chance on every step', () => {
  const config = track({
    generator: 'probability',
    probability: { density: 50, spread: 40 },
    fx: { chance: true, roll: false, micro: false, velocity: true },
  });
  const generated = generatePattern([config], 64, 42).tracks[0]!;
  assert.equal(generated.steps.length, 64);
  for (const step of generated.steps) {
    assert.ok(step !== null);
    assert.ok(step.chance !== undefined);
    assert.ok(step.chance >= 0 && step.chance <= 100);
  }
  // With 64 steps, a ±40 spread around 50 must produce some variation.
  const values = new Set(generated.steps.map((step) => step?.chance));
  assert.ok(values.size > 1);
});

test('the probability generator needs its Chance slot', () => {
  const fx = normaliseFxSettings(
    { chance: false, roll: true, micro: true, velocity: true },
    'probability',
  );
  assert.equal(fx.chance, true);
  assert.equal(Object.values(fx).filter(Boolean).length, 2);
});

test('FX are normalised to the two the file can hold', () => {
  const fx = normaliseFxSettings(
    { chance: true, roll: true, micro: true, velocity: true },
    'euclid',
  );
  assert.deepEqual(fx, { chance: true, roll: true, micro: false, velocity: false });

  const late = normaliseFxSettings(
    { chance: false, roll: false, micro: true, velocity: true },
    'euclid',
  );
  assert.deepEqual(late, { chance: false, roll: false, micro: true, velocity: true });
});

test('roll values use the device encoding and stay inside 0..47', () => {
  assert.equal(rollValue({ probability: 1, type: 0, division: 4 }), 4);
  assert.equal(rollValue({ probability: 1, type: 2, division: 3 }), 21);
  assert.equal(maxRollDivision(0), 8);
  assert.equal(maxRollDivision(5), 2);
  // The random-note type cannot encode 1/16 inside tracker-lib's 0..47 range.
  assert.equal(rollValue({ probability: 1, type: 5, division: 8 }), 47);
});

test('packing never writes more than two effects or an undocumented code', () => {
  const step = { pitch: 60, velocity: 70, chance: 55, roll: 4, micro: 20 };
  const packed = packedFx(step, { chance: true, roll: true, micro: true, velocity: true });
  assert.equal(packed.length, 2);
  assert.deepEqual(packed.map((fx) => fx.index), [FX_CHANCE, FX_ROLL]);
  for (const fx of packed) assert.ok(DOCUMENTED_FX_INDICES.includes(fx.index));

  // Each documented code can reach slot 1 on its own.
  assert.deepEqual(
    packedFx(step, { chance: false, roll: false, micro: false, velocity: true }).map((fx) => fx.index),
    [FX_VELOCITY],
  );
  assert.deepEqual(
    packedFx(step, { chance: false, roll: false, micro: true, velocity: false }).map((fx) => fx.index),
    [FX_MICRO_MOVE],
  );
});

test('an always-on chance is omitted rather than encoded as C100', () => {
  const packed = packedFx(
    { pitch: 60, velocity: 100, chance: 100 },
    { chance: true, roll: false, micro: false, velocity: false },
  );
  assert.deepEqual(packed, []);
});

test('chance resolution is deterministic, and the extremes are absolute', () => {
  assert.equal(chanceFires(0, 1, 2, 3, 4), false);
  assert.equal(chanceFires(100, 1, 2, 3, 4), true);
  assert.equal(chanceFires(undefined, 1, 2, 3, 4), true);
  const first = chanceFires(50, 1, 2, 3, 4);
  assert.equal(chanceFires(50, 1, 2, 3, 4), first);

  // Across a thousand independent positions the rate should be near 50%.
  let fired = 0;
  for (let i = 0; i < 1000; i++) if (chanceFires(50, i, 0, 0, 99)) fired++;
  assert.ok(fired > 400 && fired < 600, `fired ${fired}/1000`);
});

test('Turing bits tile, mutate and lock', () => {
  const config = track({
    generator: 'turing',
    scale: 'aeolian',
    root: 45,
    turing: { length: 4, mutation: 0.05, lowDegree: 0, highDegree: 4, rest: 0 },
    fx: { chance: false, roll: false, micro: false, velocity: false },
  });
  const bits = [true, false, false, true];
  const generated = generatePattern([config], 8, 5, [bits]).tracks[0]!;
  assert.deepEqual(generated.turingBits, bits);

  const high = pitchForDegree(45, 'aeolian', 4, 2);
  const low = pitchForDegree(45, 'aeolian', 0, 2);
  const expected = [...bits, ...bits].map((bit) => (bit ? high : low));
  assert.deepEqual(generated.steps.map((step) => step?.pitch), expected);

  assert.deepEqual(mutateTuringBits(bits, 0, 5), bits);
  assert.deepEqual(mutateTuringBits(bits, 1, 5), bits.map((bit) => !bit));
  const seeded = seedTuringBits(4, 5, 0);
  assert.equal(seeded.length, 4);
});

test('the walk stays in the scale and inside its register', () => {
  const config = track({
    generator: 'walk',
    root: 48,
    scale: 'dorian',
    walk: { range: 2, stepSize: 2, gravity: 0.2, bias: 0.1, rest: 0.1 },
    fx: { chance: false, roll: false, micro: false, velocity: false },
  });
  const generated = generatePattern([config], 128, 11, undefined).tracks[0]!;
  const max = maxDegree('dorian', 2);
  let notes = 0;
  for (const step of generated.steps) {
    if (step === null) continue;
    notes++;
    assert.ok(inScale(step.pitch, config.root, config.scale), `${step.pitch} not in scale`);
    const degree = pitchToDegree(step.pitch, config.root, config.scale);
    assert.ok(degree >= 0 && degree <= max, `degree ${degree} outside 0..${max}`);
  }
  assert.ok(notes > 0);
});

test('the Markov chain stays in the scale and register', () => {
  const config = track({
    generator: 'markov',
    root: 50,
    scale: 'phrygian',
    markov: { range: 3, leap: 0.3, rest: 0.1 },
    fx: { chance: false, roll: false, micro: false, velocity: false },
  });
  const generated = generatePattern([config], 128, 8).tracks[0]!;
  const max = maxDegree('phrygian', 3);
  for (const step of generated.steps) {
    if (step === null) continue;
    assert.ok(inScale(step.pitch, config.root, config.scale));
    const degree = pitchToDegree(step.pitch, config.root, config.scale);
    assert.ok(degree >= 0 && degree <= max);
  }
});

test('degree clamping is inside the register at both ends', () => {
  assert.equal(clampDegree(-99, 'aeolian', 2), 0);
  assert.equal(clampDegree(999, 'aeolian', 2), maxDegree('aeolian', 2));
});
