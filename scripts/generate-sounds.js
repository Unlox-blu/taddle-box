/**
 * Generates the game sound-effect WAV files used by gameSound.ts.
 * Pure Node — no dependencies. Run:  node scripts/generate-sounds.js
 * Output: assets/sounds/{tick,go,turn,win,loss,tap,correct,error,hop}.wav
 */
const fs = require("fs");
const path = require("path");

const SR = 44100;
const OUT_DIR = path.join(__dirname, "..", "assets", "sounds");

function writeWav(fileName, samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, fileName), buf);
  console.log("wrote", path.join(OUT_DIR, fileName));
}

/**
 * Synthesize a tone with attack/decay envelope.
 * harmonics: [[mult, gain], ...] e.g. [[2, 0.3]] adds an octave overtone.
 */
function tone(freq, durationMs, { volume = 0.5, attack = 0.005, decay = 0.08, harmonics = [] } = {}) {
  const n = Math.floor((SR * durationMs) / 1000);
  const out = new Float32Array(n);
  const att = Math.max(1, Math.floor(SR * attack));
  const dec = Math.max(1, Math.floor(SR * decay));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = Math.sin(2 * Math.PI * freq * t);
    for (const [mult, gain] of harmonics) {
      v += gain * Math.sin(2 * Math.PI * freq * mult * t);
    }
    let env = 1;
    if (i < att) env = i / att;
    const fromEnd = n - i;
    if (fromEnd < dec) env = Math.min(env, fromEnd / dec);
    out[i] = v * env * volume;
  }
  return out;
}

/** Low, buzzy square-ish tone for error feedback. */
function buzz(freq, durationMs, { volume = 0.35, decay = 0.12 } = {}) {
  const n = Math.floor((SR * durationMs) / 1000);
  const out = new Float32Array(n);
  const dec = Math.max(1, Math.floor(SR * decay));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const sq = Math.sign(Math.sin(2 * Math.PI * freq * t));
    const v = sq * 0.6 + 0.4 * Math.sin(2 * Math.PI * freq * 2 * t);
    let env = 1;
    const fromEnd = n - i;
    if (fromEnd < dec) env = fromEnd / dec;
    out[i] = v * env * volume * 0.8;
  }
  return out;
}

function concat(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function silence(ms) {
  return new Float32Array(Math.floor((SR * ms) / 1000));
}

// ── Sound definitions ───────────────────────────────────────────────────────
const sounds = {
  // Short high tick for each countdown number
  tick: tone(880, 90, { volume: 0.5, decay: 0.05, harmonics: [[2, 0.35]] }),
  // Rising two-tone for GO!
  go: concat(
    tone(660, 110, { volume: 0.5, decay: 0.05 }),
    tone(990, 220, { volume: 0.55, decay: 0.12, harmonics: [[2, 0.3]] }),
  ),
  // Neutral blip for "your turn"
  turn: tone(660, 150, { volume: 0.45, decay: 0.08, harmonics: [[1.5, 0.25]] }),
  // Ascending arpeggio: C5 E5 G5 C6
  win: concat(
    tone(523.25, 130, { volume: 0.45, decay: 0.06 }),
    tone(659.25, 130, { volume: 0.45, decay: 0.06 }),
    tone(783.99, 130, { volume: 0.45, decay: 0.06 }),
    tone(1046.5, 360, { volume: 0.55, decay: 0.18, harmonics: [[2, 0.3]] }),
  ),
  // Descending: G4 E4 C4
  loss: concat(
    tone(392, 170, { volume: 0.45, decay: 0.09 }),
    tone(329.63, 170, { volume: 0.45, decay: 0.09 }),
    tone(261.63, 340, { volume: 0.5, decay: 0.16 }),
  ),
  // Quick pop for taps / dice
  tap: tone(320, 55, { volume: 0.5, decay: 0.02, harmonics: [[2, 0.4]] }),
  // Happy two-note ding for correct word / pattern
  correct: concat(
    tone(659.25, 110, { volume: 0.45, decay: 0.05 }),
    tone(1046.5, 240, { volume: 0.5, decay: 0.14, harmonics: [[2, 0.25]] }),
  ),
  // Low buzz for invalid word / wrong move
  error: buzz(150, 210, { volume: 0.35, decay: 0.14 }),
  // Bouncy two-note hop for a coin starting its walk (D5 → A5 chirp)
  hop: concat(
    tone(587.33, 60, { volume: 0.38, decay: 0.03, harmonics: [[2, 0.25]] }),
    tone(880, 90, { volume: 0.4, decay: 0.06, harmonics: [[2, 0.3]] }),
  ),
};

for (const [name, samples] of Object.entries(sounds)) {
  writeWav(`${name}.wav`, samples);
}
