'use strict';
// Auto-search a clean diagonal SNAKES/LADDERS layout for snake-ladder.
// Mirrors the exact geometry math used in the RN client (SnakeLadderGame.tsx).

const CELL = 40;
const GRID = 10;

function squareToCenter(sq) {
  const idx = sq - 1;
  const rawRow = Math.floor(idx / GRID);
  const rawCol = idx % GRID;
  const row = GRID - 1 - rawRow;
  const col = rawRow % 2 === 0 ? rawCol : GRID - 1 - rawCol;
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function bezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function snakeCurve(headSq, tailSq, idx) {
  const s = squareToCenter(headSq);
  const e = squareToCenter(tailSq);
  const dx = e.x - s.x, dy = e.y - s.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const mag = Math.min(46, Math.max(18, dist * 0.35));
  const off = mag * (idx % 2 === 0 ? 1 : -1);
  const mx = (s.x + e.x) / 2, my = (s.y + e.y) / 2;
  const p1 = { x: mx + off, y: my - mag * 0.3 };
  const p2 = { x: mx - off, y: my + mag * 0.3 };
  return { s, e, p1, p2 };
}

function sampleSnake(headSq, tailSq, idx, n = 40) {
  const { s, p1, p2, e } = snakeCurve(headSq, tailSq, idx);
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(bezierPoint(s, p1, p2, e, i / n));
  return pts;
}
function sampleLadder(baseSq, topSq, n = 40) {
  const s = squareToCenter(baseSq);
  const e = squareToCenter(topSq);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: s.x + (e.x - s.x) * t, y: s.y + (e.y - s.y) * t });
  }
  return pts;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function minDist(ptsA, ptsB) {
  let m = Infinity;
  for (const a of ptsA) for (const b of ptsB) m = Math.min(m, dist(a, b));
  return m;
}
function headReach(headSq, tailSq, idx) {
  const { s, e, p1, p2 } = snakeCurve(headSq, tailSq, idx);
  const out = [];
  for (let i = 1; i <= 4; i++) out.push(bezierPoint(s, p1, p2, e, -i * 0.04));
  return out;
}

const SS_MIN = 12, SL_MIN = 12, LL_MIN = 10;

function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}
function boxesOverlap(a, b, pad) {
  return !(a.x1 + pad < b.x0 || b.x1 + pad < a.x0 || a.y1 + pad < b.y0 || b.y1 + pad < a.y0);
}

function check(snakesArr, laddersArr) {
  const entries = snakesArr.map(([h, t], i) => {
    const pts = sampleSnake(h, t, i);
    return { head: h, tail: t, pts, bb: bbox(pts), reach: headReach(h, t, i) };
  });
  const lads = laddersArr.map(([b, t]) => {
    const pts = sampleLadder(b, t);
    return { base: b, top: t, pts, bb: bbox(pts) };
  });
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      if (!boxesOverlap(entries[i].bb, entries[j].bb, 8)) continue;
      if (Math.min(minDist(entries[i].pts, entries[j].pts),
        minDist(entries[i].reach, entries[j].pts), minDist(entries[j].reach, entries[i].pts)) < SS_MIN) return false;
    }
  for (let i = 0; i < lads.length; i++)
    for (let j = i + 1; j < lads.length; j++) {
      if (!boxesOverlap(lads[i].bb, lads[j].bb, 8)) continue;
      if (minDist(lads[i].pts, lads[j].pts) < LL_MIN) return false;
    }
  for (const s of entries)
    for (const l of lads) {
      if (!boxesOverlap(s.bb, l.bb, 8)) continue;
      if (Math.min(minDist(s.pts, l.pts), minDist(s.reach, l.pts)) < SL_MIN) return false;
    }
  return true;
}

function squareAt(row, col) {
  // row 0..9 from top, col 0..9 from left
  const rawRow = GRID - 1 - row;
  const rawCol = rawRow % 2 === 0 ? col : GRID - 1 - col;
  return rawRow * GRID + rawCol + 1;
}

const rnd = (n) => Math.floor(Math.random() * n);

// ── Search (prefer wide col shifts + even spread) ───────────────────────────
function attempt() {
  const snakes = [];
  const ladders = [];
  const used = new Set();

  // 6 snakes: head rows 0..6, tail 3-5 rows lower, col shift ±2..3
  let guard = 0;
  while (snakes.length < 6 && guard++ < 4000) {
    const hr = rnd(7); // 0..6
    const hc = rnd(10);
    const head = squareAt(hr, hc);
    if (head === 100 || used.has(head)) continue;
    const drop = 3 + rnd(3); // 3..5 rows
    const tr = hr + drop;
    if (tr > 9) continue;
    const shift = (rnd(2) === 0 ? -1 : 1) * (2 + rnd(2)); // ±2..3 cols
    const tc = hc + shift;
    if (tc < 0 || tc > 9) continue;
    const tail = squareAt(tr, tc);
    if (tail === 100 || used.has(tail)) continue;
    if (head - tail <= 15) continue;
    snakes.push([head, tail]);
    used.add(head); used.add(tail);
  }
  if (snakes.length < 6) return null;

  // 6 ladders: base rows 9..5, top 2-4 rows higher, col shift ±1..3
  guard = 0;
  while (ladders.length < 6 && guard++ < 4000) {
    const br = 9 - rnd(5); // 9..5
    const bc = rnd(10);
    const base = squareAt(br, bc);
    if (used.has(base)) continue;
    const rise = 2 + rnd(3); // 2..4 rows
    const tr = br - rise;
    if (tr < 0) continue;
    const shift = (rnd(2) === 0 ? -1 : 1) * (1 + rnd(2)); // ±1..2 cols
    const tc = bc + shift;
    if (tc < 0 || tc > 9) continue;
    const top = squareAt(tr, tc);
    if (used.has(top)) continue;
    ladders.push([base, top]);
    used.add(base); used.add(top);
  }
  if (ladders.length < 6) return null;

  if (!check(snakes, ladders)) return null;

  // Score: prefer big total col-shift magnitude (dramatic diagonals) + spread
  let colShift = 0, headRows = new Set(), tailRows = new Set();
  for (const [h, t] of snakes) {
    const hs = squareToCenter(h), ts = squareToCenter(t);
    colShift += Math.abs((ts.x - hs.x) / CELL);
    headRows.add(Math.floor(hs.y / CELL));
    tailRows.add(Math.floor(ts.y / CELL));
  }
  let ladShift = 0;
  for (const [b, t] of ladders) {
    const bs = squareToCenter(b), ts = squareToCenter(t);
    ladShift += Math.abs((ts.x - bs.x) / CELL);
  }
  const spread = headRows.size * 10 + tailRows.size * 8 + new Set(ladders.map(([b]) => Math.floor(squareToCenter(b).y / CELL))).size * 4;
  return { snakes, ladders, score: colShift * 6 + ladShift * 4 + spread - snakes.length * 4 };
}

function toMap(snakesArr, laddersArr) {
  const out = {};
  snakesArr.forEach(([h, t]) => { out[h] = t; });
  return out;
}

const results = [];
for (let i = 0; i < 250000 && results.length < 6; i++) {
  const f = attempt();
  if (f && !results.some(r => JSON.stringify(r.snakes) === JSON.stringify(f.snakes) &&
    JSON.stringify(r.ladders) === JSON.stringify(f.ladders))) results.push(f);
}
results.sort((a, b) => b.score - a.score);
if (results.length === 0) {
  console.log('No layout found — relax constraints.');
} else {
  results.forEach((found, ri) => {
  const { snakes, ladders, score } = found;
  console.log('\n──────── Candidate ' + (ri + 1) + ' (score ' + score.toFixed(0) + ') ────────');
  console.log('SNAKES  =', JSON.stringify(toMap(snakes)));
  console.log('LADDERS =', JSON.stringify(toMap(ladders)));
  const grid = Array.from({ length: 10 }, () => Array(10).fill('..'));
  snakes.forEach(([h, t]) => { const s = squareToCenter(h); grid[Math.floor(s.y / CELL)][Math.floor(s.x / CELL)] = 'HH'; const e = squareToCenter(t); grid[Math.floor(e.y / CELL)][Math.floor(e.x / CELL)] = 'TT'; });
  ladders.forEach(([b, t]) => { const s = squareToCenter(b); grid[Math.floor(s.y / CELL)][Math.floor(s.x / CELL)] = 'BB'; const e = squareToCenter(t); grid[Math.floor(e.y / CELL)][Math.floor(e.x / CELL)] = 'TP'; });
  console.log('    c0  c1  c2  c3  c4  c5  c6  c7  c8  c9');
  grid.forEach((row, r) => console.log('r' + r + ' ' + row.join('  ')));
  });
}
