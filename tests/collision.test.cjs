'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { DesktopContacts, box, overlaps, covered, clampBody, contact, resolve } = require('../src/pet/runtime/electron-helper/desktop-collision.js');
const area = [{ x: 0, y: 0, width: 2000, height: 1000 }];
const state = (x, extras = {}) => ({ x, y: 100, vx: 0, vy: 0, size: 320, bottomPad: 15,
  mode: 'idle', enabled: true, session: 'normal-1', revision: 0, ...extras });
function fixture(areas = area) {
  const sent = []; let clock = 1000;
  const broker = new DesktopContacts({ areas: () => areas, send: (id, s) => sent.push({ id, ...s }), now: () => clock });
  return { broker, sent, advance: ms => { clock += ms; } };
}
test('a fast throw hits even when its entire final body has passed the target', () => {
  const { broker, sent } = fixture(); broker.update('a', state(0)); broker.update('b', state(200));
  broker.update('a', state(500, { vx: 3000, mode: 'flight' }));
  assert.equal(sent.length, 2); const a = broker.states.get('a'), b = broker.states.get('b');
  assert(a.x < b.x); assert(!overlaps(box(a), box(b))); assert(b.vx > 0); assert(a.vx < 3000);
});
test('throwing in the opposite direction also uses the entry face', () => {
  const { broker, sent } = fixture(); broker.update('a', state(600)); broker.update('b', state(250));
  broker.update('a', state(0, { vx: -2000, mode: 'flight' }));
  assert.equal(sent.length, 2); assert(broker.states.get('b').vx < 0); assert(broker.states.get('a').x > broker.states.get('b').x);
});
test('a diagonal segment which misses must not invent a collision', () => {
  const hit = contact(state(0, { y: 0 }), state(600, { y: 600 }), state(300, { y: 0 }));
  assert.equal(hit, null);
});
test('transparent canvas margins do not collide', () => {
  const { broker, sent } = fixture(); broker.update('a', state(0)); broker.update('b', state(200));
  broker.update('a', state(20, { vx: 50, mode: 'flight' })); assert.equal(sent.length, 0);
});
test('holding a dragged fish pushes the other fish and preserves drag ownership', () => {
  const { broker } = fixture(); broker.update('a', state(0)); broker.update('b', state(200));
  broker.update('a', state(120, { vx: 220, mode: 'drag', bottomPad: 0 }));
  const a = broker.states.get('a'), b = broker.states.get('b');
  assert.equal(a.mode, 'drag'); assert.equal(a.vx, 220); assert.equal(b.mode, 'flight'); assert(b.vx > 0);
  assert(!overlaps(box(a), box(b)));
});
test('a thrown fish bounces off a fish currently held by the user', () => {
  const { broker } = fixture(); broker.update('a', state(0)); broker.update('b', state(200, { mode: 'drag' }));
  broker.update('a', state(150, { vx: 400, mode: 'flight' }));
  assert(broker.states.get('a').vx < 0); assert.equal(broker.states.get('b').mode, 'drag'); assert.equal(broker.states.get('b').x, 200);
});
test('two flights receive one shared impulse rather than two per-window bounces', () => {
  const { broker, sent } = fixture(); broker.update('a', state(0, { vx: 500, mode: 'flight' }));
  broker.update('b', state(200, { vx: -500, mode: 'flight' }));
  broker.update('a', state(100, { vx: 500, mode: 'flight' }));
  assert.equal(sent.length, 2); assert(Math.abs(broker.states.get('a').vx + 260) < 1e-6);
  assert(Math.abs(broker.states.get('b').vx - 260) < 1e-6);
});
test('queued pre-impact reports cannot overwrite the corrected pose', () => {
  const { broker } = fixture(); broker.update('a', state(0)); broker.update('b', state(200));
  broker.update('a', state(500, { vx: 2000, mode: 'flight' })); const b = { ...broker.states.get('b') };
  assert.equal(broker.update('b', state(200)), false); assert.deepEqual(broker.states.get('b'), b);
  assert.equal(broker.update('b', b), true);
});
test('DPI-rounded acknowledgments cannot start an endless contact/IPC loop', () => {
  for (const scale of [1, 1.25, 1.5, 2, 2.5, 3]) {
    const { broker, sent } = fixture();
    broker.update('a', state(0, { size: 220 * scale })); broker.update('b', state(280 * scale, { size: 220 * scale }));
    broker.update('a', state(600 * scale, { size: 220 * scale, vx: 3200 * scale, mode: 'flight' }));
    for (let i = 0; i < 30; i++) for (const id of ['a', 'b']) {
      const s = broker.states.get(id); broker.update(id, { ...s, x: Math.round(s.x / scale) * scale, y: Math.round(s.y / scale) * scale });
    }
    assert.equal(sent.length, 2, 'scale ' + scale);
  }
});
test('repeat contact correction does not add energy within its cooldown', () => {
  const { broker } = fixture(); broker.update('a', state(0)); broker.update('b', state(200));
  broker.update('a', state(150, { vx: 500, mode: 'flight' }));
  const a = broker.states.get('a'), b = broker.states.get('b');
  const speed = b.vx;
  broker.update('a', { ...a, x: b.x - 100 });
  assert.equal(broker.states.get('b').vx, speed);
});
test('a moving-away target with a stale reported position is not repeatedly corrected', () => {
  const { broker, sent } = fixture(); broker.update('a', state(0)); broker.update('b', state(200));
  broker.update('a', state(500, { vx: 2000, mode: 'flight' }));
  const a = broker.states.get('a'), b = broker.states.get('b'), n = sent.length;
  assert(b.vx > a.vx);
  // Several source frames arrive before the other renderer reports movement.
  for (let i = 0; i < 10; i++) broker.update('a', { ...a, x: a.x + 10 + i });
  assert.equal(sent.length, n); assert.equal(broker.states.get('b').revision, b.revision);
});
test('two fish starting exactly overlapped separate without NaN', () => {
  const { broker } = fixture(); broker.update('a', state(100)); broker.update('b', state(100));
  broker.update('a', state(101, { vx: 100, mode: 'flight' }));
  for (const s of broker.states.values()) assert([s.x, s.y, s.vx, s.vy].every(Number.isFinite));
  assert(!overlaps(box(broker.states.get('a')), box(broker.states.get('b'))));
});
test('a separating throw is not bounced back into a fish', () => {
  const { broker, sent } = fixture(); broker.update('a', state(100)); broker.update('b', state(200));
  broker.update('a', state(50, { vx: -100, mode: 'flight' })); assert.equal(sent.length, 0);
});
test('size-based mass makes a smaller fish receive more velocity', () => {
  const a = state(100, { vx: 400, mode: 'flight', size: 400 }), b = state(225, { size: 240 });
  const hit = contact(a, a, b), result = resolve(a, a, b, hit, area);
  assert(result.b.vx > 400); assert(result.a.vx > 0); assert(result.a.vx < 400);
});
test('held push against an edge blocks penetration and keeps bodies in the work area', () => {
  const { broker } = fixture([{ x: 0, y: 0, width: 650, height: 600 }]);
  broker.update('a', state(180)); broker.update('b', state(430));
  broker.update('a', state(400, { vx: 1000, mode: 'drag' }));
  const a = box(broker.states.get('a')), b = box(broker.states.get('b'));
  assert(a.right <= 650); assert(b.right <= 650); assert(!overlaps(a, b));
});
test('a pet can straddle adjacent screens without an invisible seam wall', () => {
  const areas = [{ x: -800, y: 0, width: 800, height: 600 }, { x: 0, y: 0, width: 800, height: 600 }];
  const s = state(-180); assert(covered(box(s), areas)); assert.deepEqual(clampBody(s, areas), s);
});
test('disconnected multi-monitor holes and taskbar strips are excluded', () => {
  const areas = [{ x: -800, y: 0, width: 800, height: 550 }, { x: 200, y: 300, width: 800, height: 550 }];
  const s = state(0, { y: 100 }); assert(!covered(box(s), areas)); assert(covered(box(clampBody(s, areas)), areas));
  const bottom = clampBody(state(-500, { y: 500, vy: 300 }), areas); assert(box(bottom).bottom <= 550); assert.equal(bottom.vy, 0);
});
test('disabling contacts on either fish disables its collision', () => {
  for (const id of ['a', 'b']) {
    const { broker, sent } = fixture(); broker.update('a', state(0, { enabled: id !== 'a' })); broker.update('b', state(200, { enabled: id !== 'b' }));
    broker.update('a', state(500, { vx: 2000, mode: 'flight', enabled: id !== 'a' })); assert.equal(sent.length, 0);
  }
});
test('closed clones and disposed sessions leave no ghost collider', () => {
  const { broker, sent } = fixture(); broker.update('a', state(0)); broker.update('b', state(200));
  broker.remove('b', 'old-session'); assert.equal(broker.states.size, 2);
  broker.remove('b', 'normal-1'); broker.update('a', state(500, { vx: 2000, mode: 'flight' }));
  assert.equal(sent.length, 0); assert.equal(broker.states.size, 1); broker.clear(); assert.equal(broker.states.size, 0);
});
test('restoring normal mode starts a new session without colliding with its old trajectory', () => {
  const { broker, sent } = fixture(); broker.update('a', state(0)); broker.update('b', state(200));
  broker.update('a', state(500, { vx: 2000, mode: 'flight' })); sent.length = 0;
  assert.equal(broker.update('a', state(1000, { session: 'normal-2' })), true); assert.equal(sent.length, 0);
  assert.equal(broker.states.get('a').revision, 0);
});
test('20 clones use bounded contact state and do not broadcast per-frame to every window', () => {
  const { broker, sent } = fixture(); for (let i = 0; i < 20; i++) broker.update(String(i), state(i * 350));
  const begin = performance.now(); for (let i = 0; i < 10000; i++) broker.update('0', state(i % 20, { mode: 'flight', vx: 30 }));
  assert.equal(sent.length, 0); assert.equal(broker.states.size, 20); assert.equal(broker.pairs.size, 0);
  assert(performance.now() - begin < 5000);
});
