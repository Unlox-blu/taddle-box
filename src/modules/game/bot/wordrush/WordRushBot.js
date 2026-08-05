const WORDS = require('../../engine/plugins/wordList.json');

// Grid is always 4×4 for word-rush
const ROWS = 4;
const COLS = 4;

/**
 * Find the first valid adjacent path (array of cell indices) that spells `word`
 * on the grid, or null if the word can't be traced. Matches the plugin's
 * adjacency + spelling validation exactly, so submissions are never rejected
 * for an invalid path.
 */
function findPath(grid, word) {
  const letters = word.split('');
  const first = letters[0];

  const dfs = (r, c, i, visited) => {
    if (i === letters.length) return [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const ni = nr * COLS + nc;
        if (visited[ni]) continue;
        if (grid[ni] !== letters[i]) continue;
        visited[ni] = true;
        const rest = dfs(nr, nc, i + 1, visited);
        if (rest) return [ni, ...rest];
        visited[ni] = false;
      }
    }
    return null;
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const start = r * COLS + c;
      if (grid[start] !== first) continue;
      const visited = new Array(ROWS * COLS).fill(false);
      visited[start] = true;
      const rest = dfs(r, c, 1, visited);
      if (rest) return [start, ...rest];
    }
  }
  return null;
}

/**
 * Collect words formable on this grid (3–8 letters) that nobody has found yet.
 * Returns [{ word, path }] — longest words first so the bot's difficulty tier
 * can pick the top fraction.
 */
function findCandidates(grid, foundWords) {
  const used = new Set((foundWords || []).map(fw => String(fw.word).toUpperCase()));
  const out = [];
  for (const raw of WORDS) {
    const w = raw.toUpperCase();
    if (w.length < 3 || w.length > 8) continue;
    if (used.has(w)) continue;
    const path = findPath(grid, w);
    if (path) out.push({ word: w, path });
    if (out.length >= 120) break; // plenty of options; keeps the sweep fast
  }
  // The word list is not length-ordered — sort so the difficulty tier below
  // can actually pick the highest-value (longest) fraction of the board.
  out.sort((a, b) => b.word.length - a.word.length);
  return out;
}

module.exports = {
  onMatchStart: (session, state) => {
    module.exports.onTurn(session, state);
  },
  onPause: (session) => {
    session.cleanup();
    session.scheduledRound = -1;
  },
  onResume: (session, state) => {
    module.exports.onTurn(session, state);
  },
  // Word Rush: schedule a handful of word submissions spread across the round.
  // Triggered at match start and after every human move (engine handleTurn).
  onTurn: (session, state) => {
    const ps = state.pluginState;
    if (!ps || !Array.isArray(ps.grid) || ps.status === 'finished') return;
    if (session.scheduledRound === ps.currentRound) return;
    session.scheduledRound = ps.currentRound;

    const candidates = findCandidates(ps.grid, ps.foundWords || []);
    if (candidates.length === 0) return;

    // Harder bots find more words. The percentile tier (Easy 20, Medium 60,
    // Hard 100) gates both the pool — the top (longest) fraction of the sorted
    // candidates — and the submission count, so an Easy bot hunts only a couple
    // of high-value words while a Hard bot sweeps most of the board.
    const tier = session.difficulty.wordRushPercentile || 50;
    const pool = candidates.slice(0, Math.max(2, Math.round((candidates.length * tier) / 100)));
    const wordCount = Math.max(2, Math.min(8, Math.round((8 * tier) / 100)));
    const words = pool.slice(0, wordCount);

    let delay = 2500 + session.random() * 2000;
    for (const { word, path } of words) {
      session.setTimeout(() => {
        session.submitMove({ type: 'SUBMIT_WORD', path, word });
      }, delay);
      delay += 4000 + session.random() * 6000;
    }
  }
};
