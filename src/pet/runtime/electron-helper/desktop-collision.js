'use strict';

// Ordinary desktop pets only. One authoritative resolver prevents two windows
// from applying the same impact twice. Coordinates are viewport-relative pixels.
const OPTIONS = Object.freeze({ restitution: 0.52, slop: 0.8, repeatMs: 85, maxContacts: 4, speedPerSize: 4 });
const BODY = Object.freeze({ left: 200 / 640, top: 50 / 640, right: 440 / 640, bottom: 335 / 640 });
const active = s => s.mode === 'drag' || s.mode === 'flight';
const held = s => s.mode === 'drag';
const box = s => ({ left: s.x + s.size * BODY.left, top: s.y + s.bottomPad + s.size * BODY.top,
  right: s.x + s.size * BODY.right, bottom: s.y + s.bottomPad + s.size * BODY.bottom });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

function contact(previous, current, target) {
  const from = box(previous), to = box(current), other = box(target);
  // Swept AABB: test the complete segment, including frames which jump right
  // past the target. The direction comes from the entry face, not the end pose.
  if (!overlaps(from, other)) {
    const dx = to.left - from.left, dy = to.top - from.top;
    let entry = -Infinity, exit = Infinity, nx = 0, ny = 0;
    for (const [delta, lo, hi, min, max, ax, ay] of [
      [dx, from.left, from.right, other.left, other.right, 1, 0],
      [dy, from.top, from.bottom, other.top, other.bottom, 0, 1],
    ]) {
      if (Math.abs(delta) < 1e-9) { if (hi <= min || lo >= max) return null; continue; }
      const t1 = (min - hi) / delta, t2 = (max - lo) / delta;
      const enter = Math.min(t1, t2), leave = Math.max(t1, t2);
      if (enter > entry) { entry = enter; nx = ax * Math.sign(delta); ny = ay * Math.sign(delta); }
      exit = Math.min(exit, leave);
    }
    if (entry >= 0 && entry <= 1 && entry <= exit) return { nx, ny, time: entry, swept: true };
  }
  if (!overlaps(to, other)) return null;
  const x = Math.min(to.right - other.left, other.right - to.left);
  const y = Math.min(to.bottom - other.top, other.bottom - to.top);
  const cx = (other.left + other.right - to.left - to.right) / 2;
  const cy = (other.top + other.bottom - to.top - to.bottom) / 2;
  if (x <= y) return { nx: Math.sign(cx) || Math.sign(current.vx - target.vx) || 1, ny: 0, time: 0, swept: false };
  return { nx: 0, ny: Math.sign(cy) || Math.sign(current.vy - target.vy) || 1, time: 0, swept: false };
}

// Test the union, so a body may straddle adjacent monitors. Disconnected desktop
// holes and taskbars remain outside the arena.
function covered(b, areas) {
  const cuts = [b.left, b.right];
  for (const a of areas) for (const x of [a.x, a.x + a.width]) if (x > b.left && x < b.right) cuts.push(x);
  cuts.sort((a, c) => a - c);
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i] - cuts[i - 1] < 1e-7) continue;
    const x = (cuts[i] + cuts[i - 1]) / 2;
    const spans = areas.filter(a => x >= a.x && x <= a.x + a.width)
      .map(a => [a.y, a.y + a.height]).sort((a, c) => a[0] - c[0]);
    let bottom = b.top;
    for (const [top, end] of spans) { if (top > bottom + 1e-6) break; if (end > bottom) bottom = end; }
    if (bottom < b.bottom - 1e-6) return false;
  }
  return true;
}

function clampBody(state, areas) {
  if (!areas.length || covered(box(state), areas)) return state;
  const b = box(state); let best = null;
  for (const a of areas) {
    const bw = b.right - b.left, bh = b.bottom - b.top;
    const left = Math.max(a.x, Math.min(b.left, a.x + Math.max(0, a.width - bw)));
    const top = Math.max(a.y, Math.min(b.top, a.y + Math.max(0, a.height - bh)));
    const dx = left - b.left, dy = top - b.top, distance = dx * dx + dy * dy;
    if (!best || distance < best.distance) best = { dx, dy, distance };
  }
  return { ...state, x: state.x + best.dx, y: state.y + best.dy,
    vx: best.dx * state.vx < 0 ? 0 : state.vx, vy: best.dy * state.vy < 0 ? 0 : state.vy };
}

function speedLimit(s) {
  const speed = Math.hypot(s.vx, s.vy), cap = s.size * OPTIONS.speedPerSize;
  if (speed > cap) { s.vx *= cap / speed; s.vy *= cap / speed; }
}

function resolve(previous, source, target, hit, areas, impulse = true) {
  let a = { ...source }, b = { ...target };
  // Renderer positions round to CSS pixels before DPI conversion. Leave a
  // scale-sized gap so acknowledging a corrected pose cannot re-overlap it.
  const slop = Math.max(OPTIONS.slop, Math.min(a.size, b.size) * 0.012);
  if (hit.swept) {
    a.x = previous.x + (a.x - previous.x) * hit.time - hit.nx * slop;
    a.y = previous.y + (a.y - previous.y) * hit.time - hit.ny * slop;
  }
  const { nx, ny } = hit;
  const ia = held(a) ? 0 : 1 / (a.size * a.size), ib = held(b) ? 0 : 1 / (b.size * b.size);
  if (ia + ib === 0) return null;
  const relative = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (impulse && relative > 0) {
    const magnitude = (1 + OPTIONS.restitution) * relative / (ia + ib);
    a.vx -= magnitude * ia * nx; a.vy -= magnitude * ia * ny;
    b.vx += magnitude * ib * nx; b.vy += magnitude * ib * ny;
    speedLimit(a); speedLimit(b);
  }
  const ab = box(a), bb = box(b);
  const depth = nx ? (nx > 0 ? ab.right - bb.left : bb.right - ab.left)
    : (ny > 0 ? ab.bottom - bb.top : bb.bottom - ab.top);
  if (depth > -slop) {
    const separation = depth + slop;
    a.x -= nx * separation * ia / (ia + ib); a.y -= ny * separation * ia / (ia + ib);
    b.x += nx * separation * ib / (ia + ib); b.y += ny * separation * ib / (ia + ib);
  }
  const freeA = a, freeB = b;
  a = clampBody(a, areas); b = clampBody(b, areas);
  // A pushed pet against an edge cannot move further. Transfer the correction
  // to the other body, including the held pet, instead of allowing overlap.
  const blockedB = (freeB.x - b.x) * nx + (freeB.y - b.y) * ny;
  const blockedA = (a.x - freeA.x) * nx + (a.y - freeA.y) * ny;
  if (blockedB > 0) { a.x -= nx * blockedB; a.y -= ny * blockedB; a = clampBody(a, areas); }
  if (blockedA > 0) { b.x += nx * blockedA; b.y += ny * blockedA; b = clampBody(b, areas); }
  return { a, b, strength: Math.max(0, relative) };
}

class DesktopContacts {
  constructor({ send, areas = () => [], now = () => performance.now() }) {
    this.states = new Map(); this.pairs = new Map(); this.revision = 0;
    this.send = send; this.areas = areas; this.now = now;
  }
  remove(id, session) {
    if (session && this.states.get(id)?.session !== session) return;
    this.states.delete(id);
    for (const [key, p] of this.pairs) if (p.a === id || p.b === id) this.pairs.delete(key);
  }
  clear() { this.states.clear(); this.pairs.clear(); }
  accepts(id, s) {
    const old = this.states.get(id);
    return !old || old.session !== s.session || s.revision >= old.revision;
  }
  update(id, incoming) {
    if (!this.accepts(id, incoming)) return false;
    const previous = this.states.get(id);
    this.states.set(id, { ...incoming });
    if (!previous || previous.session !== incoming.session || !active(incoming) || !incoming.enabled) return true;
    const now = this.now(), areas = this.areas(); let current = this.states.get(id);
    for (let count = 0; count < OPTIONS.maxContacts; count++) {
      let candidate = null;
      for (const [otherId, target] of this.states) {
        if (otherId === id || !target.enabled || (held(current) && held(target))) continue;
        const hit = contact(count ? current : previous, current, target);
        if (!hit) continue;
        const relative = (current.vx - target.vx) * hit.nx + (current.vy - target.vy) * hit.ny;
        // A separating touch must not send two pets back towards one another.
        // Window reports are asynchronous: a fast moving-away target can still
        // occupy its previous pose until its next report arrives.
        const key = JSON.stringify([id, otherId].sort());
        if (relative <= 0 && (hit.swept || this.pairs.has(key))) continue;
        if (relative <= 0 && !overlaps(box(current), box(target))) continue;
        if (!candidate || hit.time < candidate.hit.time) candidate = { otherId, target, hit };
      }
      if (!candidate) break;
      const { otherId, target, hit } = candidate;
      const key = JSON.stringify([id, otherId].sort());
      const pair = this.pairs.get(key), allowImpulse = !pair || now - pair.at >= OPTIONS.repeatMs;
      const result = resolve(count ? current : previous, current, target, hit, areas, allowImpulse);
      if (!result) break;
      this.pairs.set(key, { a: id, b: otherId, at: allowImpulse ? now : pair.at });
      const revision = ++this.revision;
      result.a.revision = revision;
      if (!held(result.a)) result.a.mode = 'flight';
      if (!held(result.b)) result.b.mode = 'flight';
      const targetChanged = ['x', 'y', 'vx', 'vy'].some(k => Math.abs(result.b[k] - target[k]) > 1e-7)
        || result.b.mode !== target.mode;
      // Do not reset a moving target's revision for a source-only correction;
      // otherwise frequent drag reports can starve its queued movement frames.
      result.b.revision = targetChanged ? revision : target.revision;
      this.states.set(id, result.a); this.states.set(otherId, result.b); current = result.a;
      this.send(id, { ...result.a, strength: result.strength, otherId });
      if (targetChanged) this.send(otherId, { ...result.b, strength: result.strength, otherId: id });
    }
    return true;
  }
}

module.exports = { DesktopContacts, OPTIONS, BODY, box, overlaps, contact, covered, clampBody, resolve };
