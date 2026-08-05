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
  client.on('error', err => console.error('Abandoned matches client error:', err));
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

          // Record the forfeit win in match history so abandoned PVP matches
          // still appear in the player's history (mode is normalized on write).
          await gameRepository.recordMatchHistory({
            userId: session.user_id,
            gameId: session.game_id,
            mode: session.metadata?.mode,
            result: 'WIN',
            score: myScore,
            duration: 60,
            xpEarned: myXp,
            matchGroupId
          });

          // Optionally emit WebSocket event to the winning user
          const { emitNotification } = require('../../sockets/notification.socket');
          emitNotification(session.user_id, {
            type: 'MATCH_RESOLVED',
            title: 'Match Resolved',
            message: 'Your opponent forfeited. You won!',
            payload: { matchId: matchGroupId, result: 'WIN', score: myScore, xpEarned: myXp }
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

        // Tournament scoring: a forfeit win counts as a win on the entry.
        // Runs AFTER the transaction commits (separate connection) so a
        // rollback can never leave an orphaned entry update.
        await gameRepository.recordTournamentEntryResult({
          matchGroupId, userId: session.user_id, isWin: true, xpEarned: myXp
        });
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

async function resolveExpiredLobbies() {
  const client = await pool.connect();
  try {
    // Find expired WAITING lobbies (no locks held — each lobby is processed on its own connection)
    const { rows: expiredLobbies } = await client.query(`
      SELECT id, host_user_id, settings FROM game_lobby
      WHERE status = 'WAITING' AND expires_at <= NOW()
    `);

    if (expiredLobbies.length > 0) {
      const { getIO } = require('../../sockets/index');
      const io = getIO();
      
      for (const lobby of expiredLobbies) {
        try {
          const lobbyMode = String(lobby.settings?.mode || 'AUTO').toUpperCase();
          let handled = false;

          // AUTO/PRACTICE queues: fill empty slots with bots so the match starts
          // and flows completely. fillMatchmakingLobby manages its own transaction
          // (FOR UPDATE + WAITING check), so no cross-connection lock waits occur here.
          if (lobbyMode === 'AUTO' || lobbyMode === 'PRACTICE') {
            try {
              const ticketCount = await client.query(
                `SELECT COUNT(*)::int AS c FROM game_matchmaking_ticket
                 WHERE lobby_id = $1 AND status = 'WAITING'`,
                [lobby.id]
              );
              if ((ticketCount.rows[0]?.c || 0) > 0) {
                const result = await gameRepository.fillMatchmakingLobby({
                  userId: lobby.host_user_id,
                  ticketId: null,
                  overrideLobbyId: lobby.id,
                  fillBots: true,
                });
                const realPlayers = (result?.players || []).filter(p => !p.isBot);
                // MATCHED (players present, or lobby already full/processed) means the
                // lobby is taken care of — don't mark it TIMED_OUT or notify timeouts.
                if (result && result.status === 'MATCHED') {
                  for (const p of realPlayers) {
                    io.to(`user:${p.id}`).emit('matchmaking:matched', result);
                  }
                  handled = true;
                }
              }
            } catch (fillErr) {
              console.error(`Failed to bot-fill expired lobby ${lobby.id}:`, fillErr.message);
            }
          }

          // CUSTOM lobbies (or lobbies still WAITING after a failed fill): mark TIMED_OUT and
          // notify remaining real players. The guarded UPDATE prevents notifying players of a
          // lobby that was matched by another process meanwhile.
          if (!handled) {
            const statusRes = await client.query(
              `UPDATE game_lobby SET status = 'TIMED_OUT', updated_at = NOW()
               WHERE id = $1 AND status = 'WAITING' RETURNING status`,
              [lobby.id]
            );
            if (statusRes.rows.length > 0) {
              const lobbyData = await gameRepository.getLobby({ userId: lobby.host_user_id, lobbyId: lobby.id });
              for (const p of lobbyData.players) {
                if (!p.isBot) {
                  io.to(`user:${p.id}`).emit('matchmaking:timedOut', lobbyData);
                }
              }
            }
          }
        } catch (err) {
          console.error(`Failed to emit timeout event for lobby ${lobby.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Error sweeping expired lobbies', err);
  } finally {
    client.release();
  }
}

/**
 * Gradual bot-fill for matchmaking lobbies (AUTO/PRACTICE + queued CUSTOM).
 *
 * During the 30s matchmaking window, real players get the first 15s to join.
 * After that, any still-open slot is filled ONE bot at a time (paced 2.5–5s
 * apart, like real players trickling in). Each bot join emits
 * `matchmaking:lobbyUpdated` so the lobby UI shows them appearing gradually;
 * once the lobby is full, the match is created and `matchmaking:matched` is
 * emitted to every real player.
 *
 * Runs every 2.5s alongside resolveExpiredLobbies, which remains the 30s
 * expiry backstop for lobbies that somehow never filled.
 *
 * CUSTOM lobbies are NEVER auto-filled while sitting on the manual lobby
 * screen — the host controls that screen (Add Bot / invites only). They are
 * only filled once the host explicitly queues them via "Auto Match & Proceed"
 * (POST /lobbies/:id/queue, which stamps settings.matchmakingQueuedAt); the
 * 15s real-player window starts at that moment, mirroring the AUTO queue.
 *
 * A short pending-invite grace is kept: if the host queued while fresh invites
 * are still out, bots hold off briefly so the invited friends (who are NOT yet
 * onboarded) get a chance to accept before their seats are taken.
 */
const REAL_PLAYER_WINDOW_MS = 15 * 1000;
const PENDING_INVITE_GRACE_MS = 30 * 1000;

async function resolveBotFillingLobbies() {
  const client = await pool.connect();
  try {
    const nowMs = Date.now();
    // The 15s real-player window is enforced IN SQL so unqueued CUSTOM lobbies
    // and young AUTO lobbies never consume the LIMIT batch — eligible lobbies
    // can't be starved behind ineligible rows on a busy server.
    //   AUTO/null: window starts at lobby creation.
    //   CUSTOM:    only when the host explicitly queued it (matchmakingQueuedAt).
    const { rows: fillableLobbies } = await client.query(`
      SELECT id, host_user_id, max_players, settings, created_at
      FROM game_lobby
      WHERE status = 'WAITING'
        AND current_players < max_players
        AND (
          -- PRACTICE is solo-vs-bots: no real players will ever join, so bots
          -- start joining IMMEDIATELY (no 15s real-player window).
          (
            settings->>'mode' = 'PRACTICE'
          )
          OR
          (
            (settings->>'mode' IS NULL OR settings->>'mode' = 'AUTO')
            AND created_at <= NOW() - INTERVAL '15 seconds'
          )
          OR
          (
            settings->>'mode' = 'CUSTOM'
            AND settings->>'matchmakingQueuedAt' IS NOT NULL
            AND to_timestamp((settings->>'matchmakingQueuedAt')::bigint / 1000)
                <= NOW() - INTERVAL '15 seconds'
          )
        )
        AND EXISTS (
          SELECT 1 FROM game_matchmaking_ticket t
          WHERE t.lobby_id = game_lobby.id AND t.status = 'WAITING'
        )
      ORDER BY created_at ASC
      LIMIT 50
    `);

    if (fillableLobbies.length === 0) return;

    const { getIO } = require('../../sockets/index');
    const io = getIO();

    for (const lobby of fillableLobbies) {
      try {
        const mode = String(lobby.settings?.mode || 'AUTO').toUpperCase();

        // PRACTICE lobbies: bots join immediately — no real-player window at
        // all (a practice run is always solo vs bots).
        // AUTO lobbies: the 15s real-player window starts at lobby creation.
        // CUSTOM lobbies: only fill when the host explicitly queued the lobby;
        // the 15s window starts at matchmakingQueuedAt. An unqueued CUSTOM
        // lobby sitting on the manual lobby screen is never auto-filled.
        if (mode === 'PRACTICE') {
          // no window — bots start filling right away (still paced by
          // botFillNextAt so they trickle in one at a time)
        } else {
          let windowStartMs;
          if (mode === 'CUSTOM') {
            const queuedAt = Number(lobby.settings?.matchmakingQueuedAt) || 0;
            if (!queuedAt) continue;
            windowStartMs = queuedAt;
          } else {
            windowStartMs = new Date(lobby.created_at).getTime();
          }
          if (nowMs - windowStartMs < REAL_PLAYER_WINDOW_MS) continue;
        }

        // Pending-invite grace: an invited friend is NOT in the lobby until they
        // accept. If fresh invites are still out, hold off so they aren't crowded
        // out by a bot taking their seat. (Queueing is still an opt-in to bot-fill,
        // so this only delays it for the grace window, never blocks it forever.)
        if (mode === 'CUSTOM' && Array.isArray(lobby.settings?.pendingInvites)) {
          const freshInvite = lobby.settings.pendingInvites.some(
            (inv) => inv.invitedAt && nowMs - new Date(inv.invitedAt).getTime() < PENDING_INVITE_GRACE_MS
          );
          if (freshInvite) continue;
        }

        // PRACTICE lobbies: no trickle — the user is solo vs bots, so fill
        // every open seat at once and start the match immediately. Waiting for
        // one bot per 2.5–5s sweep would look like a broken/stuck queue.
        if (mode === 'PRACTICE') {
          const result = await gameRepository.fillMatchmakingLobby({
            userId: lobby.host_user_id,
            ticketId: null,
            overrideLobbyId: lobby.id,
            fillBots: true,
          });
          if (result && result.status === 'MATCHED') {
            for (const p of (result.players || []).filter(x => !x.isBot)) {
              io.to(`user:${p.id}`).emit('matchmaking:matched', result);
            }
          }
          continue;
        }

        // Pacing gate (addOneBotToLobby re-checks inside its transaction too)
        const pacing = Number(lobby.settings?.botFillNextAt) || 0;
        if (pacing > nowMs) continue;

        const addRes = await gameRepository.addOneBotToLobby({ lobbyId: lobby.id });
        if (!addRes || !addRes.added) continue;

        // Emit lobby update so real players see this bot join gradually
        const lobbyData = await gameRepository.getLobby({ userId: lobby.host_user_id, lobbyId: lobby.id });
        const realPlayers = (lobbyData.players || []).filter(p => !p.isBot);
        const payload = {
          ...lobbyData,
          lobbyId: lobby.id,
          maxPlayers: lobbyData.settings?.targetPlayers || lobby.max_players,
          status: 'WAITING',
        };
        for (const p of realPlayers) {
          io.to(`user:${p.id}`).emit('matchmaking:lobbyUpdated', payload);
        }

        // Lobby is full now → create the match and notify everyone
        const targetMax = lobbyData.settings?.targetPlayers || lobby.max_players;
        if ((lobbyData.state?.currentPlayers || 0) >= targetMax) {
          const result = await gameRepository.fillMatchmakingLobby({
            userId: lobby.host_user_id,
            ticketId: null,
            overrideLobbyId: lobby.id,
            fillBots: true,
          });
          if (result && result.status === 'MATCHED') {
            for (const p of (result.players || []).filter(x => !x.isBot)) {
              io.to(`user:${p.id}`).emit('matchmaking:matched', result);
            }
          }
        }
      } catch (err) {
        console.error(`Failed gradual bot-fill for lobby ${lobby.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error sweeping bot-fill lobbies', err);
  } finally {
    client.release();
  }
}

async function resolveTournaments() {
  const client = await pool.connect();
  client.on('error', err => console.error('Tournaments client error:', err));
  try {
    const { rows: endedTournaments } = await client.query(`
      SELECT * FROM ${gameModel.GAME_TOURNAMENT_TABLE}
      WHERE status = 'ACTIVE' AND ends_at <= NOW()
    `);
    
    // Roll UPCOMING tournaments into ACTIVE the moment their start window opens
    // (respect starts_at). Runs on the same client before resolving ended ones.
    await client.query(`
      UPDATE ${gameModel.GAME_TOURNAMENT_TABLE}
      SET status = 'ACTIVE', updated_at = NOW()
      WHERE status = 'UPCOMING' AND starts_at <= NOW()
    `);

    if (!endedTournaments.length) return;

    for (const t of endedTournaments) {
      await client.query('BEGIN');
      try {
        await client.query(`UPDATE ${gameModel.GAME_TOURNAMENT_TABLE} SET status = 'COMPLETED' WHERE id = $1`, [t.id]);
        
        const { rows: entries } = await client.query(`
          SELECT user_id, score AS best_score
          FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE}
          WHERE tournament_id = $1 AND status <> 'CANCELLED'
          ORDER BY score DESC NULLS LAST, updated_at ASC, user_id ASC
          LIMIT 3
        `, [t.id]);
        
        if (entries.length > 0 && t.prize_xp > 0) {
          // Payout split: 1st = 100% of the prize, 2nd = 50%, 3rd = 25%.
          // Only players who actually scored (won at least one match) are paid.
          const placements = [
            { entry: entries[0], ratio: 1,    place: '1st', icon: '🏆', title: 'Tournament Winner!' },
            { entry: entries[1], ratio: 0.5,  place: '2nd', icon: '🥈', title: 'Tournament Runner-Up!' },
            { entry: entries[2], ratio: 0.25, place: '3rd', icon: '🥉', title: 'Tournament 3rd Place!' },
          ];
          // source_type is VARCHAR(50) — use short UUID prefix to stay within limit
          const shortId = t.id.replace(/-/g, '').slice(0, 12);
          const { emitNotification } = require('../../sockets/notification.socket');
          for (const { entry, ratio, place, icon, title } of placements) {
            if (!entry || !entry.user_id || !entry.best_score || entry.best_score <= 0) continue;
            const reward = Math.floor(t.prize_xp * ratio);
            if (reward <= 0) continue;
            await xpService.creditXP({
              userId: entry.user_id,
              xp: reward,
              transactionType: 'earned',
              sourceType: `tourney_win_${shortId}`   // 12 + 12 = 24 chars, well within 50
            });
            emitNotification(entry.user_id, {
              type: 'TOURNAMENT_WIN',
              title: `${title} ${icon}`,
              message: `You finished ${place} in ${t.title} and earned ${reward} XP!`,
              payload: { tournamentId: t.id, reward, place }
            });
          }
        }
        
        // Auto-reset recurring tournaments
        if (t.metadata && t.metadata.type === 'recurring') {
           await client.query(`
              INSERT INTO ${gameModel.GAME_TOURNAMENT_TABLE} (
                  game_id, title, description, entry_fee_xp, prize_xp, 
                  max_players, starts_at, ends_at, status, metadata
              )
              VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW() + INTERVAL '24 hours', 'ACTIVE', $7)
           `, [
              t.game_id, t.title, t.description, t.entry_fee_xp, t.prize_xp, 
              t.max_players, JSON.stringify(t.metadata)
           ]);
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
  resolveTournaments,
  resolveExpiredLobbies,
  resolveBotFillingLobbies
};
