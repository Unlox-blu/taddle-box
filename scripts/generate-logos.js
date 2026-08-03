/**
 * Generates the branded per-game logo PNGs used by GameLogo.
 * Pure Node — no dependencies (zlib is built-in). Run:  node scripts/generate-logos.js
 * Output: assets/logos/{tap-rush,memory-grid,scribble,ludo,snake-ladder,chess,word-rush}.png
 *
 * Each logo is a 512x512 tile: brand gradient background, rounded-corner
 * accent, and a distinct game mark drawn with vector-style primitives.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 512;
const OUT_DIR = path.join(__dirname, "..", "assets", "logos");

// ── Minimal PNG encoder ──────────────────────────────────────────────────────
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    Buffer.from(rgba.buffer, y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Tiny raster canvas ───────────────────────────────────────────────────────
function Canvas() {
  return { size: SIZE, data: new Uint8Array(SIZE * SIZE * 4) };
}

function setPx(c, x, y, r, g, b, a = 255) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= c.size || yi >= c.size) return;
  const i = (yi * c.size + xi) * 4;
  const sa = a / 255;
  if (sa >= 1) {
    c.data[i] = r;
    c.data[i + 1] = g;
    c.data[i + 2] = b;
    c.data[i + 3] = 255;
    return;
  }
  const da = c.data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  c.data[i] = Math.round((r * sa + c.data[i] * da * (1 - sa)) / oa);
  c.data[i + 1] = Math.round((g * sa + c.data[i + 1] * da * (1 - sa)) / oa);
  c.data[i + 2] = Math.round((b * sa + c.data[i + 2] * da * (1 - sa)) / oa);
  c.data[i + 3] = Math.round(oa * 255);
}

function fillRect(c, x, y, w, h, col) {
  for (let yy = Math.floor(y); yy < y + h; yy++) {
    for (let xx = Math.floor(x); xx < x + w; xx++) setPx(c, xx, yy, ...col);
  }
}

function fillCircle(c, cx, cy, r, col) {
  const r2 = r * r;
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
    for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r2) setPx(c, xx, yy, ...col);
    }
  }
}

function strokeCircle(c, cx, cy, r, w, col) {
  const ro = r + w / 2;
  const ri = r - w / 2;
  for (let yy = Math.floor(cy - ro); yy <= Math.ceil(cy + ro); yy++) {
    for (let xx = Math.floor(cx - ro); xx <= Math.ceil(cx + ro); xx++) {
      const d2 = (xx - cx) * (xx - cx) + (yy - cy) * (yy - cy);
      if (d2 <= ro * ro && d2 >= ri * ri) setPx(c, xx, yy, ...col);
    }
  }
}

function fillRoundRect(c, x, y, w, h, rad, col) {
  fillRect(c, x + rad, y, w - rad * 2, h, col);
  fillRect(c, x, y + rad, rad, h - rad * 2, col);
  fillRect(c, x + w - rad, y + rad, rad, h - rad * 2, col);
  fillCircle(c, x + rad, y + rad, rad, col);
  fillCircle(c, x + w - rad, y + rad, rad, col);
  fillCircle(c, x + rad, y + h - rad, rad, col);
  fillCircle(c, x + w - rad, y + h - rad, rad, col);
}

function fillPoly(c, pts, col) {
  const minX = Math.floor(Math.min(...pts.map((p) => p[0])));
  const maxX = Math.ceil(Math.max(...pts.map((p) => p[0])));
  const minY = Math.floor(Math.min(...pts.map((p) => p[1])));
  const maxY = Math.ceil(Math.max(...pts.map((p) => p[1])));
  for (let yy = minY; yy <= maxY; yy++) {
    for (let xx = minX; xx <= maxX; xx++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (
          yi > yy !== yj > yy &&
          xx < ((xj - xi) * (yy - yi)) / (yj - yi) + xi
        ) {
          inside = !inside;
        }
      }
      if (inside) setPx(c, xx, yy, ...col);
    }
  }
}

function thickLine(c, x1, y1, x2, y2, w, col) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fillCircle(c, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, w / 2, col);
  }
}

function polyline(c, pts, w, col) {
  for (let i = 0; i < pts.length - 1; i++) {
    thickLine(c, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, col);
  }
}

function diagGradient(c, c1, c2) {
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      const t = (x / c.size + y / c.size) / 2; // 0..1 diagonal
      setPx(
        c,
        x,
        y,
        Math.round(c1[0] + (c2[0] - c1[0]) * t),
        Math.round(c1[1] + (c2[1] - c1[1]) * t),
        Math.round(c1[2] + (c2[2] - c1[2]) * t),
        255,
      );
    }
  }
}

/** Subtle top-left sheen so tiles feel like glossy logo art. */
function sheen(c, alpha = 0.09) {
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      const t = Math.max(0, 1 - (x + y) / (c.size * 1.4));
      if (t > 0) setPx(c, x, y, 255, 255, 255, Math.round(alpha * t * 255));
    }
  }
}

/** Soft inner border ring. */
function innerRing(c) {
  strokeCircle(c, SIZE / 2, SIZE / 2, SIZE / 2 - 6, 6, [255, 255, 255, 60]);
}

// ── Logo definitions ─────────────────────────────────────────────────────────
const COL = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const logos = {
  "tap-rush": (c) => {
    diagGradient(c, COL("#7C3AED"), COL("#0891B2"));
    // Lightning bolt
    fillPoly(
      c,
      [
        [300, 96],
        [186, 292],
        [260, 292],
        [222, 416],
        [352, 222],
        [276, 222],
      ],
      [255, 255, 255, 255],
    );
    sheen(c);
    innerRing(c);
  },

  "memory-grid": (c) => {
    diagGradient(c, COL("#0F766E"), COL("#4F46E5"));
    const cell = 78;
    const gap = 26;
    const off = (SIZE - (cell * 3 + gap * 2)) / 2;
    const tiles = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        tiles.push({
          x: off + col * (cell + gap),
          y: off + row * (cell + gap),
        });
      }
    }
    // Highlighted center tile glow
    fillCircle(c, SIZE / 2, SIZE / 2, 86, [52, 211, 153, 90]);
    tiles.forEach((t, i) => {
      const isCenter = i === 4;
      if (isCenter) {
        fillRoundRect(c, t.x, t.y, cell, cell, 18, [52, 211, 153, 255]);
        fillRoundRect(c, t.x + 8, t.y + 8, cell - 16, cell - 16, 12, [16, 185, 129, 255]);
      } else {
        fillRoundRect(c, t.x, t.y, cell, cell, 18, [255, 255, 255, 56]);
        fillRoundRect(c, t.x + 8, t.y + 8, cell - 16, cell - 16, 12, [255, 255, 255, 30]);
      }
    });
    sheen(c, 0.07);
    innerRing(c);
  },

  scribble: (c) => {
    diagGradient(c, COL("#F59E0B"), COL("#EF4444"));
    // Pencil body
    fillRoundRect(c, 196, 128, 120, 220, 22, [255, 255, 255, 255]);
    // Pencil tip (yellow wood + graphite)
    fillPoly(c, [
      [196, 348],
      [316, 348],
      [256, 420],
    ], [253, 230, 138, 255]);
    fillPoly(c, [
      [236, 348],
      [276, 348],
      [256, 396],
    ], [51, 65, 85, 255]);
    // Eraser band
    fillRect(c, 214, 128, 84, 26, [52, 211, 153, 255]);
    // Scribble squiggle behind
    polyline(
      c,
      [
        [352, 200],
        [382, 232],
        [336, 262],
        [392, 292],
        [344, 322],
      ],
      16,
      [255, 255, 255, 200],
    );
    sheen(c, 0.06);
    innerRing(c);
  },

  ludo: (c) => {
    diagGradient(c, COL("#10B981"), COL("#3B82F6"));
    // Die
    fillRoundRect(c, 160, 160, 192, 192, 34, [255, 255, 255, 255]);
    fillRoundRect(c, 160, 160, 192, 192, 34, [17, 24, 39, 60]);
    const dot = (x, y) => fillCircle(c, x, y, 22, [30, 27, 75, 255]);
    dot(214, 214);
    dot(298, 214);
    dot(256, 256);
    dot(214, 298);
    dot(298, 298);
    // Small ludo-cross accent at top-right
    const cx = 392, cy = 132;
    fillRoundRect(c, cx - 44, cy - 14, 88, 28, 14, [255, 255, 255, 220]);
    fillRoundRect(c, cx - 14, cy - 44, 28, 88, 14, [255, 255, 255, 220]);
    fillCircle(c, cx, cy, 13, [124, 58, 237, 255]);
    sheen(c, 0.07);
    innerRing(c);
  },

  "snake-ladder": (c) => {
    diagGradient(c, COL("#8B5CF6"), COL("#EC4899"));
    // Ladder (gold rails + rungs)
    const lx = 168;
    const ly0 = 138;
    const ly1 = 372;
    thickLine(c, lx, ly0, lx, ly1, 18, [251, 191, 36, 255]);
    thickLine(c, lx + 64, ly0, lx + 64, ly1, 18, [251, 191, 36, 255]);
    for (let i = 0; i <= 4; i++) {
      const yy = ly0 + ((ly1 - ly0) * i) / 4;
      thickLine(c, lx, yy, lx + 64, yy, 16, [254, 240, 138, 255]);
    }
    // Snake (body + head)
    polyline(
      c,
      [
        [330, 392],
        [392, 344],
        [318, 300],
        [388, 246],
        [322, 206],
      ],
      40,
      [34, 197, 94, 255],
    );
    fillCircle(c, 322, 186, 40, [34, 197, 94, 255]);
    fillCircle(c, 322, 186, 40, [22, 163, 74, 255]);
    // Eyes + tongue
    fillCircle(c, 307, 176, 8, [255, 255, 255, 255]);
    fillCircle(c, 337, 176, 8, [255, 255, 255, 255]);
    fillCircle(c, 307, 176, 4, [17, 24, 39, 255]);
    fillCircle(c, 337, 176, 4, [17, 24, 39, 255]);
    thickLine(c, 322, 222, 322, 252, 6, [248, 113, 113, 255]);
    thickLine(c, 322, 252, 308, 262, 5, [248, 113, 113, 255]);
    thickLine(c, 322, 252, 336, 262, 5, [248, 113, 113, 255]);
    sheen(c, 0.06);
    innerRing(c);
  },

  chess: (c) => {
    diagGradient(c, COL("#374151"), COL("#0F172A"));
    // Checkered backdrop
    const s = 44;
    const bx = SIZE / 2 - s * 2;
    const by = 96;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        if ((row + col) % 2 === 0) continue;
        fillRect(c, bx + col * s, by + row * s, s, s, [255, 255, 255, 26]);
      }
    }
    // Pawn silhouette
    fillRoundRect(c, 196, 150, 120, 34, 17, [241, 245, 249, 255]); // head collar
    fillRect(c, 226, 150, 60, 26, [241, 245, 249, 255]);
    fillCircle(c, 256, 158, 34, [241, 245, 249, 255]); // head
    fillCircle(c, 256, 126, 12, [241, 245, 249, 255]); // finial
    fillRect(c, 236, 182, 40, 66, [241, 245, 249, 255]); // neck
    fillRoundRect(c, 206, 248, 100, 40, 18, [241, 245, 249, 255]); // collar
    fillRoundRect(c, 218, 288, 76, 84, 20, [241, 245, 249, 255]); // body
    fillRoundRect(c, 182, 372, 148, 44, 22, [241, 245, 249, 255]); // base
    // Base highlight
    fillRoundRect(c, 196, 380, 120, 12, 6, [148, 163, 184, 120]);
    sheen(c, 0.05);
    innerRing(c);
  },

  "word-rush": (c) => {
    diagGradient(c, COL("#F43F5E"), COL("#8B5CF6"));
    // Letter tiles
    const tiles = [
      { x: 140, y: 300, w: 96, h: 96, r: 22, a: 170, rot: -1 },
      { x: 210, y: 252, w: 96, h: 96, r: 22, a: 220, rot: 1 },
      { x: 280, y: 204, w: 96, h: 96, r: 22, a: 255, rot: -1 },
    ];
    tiles.forEach((t) => {
      fillRoundRect(c, t.x + t.rot * 6, t.y + t.rot * 4, t.w, t.h, t.r, [
        255, 255, 255, t.a,
      ]);
      fillRoundRect(c, t.x + t.rot * 6 + 8, t.y + t.rot * 4 + 8, t.w - 16, t.h - 16, t.r - 6, [
        255, 255, 255, Math.min(255, t.a - 60),
      ]);
    });
    // Letters W R S
    const letter = (px, py, ch, size, col) => {
      const glyphs = {
        W: [
          [1, 0, 0, 0, 1],
          [1, 0, 0, 0, 1],
          [1, 0, 0, 0, 1],
          [1, 0, 1, 0, 1],
          [1, 1, 0, 1, 1],
          [1, 0, 0, 0, 1],
          [1, 0, 0, 0, 1],
        ],
        R: [
          [1, 1, 1, 1, 0],
          [1, 0, 0, 0, 1],
          [1, 0, 0, 0, 1],
          [1, 1, 1, 1, 0],
          [1, 0, 1, 0, 0],
          [1, 0, 0, 1, 0],
          [1, 0, 0, 0, 1],
        ],
        S: [
          [0, 1, 1, 1, 1],
          [1, 0, 0, 0, 0],
          [1, 0, 0, 0, 0],
          [0, 1, 1, 1, 0],
          [0, 0, 0, 0, 1],
          [0, 0, 0, 0, 1],
          [1, 1, 1, 1, 0],
        ],
      };
      const g = glyphs[ch];
      for (let lr = 0; lr < 7; lr++) {
        for (let lc = 0; lc < 5; lc++) {
          if (g[lr][lc]) {
            fillRect(c, px + lc * size, py + lr * size, size, size, col);
          }
        }
      }
    };
    const lc = [190, 18, 64, 255];
    letter(164, 316, "W", 14, lc);
    letter(232, 268, "R", 14, lc);
    letter(300, 220, "S", 14, lc);
    sheen(c, 0.07);
    innerRing(c);
  },
};

// ── Write ────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, draw] of Object.entries(logos)) {
  const c = new Canvas();
  draw(c);
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), encodePNG(SIZE, c.data));
  console.log("wrote", path.join(OUT_DIR, `${name}.png`));
}
