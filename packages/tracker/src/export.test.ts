import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Tracker from '@polyend/tracker-lib';
import type { FX, PatternData, StepData, TrackData } from '@polyend/tracker-lib';

import {
  defaultTrackConfig, generatePattern, mtpFileName, packedFx, patternFileSize, toPatternData,
  writeMtp,
  type GeneratedStep, type GeneratedTrack, type TrackConfig,
} from './index.ts';
import { DOCUMENTED_FX_INDICES, FX_CHANCE, FX_MICRO_MOVE, FX_ROLL, FX_VELOCITY } from './fx.ts';

/**
 * The round-trip suite the brief asks for: generate, write a real `.mtp`, read
 * it back with Polyend's own library, and compare every note, step, instrument
 * and effect.
 *
 * The fixtures deliberately spread the four documented effects across different
 * tracks, because a step has only two FX slots. Putting chance, roll, micro-move
 * and velocity on one track would test the packer's truncation rather than all
 * four codes reaching the file.
 */
const TRACKS: TrackConfig[] = [
  {
    ...defaultTrackConfig(0),
    generator: 'euclid',
    euclid: { hits: 4, steps: 16, rotation: 0 },
    fx: { chance: true, roll: false, micro: false, velocity: true },
    chance: { base: 70, spread: 20 },
    velocity: { base: 80, spread: 10 },
  },
  {
    ...defaultTrackConfig(1),
    generator: 'euclid',
    euclid: { hits: 5, steps: 16, rotation: 2 },
    fx: { chance: false, roll: true, micro: true, velocity: false },
    roll: { probability: 1, type: 0, division: 4 },
    micro: { probability: 1, amount: 25 },
  },
  {
    ...defaultTrackConfig(2),
    generator: 'probability',
    probability: { density: 55, spread: 30 },
    fx: { chance: true, roll: false, micro: false, velocity: true },
    velocity: { base: 75, spread: 15 },
  },
  {
    ...defaultTrackConfig(3),
    generator: 'turing',
    turing: { length: 8, mutation: 0.1, lowDegree: 0, highDegree: 4, rest: 0.1 },
    fx: { chance: true, roll: false, micro: false, velocity: true },
    chance: { base: 80, spread: 10 },
  },
  {
    ...defaultTrackConfig(4),
    generator: 'walk',
    walk: { range: 2, stepSize: 2, gravity: 0.2, bias: 0.1, rest: 0.2 },
    fx: { chance: true, roll: true, micro: false, velocity: false },
    chance: { base: 75, spread: 10 },
    roll: { probability: 1, type: 2, division: 4 },
  },
  {
    ...defaultTrackConfig(5),
    generator: 'markov',
    markov: { range: 2, leap: 0.2, rest: 0.15 },
    fx: { chance: false, roll: false, micro: true, velocity: true },
    micro: { probability: 1, amount: 15 },
  },
  {
    ...defaultTrackConfig(6),
    generator: 'euclid',
    euclid: { hits: 3, steps: 8, rotation: 1 },
    fx: { chance: false, roll: false, micro: false, velocity: true },
  },
  {
    ...defaultTrackConfig(7),
    generator: 'probability',
    probability: { density: 40, spread: 20 },
    fx: { chance: true, roll: false, micro: false, velocity: true },
  },
];

const LENGTH = 32;
const SEED = 20261103;

function expectedFx(track: GeneratedTrack, stepIndex: number) {
  const step = track.steps[stepIndex];
  return step ? packedFx(step, track.config.fx) : [];
}

test('a generated pattern round-trips through a real .mtp', async () => {
  const pattern = generatePattern(TRACKS, LENGTH, SEED, undefined);
  const dir = await mkdtemp(join(tmpdir(), 'gr00ve-mtp-'));

  try {
    const path = join(dir, mtpFileName(1));
    await writeMtp(pattern, path);

    const read: PatternData | null = await Tracker.readPattern(path);
    assert.ok(read !== null, 'tracker-lib failed to parse the file');

    // --- header and layout ------------------------------------------------
    assert.equal(read.header.id_file, 'PM');
    assert.equal(read.header.fileStructureVersion, '5.5.5.5');
    assert.equal(read.header.size, patternFileSize(16));
    assert.equal(read.header.size, 12336);
    assert.equal(read.trackCount, 16);
    assert.equal(read.tracks.length, 16);

    // --- every generated track and step ----------------------------------
    for (let t = 0; t < 8; t++) {
      const generated: GeneratedTrack | undefined = pattern.tracks[t];
      const stored: TrackData | undefined = read.tracks[t];
      if (generated === undefined || stored === undefined) {
        assert.fail(`track ${t + 1} missing from the read-back pattern`);
        continue;
      }
      assert.equal(stored.length, LENGTH - 1, `track ${t + 1} length`);
      assert.equal(stored.steps.length, 128);

      for (let i = 0; i < LENGTH; i++) {
        const src: GeneratedStep | null = generated.steps[i] ?? null;
        const dst: StepData | undefined = stored.steps[i];
        if (dst === undefined) {
          assert.fail(`track ${t + 1} step ${i + 1} missing`);
          continue;
        }

        if (src === null) {
          assert.equal(dst.note, -1, `track ${t + 1} step ${i + 1} should be empty`);
          assert.equal(dst.instrument, 0);
          assert.equal(dst.fx[0]?.type.index, 0);
          assert.equal(dst.fx[1]?.type.index, 0);
          continue;
        }

        assert.equal(dst.note, src.pitch, `track ${t + 1} step ${i + 1} note`);
        assert.equal(dst.instrument, generated.config.instrument, `track ${t + 1} step ${i + 1} instrument`);

        const want = expectedFx(generated, i);
        for (let slot = 0; slot < 2; slot++) {
          const got: FX | undefined = dst.fx[slot];
          const expected = want[slot];
          assert.ok(got !== undefined, `track ${t + 1} step ${i + 1} slot ${slot} missing`);
          if (expected === undefined) {
            assert.equal(got.type.index, 0, `track ${t + 1} step ${i + 1} slot ${slot} should be empty`);
            assert.equal(got.value, 0);
          } else {
            assert.equal(got.type.index, expected.index, `track ${t + 1} step ${i + 1} slot ${slot} FX type`);
            assert.equal(got.value, expected.value, `track ${t + 1} step ${i + 1} slot ${slot} FX value`);
          }
        }
      }

      // Steps beyond the pattern length remain empty in the 128-step file.
      for (let i = LENGTH; i < 128; i++) {
        assert.equal(stored.steps[i]?.note, -1);
        assert.equal(stored.steps[i]?.instrument, 0);
      }
    }

    // Tracks 9–16 are the MIDI half and stay untouched.
    for (let t = 8; t < 16; t++) {
      for (const step of read.tracks[t]?.steps ?? []) {
        assert.equal(step.note, -1, `MIDI track ${t + 1} should be empty`);
        assert.equal(step.instrument, 0);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('all four documented FX codes reach the file with in-range values', async () => {
  const pattern = generatePattern(TRACKS, LENGTH, SEED, undefined);
  const dir = await mkdtemp(join(tmpdir(), 'gr00ve-mtp-fx-'));

  try {
    const path = join(dir, mtpFileName(7));
    await writeMtp(pattern, path);
    const read = await Tracker.readPattern(path);
    assert.ok(read !== null);

    const seen = new Set<number>();
    const limits: Record<number, readonly [number, number]> = {
      [FX_CHANCE]: [0, 100],
      [FX_ROLL]: [1, 47],
      [FX_MICRO_MOVE]: [1, 100],
      [FX_VELOCITY]: [0, 100],
    };

    for (const track of read.tracks) {
      for (const step of track.steps) {
        for (const fx of step.fx) {
          if (fx.type.index === 0) continue;
          assert.ok(DOCUMENTED_FX_INDICES.includes(fx.type.index), `undocumented FX ${fx.type.index}`);
          const [min, max] = limits[fx.type.index] ?? [0, 0];
          assert.ok(fx.value >= min && fx.value <= max, `FX ${fx.type.index} value ${fx.value} out of range`);
          seen.add(fx.type.index);
        }
      }
    }

    assert.deepEqual([...seen].sort((a, b) => a - b), [2, 3, 4, 18]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the file is the 16-track version 5 layout Tracker CE translates', async () => {
  const pattern = generatePattern(TRACKS, LENGTH, SEED, undefined);
  const dir = await mkdtemp(join(tmpdir(), 'gr00ve-mtp-bytes-'));

  try {
    const path = join(dir, mtpFileName(255));
    assert.equal(path.endsWith('pattern_255.mtp'), true);
    await writeMtp(pattern, path);

    const bytes = new Uint8Array(await readFile(path));
    assert.equal(bytes.byteLength, 12336);
    assert.equal(new TextDecoder('ascii').decode(bytes.slice(0, 2)), 'PM');
    // fileStructureVersion is four bytes at offset 8: 5.5.5.5.
    assert.deepEqual([...bytes.slice(8, 12)], [5, 5, 5, 5]);
    assert.equal(bytes[12]! | (bytes[13]! << 8), patternFileSize(16));

    // Track 0's length is the first byte after the 28-byte file header.
    assert.equal(bytes[28], LENGTH - 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the conversion is pure and does not mutate the generated pattern', () => {
  const pattern = generatePattern(TRACKS, LENGTH, SEED, undefined);
  const before = structuredClone(pattern);
  const data = toPatternData(pattern);
  assert.equal(data.tracks.length, 16);
  assert.equal(data.tracks[0]?.length, LENGTH - 1);
  assert.deepEqual(pattern, before);
});

test('pattern filenames follow the firmware %02d rule', () => {
  assert.equal(mtpFileName(1), 'pattern_01.mtp');
  assert.equal(mtpFileName(9), 'pattern_09.mtp');
  assert.equal(mtpFileName(100), 'pattern_100.mtp');
  assert.equal(mtpFileName(255), 'pattern_255.mtp');
  assert.equal(mtpFileName(0), 'pattern_01.mtp');
  assert.equal(mtpFileName(999), 'pattern_255.mtp');
});
