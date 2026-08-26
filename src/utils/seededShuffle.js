'use strict';

/**
 * Seeded Fisher-Yates shuffle.
 *
 * Returns a NEW array — the original is never mutated.
 * Uses `seedrandom` (already a project dependency) so the same seed
 * always produces the same order, making replays deterministic.
 *
 * @param {Array}  arr  Items to shuffle.
 * @param {string} seed  Deterministic seed (e.g. matchGroupId + round number).
 * @returns {Array}      Shuffled copy.
 */
function seededShuffle(arr, seed) {
  const rng = require('seedrandom')(String(seed));
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

module.exports = { seededShuffle };
