/**
 * `.mtp` export.
 *
 * Polyend's `@polyend/tracker-lib` owns the file format; this module only maps
 * the generated model onto its structures. Two details are worth stating
 * explicitly because they are easy to get wrong and hard to see:
 *
 * **16 tracks, 8 of them used.** A Tracker Mini / Tracker+ pattern is 16 tracks
 * wide — 8 sample tracks plus 8 MIDI tracks — even though the Mini's front panel
 * shows 8 sample tracks. The library's own `createPattern` documents 12 (OG) or
 * 16 (Mini/Plus); tracker-ce's constants agree (`kAllTracks = 16`,
 * `core/source/mtStructs.h:87-90`). We fill the first 8 and leave the MIDI half
 * empty.
 *
 * **Version 5 on disk, translated by the device.** `tracker-lib` writes
 * `fileStructureVersion` `5.5.5.5` and six-byte steps. Tracker CE reads those
 * files and upgrades them in memory to its version 6 layout via
 * `translatePatternFromFileVersion5ToFileVersion6`
 * (`core/FileManager/fileManagerPattern.cpp:325-330`, `:489-523`), so the
 * exported file works on CE without us hand-writing a v6 record. Writing v5
 * also keeps the file readable by official firmware, which cannot read v6.
 */

import Tracker, { PatternConstants, PatternFX } from '@polyend/tracker-lib';
import type { PatternData, StepData } from '@polyend/tracker-lib';

import { DOCUMENTED_FX_INDICES, packedFx, type PackedFx } from './fx.ts';
import { clampInt } from './generators.ts';
import {
  FILE_TRACKS, SAMPLE_TRACKS, type GeneratedPattern,
} from './types.ts';

/** The pattern slot range the firmware accepts, `PATTERN_INDEX_MIN..MAX`. */
export const MIN_PATTERN_INDEX = 1;
export const MAX_PATTERN_INDEX = 255;

/** The `.mtp` size for a 16-track, 128-step version-5 pattern: 12336 bytes. */
export function patternFileSize(trackCount = FILE_TRACKS): number {
  return PatternConstants.HEADER_SIZE +
    PatternConstants.PADDING_SIZE +
    PatternConstants.UNUSED_SIZE +
    (PatternConstants.TRACK_HEADER_SIZE +
      PatternConstants.STEP_SIZE * PatternConstants.STEP_COUNT) * trackCount +
    PatternConstants.CRC_SIZE;
}

/** An empty effect slot. */
function noneFx(): StepData['fx'][number] {
  return { type: PatternFX[0]!, value: 0 };
}

/** Turn a packed effect into the library's record. */
function fxRecord(fx: PackedFx | undefined): StepData['fx'][number] {
  if (fx === undefined || !DOCUMENTED_FX_INDICES.includes(fx.index)) return noneFx();
  const type = PatternFX[fx.index];
  return { type: type ?? PatternFX[0]!, value: fx.value };
}

/**
 * Convert generated tracks into a Tracker pattern.
 *
 * Rests are explicit `note: -1` steps with instrument 0, which is what a blank
 * step in the Tracker's editor writes. Steps past the pattern's length are
 * filled with the same empty marker below: the format always stores 128 steps,
 * and `createPattern`'s zero padding would be a real note, not a rest.
 */
export function toPatternData(pattern: GeneratedPattern): PatternData {
  const data = Tracker.createPattern(FILE_TRACKS, pattern.length);
  data.header.size = patternFileSize(FILE_TRACKS);

  // `createPattern` only materialises `pattern.length` step objects per track.
  // The writer pads the rest with zero bytes, and a zero note is *C-1*, not the
  // empty marker (-1) — so a 32-step pattern would export 96 spurious low C
  // notes on every track. Fill the full 128-step record explicitly, including
  // the eight MIDI tracks we do not generate.
  for (const dstTrack of data.tracks) {
    for (let i = dstTrack.steps.length; i < PatternConstants.STEP_COUNT; i++) {
      dstTrack.steps.push({ note: -1, instrument: 0, fx: [noneFx(), noneFx()] });
    }
  }

  for (let trackIndex = 0; trackIndex < Math.min(SAMPLE_TRACKS, pattern.tracks.length); trackIndex++) {
    const track = pattern.tracks[trackIndex];
    const dstTrack = data.tracks[trackIndex];
    if (track === undefined || dstTrack === undefined) continue;

    // tracker-lib stores length as "last index", matching the firmware's
    // zero-based `strTrack::length`.
    dstTrack.length = pattern.length - 1;

    for (let stepIndex = 0; stepIndex < pattern.length; stepIndex++) {
      const src = track.steps[stepIndex] ?? null;
      const dst = dstTrack.steps[stepIndex];
      if (dst === undefined) continue;

      if (src === null) {
        dst.note = -1;
        dst.instrument = 0;
        dst.fx = [noneFx(), noneFx()];
        continue;
      }

      dst.note = clampInt(src.pitch, 0, 127);
      dst.instrument = clampInt(track.config.instrument, 0, 47);
      const packed = packedFx(src, track.config.fx);
      dst.fx = [fxRecord(packed[0]), fxRecord(packed[1])];
    }
  }

  return data;
}

/**
 * The filename the firmware expects.
 *
 * Tracker CE builds project pattern paths with `pattern_%02d.mtp`
 * (`core/FileManager/fileManagerDefs.h:71`) and accepts indexes 1–255
 * (`core/source/mtStructs.h:123-124`). `%02d` means *at least* two digits, so
 * `padStart(2, '0')` is the matching rule: 1 → `pattern_01.mtp`, 100 →
 * `pattern_100.mtp`.
 */
export function mtpFileName(index: number): string {
  const n = clampInt(index, MIN_PATTERN_INDEX, MAX_PATTERN_INDEX);
  return `pattern_${String(n).padStart(2, '0')}.mtp`;
}

/**
 * Write the pattern.
 *
 * In the browser tracker-lib turns this into a download; in Node it writes to
 * the given path. That dual behaviour is the library's, and reusing it means
 * the round-trip tests exercise the same writer the page uses.
 */
export async function writeMtp(pattern: GeneratedPattern, filename: string): Promise<void> {
  await Tracker.writePattern(toPatternData(pattern), filename);
}
