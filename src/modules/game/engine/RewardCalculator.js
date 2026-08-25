'use strict';

/**
 * RewardCalculator — computes XP rewards from total entry fees collected.
 *
 * Architecture:
 *   1. Each player pays entryFee at match start (debitXP)
 *   2. At match end, totalPool = entryFee × numPlayers
 *   3. Rewards are split among winners based on rankings
 *   4. Backend returns a flexible reward structure
 *   5. Frontend auto-adopts to whatever the backend sends
 *
 * Ranking splits (configurable):
 *   Single winner:    100% of pool
 *   Top 2:            60% / 40%
 *   Top 3:            50% / 30% / 20%
 *   Top 4:            40% / 25% / 20% / 15%
 *   Draw (no winner): 100% refunded to each player
 *
 * The backend can override these defaults per game via metadata.rewardSplits.
 */

// Default ranking splits — percentage of total pool for each rank
const DEFAULT_RANK_SPLITS = {
  1: [100],                          // single winner
  2: [60, 40],                       // top 2
  3: [50, 30, 20],                   // top 3
  4: [40, 25, 20, 15],               // top 4
};

/**
 * Calculate rewards for a match based on player results and entry fees.
 *
 * @param {Object} options
 * @param {Array} options.players - Array of { userId, result, score, isBot }
 * @param {number} options.entryFee - XP entry fee per player
 * @param {Object} options.gameMetadata - Game metadata (may contain custom rewardSplits)
 * @param {boolean} options.isPractice - Practice mode (no rewards)
 *
 * @returns {Object} Reward structure
 *   {
 *     totalPool: number,          // total XP collected
 *     entryFee: number,           // per-player entry fee
 *     rankings: [                 // sorted by rank (best first)
 *       {
 *         userId: string,
 *         result: 'WIN' | 'LOSS' | 'DRAW',
 *         rank: number,           // 1, 2, 3, ...
 *         xpEarned: number,       // XP awarded to this player
 *         isBot: boolean,
 *       }
 *     ],
 *     drawRefund: number,         // if draw, refund per player
 *   }
 */
function calculateRewards({ players, entryFee, gameMetadata, isPractice }) {
  const totalPool = entryFee * players.filter(p => !p.isBot).length;

  // Practice mode: no rewards, entry fee is spent
  if (isPractice) {
    return {
      totalPool,
      entryFee,
      rankings: players.map((p, i) => ({
        userId: p.userId,
        result: p.result || 'LOSS',
        rank: i + 1,
        xpEarned: 0,
        isBot: !!p.isBot,
      })),
      drawRefund: 0,
    };
  }

  // Check if all results are DRAW
  const allDraw = players.every(p => p.result === 'DRAW');
  if (allDraw) {
    // Draw: refund entry fee to each human player
    return {
      totalPool,
      entryFee,
      rankings: players.map((p, i) => ({
        userId: p.userId,
        result: 'DRAW',
        rank: i + 1,
        xpEarned: p.isBot ? 0 : entryFee,
        isBot: !!p.isBot,
      })),
      drawRefund: entryFee,
    };
  }

  // Get ranking splits (custom from game metadata, or defaults)
  const customSplits = gameMetadata?.rewardSplits;
  const splits = customSplits || DEFAULT_RANK_SPLITS;

  // Separate winners/drawers from losers — only winners get ranked and paid
  const winners = players.filter(p => p.result === 'WIN' || p.result === 'DRAW');
  const losers = players.filter(p => p.result === 'LOSS');

  // Sort winners: WIN first, then by score descending, then DRAW
  const sortedWinners = [...winners].sort((a, b) => {
    const resultOrder = { WIN: 0, DRAW: 1 };
    const ra = resultOrder[a.result] ?? 1;
    const rb = resultOrder[b.result] ?? 1;
    if (ra !== rb) return ra - rb;
    return (b.score || 0) - (a.score || 0);
  });

  // Assign ranks to winners only (handle ties)
  let currentRank = 1;
  const rankedWinners = sortedWinners.map((p, i) => {
    if (i > 0) {
      const prev = sortedWinners[i - 1];
      if (p.result !== prev.result || (p.score || 0) !== (prev.score || 0)) {
        currentRank = i + 1;
      }
    }
    return { ...p, rank: currentRank };
  });

  // How many distinct winner ranks
  const distinctWinnerRanks = [...new Set(rankedWinners.map(p => p.rank))];
  const numRanks = distinctWinnerRanks.length;

  // Get split percentages for this number of winner ranks
  const splitKey = Math.min(numRanks, 4);
  const percentages = splits[splitKey] || splits[1] || [100];

  // Calculate XP for each winner rank
  const rankXp = {};
  distinctWinnerRanks.forEach((rank, i) => {
    const pct = (percentages[i] || 0) / 100;
    rankXp[rank] = Math.round(totalPool * pct);
  });

  // Build final rankings: winners get ranked XP, losers get 0
  const rankings = [];
  for (const p of rankedWinners) {
    let xpEarned = 0;
    if (p.isBot) {
      xpEarned = 0;
    } else if (p.result === 'WIN') {
      xpEarned = rankXp[p.rank] || 0;
    } else if (p.result === 'DRAW') {
      xpEarned = entryFee; // Draw = refund entry fee
    }
    rankings.push({ userId: p.userId, result: p.result, rank: p.rank, xpEarned, isBot: !!p.isBot });
  }
  // Losers: rank after all winners, 0 XP
  const loserRank = (rankedWinners.length || 0) + 1;
  for (const p of losers) {
    rankings.push({ userId: p.userId, result: 'LOSS', rank: loserRank, xpEarned: 0, isBot: !!p.isBot });
  }

  return {
    totalPool,
    entryFee,
    rankings,
    drawRefund: allDraw ? entryFee : 0,
  };
}

/**
 * Apply rewards — credit XP to each player based on the reward structure.
 * Call this after calculateRewards().
 *
 * @param {Object} options
 * @param {Object} options.reward - Output from calculateRewards()
 * @param {Object} options.xpSvc - XP service instance
 * @param {string} options.sessionId - Session ID for sourceType
 */
async function applyRewards({ reward, xpSvc, sessionId }) {
  if (!xpSvc) return;

  for (const entry of reward.rankings) {
    if (entry.xpEarned > 0 && !entry.isBot) {
      try {
        await xpSvc.creditXP({
          userId: entry.userId,
          xp: entry.xpEarned,
          transactionType: 'earned',
          sourceType: `game_reward_${sessionId}_${entry.rank}`,
        });
      } catch (err) {
        console.error(`[RewardCalculator] Failed to credit ${entry.xpEarned} XP to ${entry.userId}:`, err.message);
      }
    }
  }
}

module.exports = { calculateRewards, applyRewards, DEFAULT_RANK_SPLITS };
