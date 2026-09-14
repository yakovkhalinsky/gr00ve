import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeRelative, encodeRelative, applyDelta,
  initialPickup, pickupUpdate, retarget, type RelativeMode,
} from './learn.ts';

test('signed mode decodes two’s complement', () => {
  assert.equal(decodeRelative(0x01, 'signed'), 1);
  assert.equal(decodeRelative(0x02, 'signed'), 2);
  assert.equal(decodeRelative(0x7f, 'signed'), -1);
  // 7-bit two's complement splits at 0x40: 0..63 are positive, 64..127 negative.
  assert.equal(decodeRelative(0x3f, 'signed'), 63);
  assert.equal(decodeRelative(0x40, 'signed'), -64);
});

test('binary offset mode centres on 0x40', () => {
  assert.equal(decodeRelative(0x41, 'binaryOffset'), 1);
  assert.equal(decodeRelative(0x3f, 'binaryOffset'), -1);
  assert.equal(decodeRelative(0x40, 'binaryOffset'), 0);
});

test('type 3 mode distinguishes +1 from −1', () => {
  assert.equal(decodeRelative(0x01, 'type3'), 1);
  assert.equal(decodeRelative(0x41, 'type3'), -1);
});

test('absolute mode reports no delta', () => {
  for (const v of [0, 1, 64, 127]) assert.equal(decodeRelative(v, 'absolute'), 0);
});

test('encode and decode round-trip across every mode', () => {
  const modes: RelativeMode[] = ['signed', 'binaryOffset', 'type3'];
  for (const mode of modes) {
    for (const delta of [-1, 1, -2, 2, -10, 10]) {
      const encoded = encodeRelative(delta, mode);
      assert.ok(encoded >= 0 && encoded <= 127, `${mode} encoded ${delta} -> ${encoded}`);
      assert.equal(decodeRelative(encoded, mode), delta, `${mode} delta ${delta}`);
    }
  }
});

test('decode masks to 7 bits, tolerating a dirty high bit', () => {
  assert.equal(decodeRelative(0x81, 'signed'), 1);
  assert.equal(decodeRelative(0xff, 'signed'), -1);
});

test('applyDelta clamps to the parameter range', () => {
  assert.equal(applyDelta(0.5, 1, 0.1), 0.6);
  assert.equal(applyDelta(0.95, 1, 0.1), 1);
  assert.equal(applyDelta(0.05, -1, 0.1), 0);
  assert.equal(applyDelta(5, 1, 1, 0, 10), 6);
});

test('pickup ignores the first sample — a single reading has no direction', () => {
  let st = initialPickup(0.5);
  const r = pickupUpdate(st, 0.1);
  assert.equal(r.value, null);
  assert.equal(r.state.engaged, false);
  st = r.state;
  // Still approaching.
  assert.equal(pickupUpdate(st, 0.2).value, null);
});

test('pickup engages on crossing, from below', () => {
  let st = initialPickup(0.5);
  st = pickupUpdate(st, 0.1).state;
  st = pickupUpdate(st, 0.4).state;
  const r = pickupUpdate(st, 0.6); // crosses 0.5
  assert.equal(r.value, 0.5, 'should snap to the target on crossing');
  assert.equal(r.state.engaged, true);
});

test('pickup engages on crossing, from above', () => {
  let st = initialPickup(0.5);
  st = pickupUpdate(st, 0.9).state;
  st = pickupUpdate(st, 0.6).state;
  const r = pickupUpdate(st, 0.4);
  assert.equal(r.value, 0.5);
  assert.equal(r.state.engaged, true);
});

test('pickup engages immediately when the fader already sits on the target', () => {
  const st = initialPickup(0.5);
  const r = pickupUpdate(st, 0.5);
  assert.equal(r.value, 0.5);
  assert.equal(r.state.engaged, true);
});

test('once engaged the hardware value passes straight through', () => {
  let st = initialPickup(0.5);
  st = pickupUpdate(st, 0.5).state;
  assert.equal(pickupUpdate(st, 0.8).value, 0.8);
  st = pickupUpdate(st, 0.8).state;
  assert.equal(pickupUpdate(st, 0.2).value, 0.2);
});

test('retarget re-arms pickup so a preset load cannot cause a jump', () => {
  let st = initialPickup(0.5);
  st = pickupUpdate(st, 0.5).state;
  assert.equal(st.engaged, true);

  // A preset moves the parameter to 0.9 while the fader is still at 0.5.
  st = retarget(st, 0.9);
  assert.equal(st.engaged, false);
  // The fader is now inert until it reaches 0.9.
  assert.equal(pickupUpdate(st, 0.5).value, null);
  st = pickupUpdate(st, 0.5).state;
  assert.equal(pickupUpdate(st, 0.7).value, null);
  st = pickupUpdate(st, 0.7).state;
  assert.equal(pickupUpdate(st, 0.95).value, 0.9);
});

test('pickup does not engage when the fader moves away from the target', () => {
  let st = initialPickup(0.8);
  st = pickupUpdate(st, 0.1).state;
  const r = pickupUpdate(st, 0.3); // moving further away
  assert.equal(r.value, null);
  assert.equal(r.state.engaged, false);
});
