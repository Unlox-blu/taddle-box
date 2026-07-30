'use strict';

const pool = require('../../config/database');
const gameModel = require('./game.model');
const GameService = require('./game.service');
const gameRepository = require('./game.repository');
const XpService = require('../xp/xp.service');
const xpRepository = require('../xp/xp.repository');

const xpService = new XpService({ xpRepository });
const gameService = new GameService({ gameRepository, xpService });

/**
 * Resolves PENDING game sessions that have been abandoned by the opponent.
 * Timeout window is 3 minutes from the session creation.
 */
async function resolveAbandonedMatches() {
  const client = await pool.connect();
  try {
    // Find all PENDING game sessions older than 3 minutes
    const { rows: pendingSessions } = await client.query(`
      SELECT gs.*, rl.validated_score
      FROM ${gameModel.GAME_SESSION_TABLE} gs
      LEFT JOIN reward_ledger rl ON rl.session_id = gs.id
      WHERE gs.status = 'PENDING'
      AND gs.started_at < NOW() - INTERVAL '3 minutes'
    `);

    if (!pendingSessions.length) return;

    for (const session of pendingSessions) {
      const matchGroupId = session.metadata?.matchGroupId;
      if (!matchGroupId) continue;

      await client.query('BEGIN');

      try {
        // The opponent has abandoned the match because they didn't submit a score in 3 minutes.
        // We resolve the match by declaring the current PENDING player the WINNER.
        const myScore = session.validated_score || 0;
        
        // Let's mark the session as COMPLETED
        await gameRepository.updateGameSessionStatus({
          sessionId: session.id, status: 'COMPLETED', completedAt: new Date().toISOString()
        });

        const game = await gameRepository.findGameById({ gameId: session.game_id });
        if (game) {
          const calculated = gameService.calculateResult({ game, score: myScore, duration: 60 });
          const myXp = calculated.xpEarned;

          // Update ledger
          await client.query(`
            UPDATE reward_ledger
            SET xp_awarded = $1
            WHERE session_id = $2
          `, [myXp, session.id]);

          // Credit XP
          if (myXp > 0) {
            await xpService.creditXP({
              userId: session.user_id, xp: myXp,
              transactionType: 'earned', sourceType: `game_session_${session.id}`
            });
          }
          
          // Optionally emit WebSocket event to the winning user
          const { emitNotification } = require('../../sockets/notification.socket');
          emitNotification(session.user_id, {
            type: 'MATCH_RESOLVED',
            title: 'Match Resolved',
            message: 'Your opponent forfeited. You won!',
            payload: { result: 'WIN', score: myScore, xpEarned: myXp }
          });
        }
        
        // Also cancel the opponent's active session if it exists
        await client.query(`
          UPDATE ${gameModel.GAME_SESSION_TABLE}
          SET status = 'CANCELLED'
          WHERE metadata->>'matchGroupId' = $1
          AND user_id <> $2
          AND status = 'ACTIVE'
        `, [matchGroupId, session.user_id]);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to resolve abandoned match', err);
      }
    }
  } catch (error) {
    console.error('Error sweeping abandoned matches', error);
  } finally {
    client.release();
  }
}

async function resolveTournaments() {
  const client = await pool.connect();
  try {
    const { rows: endedTournaments } = await client.query(`
      SELECT * FROM ${gameModel.GAME_TOURNAMENT_TABLE}
      WHERE status = 'ACTIVE' AND ends_at <= NOW()
    `);
    
    if (!endedTournaments.length) return;

    for (const t of endedTournaments) {
      await client.query('BEGIN');
      try {
        await client.query(`UPDATE ${gameModel.GAME_TOURNAMENT_TABLE} SET status = 'COMPLETED' WHERE id = $1`, [t.id]);
        
        const { rows: entries } = await client.query(`
          SELECT user_id, best_score 
          FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE}
          WHERE tournament_id = $1 AND status <> 'CANCELLED'
          ORDER BY best_score DESC NULLS LAST
          LIMIT 3
        `, [t.id]);
        
        if (entries.length > 0 && t.prize_xp > 0) {
          const reward = t.prize_xp;
          await xpService.creditXP({
            userId: entries[0].user_id,
            xp: reward,
            transactionType: 'earned',
            sourceType: `tournament_win_${t.id}`
          });
          
          const { emitNotification } = require('../../sockets/notification.socket');
          emitNotification(entries[0].user_id, {
            type: 'TOURNAMENT_WIN',
            title: 'Tournament Winner! 🏆',
            message: `You won 1st place in ${t.title} and earned ${reward} XP!`,
            payload: { tournamentId: t.id, reward }
          });
        }
        await client.query('COMMIT');
      } catch(e) {
        await client.query('ROLLBACK');
        console.error('Failed to resolve tournament', t.id, e);
      }
    }
  } catch (error) {
    console.error('Error resolving tournaments', error);
  } finally {
    client.release();
  }
}

module.exports = {
  resolveAbandonedMatches,
  resolveTournaments
};
