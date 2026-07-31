'use strict';

const crypto = require('crypto');
const pool = require('../config/database');
const GameRegistry = require('../modules/game/engine');
const { MatchManager, MATCH_STATES } = require('../modules/game/engine/MatchManager');
const EventStore = require('../modules/game/engine/EventStore');
const TimerEngine = require('../modules/game/engine/TimerEngine');

// ─── Standardized Protocol Events ────────────────────────────────────────────
const EVENTS = {
  // Inbound (Client → Server)
  JOIN: 'JOIN',
  LEAVE: 'LEAVE',
  READY: 'READY',
  MOVE: 'MOVE',
  PING: 'PING',

  // Outbound (Server → Client)
  CONNECT_ACK: 'CONNECT',
  START: 'START',
  STATE: 'STATE',
  SYNC: 'SYNC',
  PONG: 'PONG',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  GAME_OVER: 'GAME_OVER',
  ERROR: 'ERROR',
};

// Reconnect grace window (ms)
const RECONNECT_TIMEOUT_MS = 60 * 1000;
// Turn timeout (ms) for turn-based games
const TURN_TIMEOUT_MS = 60 * 1000;

const setupGameSocket = (io) => {
  const gameNs = io.of('/game-engine');

  // ─── Auth Middleware ─────────────────────────────────────────────────────
  gameNs.use(async (socket, next) => {
    const { matchId, userId, token } = socket.handshake.auth;
    if (!matchId || !userId || !token) {
      return next(new Error('Authentication required: matchId, userId, token'));
    }

    try {
      // Validate the user's match token AND fetch all players in this match
      const { rows } = await pool.query(
        `SELECT mm.user_id, mm.ws_token, mm.player_color, g.slug as game_slug, gm.metadata as match_metadata, gm.mode as match_mode
         FROM match_members mm
         JOIN game_matches gm ON mm.match_id = gm.id
         JOIN game g ON gm.game_id = g.id
         WHERE mm.match_id = $1`,
        [matchId]
      );

      // Confirm this user's token is valid
      const myRow = rows.find(r => r.user_id === userId && r.ws_token === token);
      if (!myRow) return next(new Error('Invalid match credentials'));

      socket.matchId = matchId;
      socket.userId = userId;
      socket.gameSlug = myRow.game_slug;
      socket.matchPlayers = rows.map(r => ({ userId: r.user_id, color: r.player_color }));
      socket.matchMetadata = myRow.match_metadata || {};
      socket.matchMode = (myRow.match_mode || 'QUICK').toUpperCase();

      next();
    } catch (e) {
      next(new Error('Auth verification failed'));
    }
  });

  // ─── Connection Handler ──────────────────────────────────────────────────
  gameNs.on('connection', async (socket) => {
    const { matchId, userId, gameSlug } = socket;
    const matchRoom = `match:${matchId}`;

    socket.join(matchRoom);
    console.info(`[GameEngine] ${userId} connected to match ${matchId} (${gameSlug})`);

    // Load or initialize match state via the generic engine
    let state;
    try {
      const isBotMode = socket.matchMode === 'BOT' || socket.matchMetadata?.mode === 'BOT' || socket.matchMetadata?.mode === 'bot';
      const players = [...(socket.matchPlayers || [])];
      if (isBotMode && !players.find(p => p.userId.startsWith('bot_'))) {
        players.push({ userId: `bot_${matchId}`, color: 'black' });
      }

      const result = await MatchManager.loadOrInitializeMatch(matchId, gameSlug, {
        players,
        maxPlayers: isBotMode ? 2 : players.length || 2,
        matchMetadata: socket.matchMetadata,
      });
      state = result.state;
    } catch (e) {
      socket.emit(EVENTS.ERROR, { message: `Failed to load match: ${e.message}` });
      return socket.disconnect();
    }

    if (state.status === MATCH_STATES.PAUSED) {
      const pausedAt = state.pausedAt || Date.now() - RECONNECT_TIMEOUT_MS; // assume expired if missing
      if (Date.now() - pausedAt >= RECONNECT_TIMEOUT_MS) {
        state.status = MATCH_STATES.FINISHED;
        state.winner = 'opponent';
        await EventStore.saveMatchSnapshot(matchId, state);
        await _archiveMatch(matchId, state);
        socket.emit(EVENTS.GAME_OVER, { state, reason: 'forfeit', forfeitedBy: 'opponent' });
        return socket.disconnect();
      }
    }

    // ── Send CONNECT_ACK with current state snapshot ───────────────────
    socket.emit(EVENTS.CONNECT_ACK, {
      matchId,
      gameSlug,
      state,
      status: state.status || MATCH_STATES.WAITING,
    });

    // ── Cancel any active reconnect timer for this player ──────────────
    TimerEngine.clearTimer(matchId, `reconnect:${userId}`);

    // ── PING / PONG ─────────────────────────────────────────────────────
    socket.on(EVENTS.PING, () => {
      socket.emit(EVENTS.PONG, { ts: Date.now() });
    });

    // ── READY ───────────────────────────────────────────────────────────
    socket.on(EVENTS.READY, async () => {
      try {
        let snap = await EventStore.loadMatchSnapshot(matchId);
        if (!snap) snap = state;

        if (!snap.readyPlayers) snap.readyPlayers = [];
        if (!snap.readyPlayers.includes(userId)) snap.readyPlayers.push(userId);

        // BOT MATCH: if match mode is BOT, only 1 real player needed
        const isBotMatch = socket.matchMode === 'BOT' || socket.matchMetadata?.mode === 'BOT' || socket.matchMetadata?.mode === 'bot';
        const totalPlayers = (socket.matchPlayers && socket.matchPlayers.length > 0) ? socket.matchPlayers.length : 2;
        // For bot match or solo match, we need 1 real player ready; for others, need all
        const requiredReady = (isBotMatch || totalPlayers === 1) ? 1 : totalPlayers;
        const allReady = snap.readyPlayers.length >= requiredReady;

        if (allReady && snap.status !== MATCH_STATES.ACTIVE) {
          snap.status = MATCH_STATES.ACTIVE;
          snap.startedAt = Date.now();
          snap.isBotMatch = isBotMatch;
          await EventStore.saveMatchSnapshot(matchId, snap);
          await EventStore.appendEvent(matchId, { type: 'GAME_START' });

          // Send player-specific start state
          const sockets = await gameNs.in(matchRoom).fetchSockets();
          for (const s of sockets) {
            const playerState = _getPlayerState(gameSlug, snap, s.userId);
            s.emit(EVENTS.START, { state: playerState, startedAt: snap.startedAt });
          }

          // For bot match: schedule bot actions
          if (isBotMatch) {
            _scheduleBotAction(gameNs, matchId, gameSlug, snap);
          }
          _startTurnTimer(gameNs, matchId, gameSlug, snap);
        } else {
          await EventStore.saveMatchSnapshot(matchId, snap);
          gameNs.to(matchRoom).emit(EVENTS.STATE, { state: snap });
        }
      } catch (e) {
        socket.emit(EVENTS.ERROR, { message: e.message });
      }
    });

    // ── MOVE ────────────────────────────────────────────────────────────
    socket.on(EVENTS.MOVE, async (moveData) => {
      try {
        // Scribble STROKE events: just broadcast, don't mutate state
        if (moveData.type === 'STROKE_CHUNK' || moveData.type === 'STROKE_END' || moveData.type === 'CLEAR') {
          socket.to(matchRoom).emit(EVENTS.SYNC, { type: moveData.type, ...moveData, userId });
          return;
        }

        // Remap Scribble guess: frontend sends { type:'GUESS', text } but plugin expects { type:'GUESS', word }
        if (moveData.type === 'GUESS' && moveData.text && !moveData.word) {
          moveData.word = moveData.text;
        }

        const updatedState = await MatchManager.handlePlayerMove(
          matchId,
          gameSlug,
          userId,
          moveData,
        );

        if (updatedState.status === MATCH_STATES.FINISHED) {
          TimerEngine.clearAllTimers(matchId);
          gameNs.to(matchRoom).emit(EVENTS.GAME_OVER, {
            state: updatedState,
            winner: updatedState.pluginState?.winner || null,
          });
          await _archiveMatch(matchId, updatedState);
        } else {
          // Send player-specific states (e.g. scribble drawer sees word)
          const sockets = await gameNs.in(matchRoom).fetchSockets();
          for (const s of sockets) {
            const ps = _getPlayerState(gameSlug, updatedState, s.userId);
            s.emit(EVENTS.SYNC, {
              state: ps.pluginState,
              valid: true,
              moveType: moveData.type,
              userId,
            });
          }
          _startTurnTimer(gameNs, matchId, gameSlug, updatedState);
        }
      } catch (e) {
        socket.emit(EVENTS.ERROR, { message: e.message });
      }
    });

    // ── LEAVE ───────────────────────────────────────────────────────────
    socket.on(EVENTS.LEAVE, async () => {
      await _handleDisconnect(gameNs, socket, matchRoom);
    });

    // ── Disconnect ──────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.info(`[GameEngine] ${userId} disconnected from ${matchId}: ${reason}`);
      await _handleDisconnect(gameNs, socket, matchRoom);
    });
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  async function _handleDisconnect(ns, socket, matchRoom) {
    const { matchId, userId, gameSlug } = socket;

    // Pause the game briefly and give the player a reconnect window
    const state = await EventStore.loadMatchSnapshot(matchId);
    if (state && state.status === MATCH_STATES.ACTIVE) {
      state.status = MATCH_STATES.PAUSED;
      state.pausedAt = Date.now();
      if (state.readyPlayers) {
        state.readyPlayers = state.readyPlayers.filter(id => id !== userId);
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      ns.to(matchRoom).emit(EVENTS.PAUSE, {
        reason: 'player_disconnected',
        userId,
        reconnectWindowMs: RECONNECT_TIMEOUT_MS,
      });
    }

    // Set reconnect timeout — forfeit if player doesn't return
    TimerEngine.startTimer(matchId, `reconnect:${userId}`, RECONNECT_TIMEOUT_MS, async () => {
      const latestState = await EventStore.loadMatchSnapshot(matchId);
      if (!latestState || latestState.status !== MATCH_STATES.PAUSED) return;

      latestState.status = MATCH_STATES.FINISHED;
      latestState.winner = 'opponent'; // forfeit
      await EventStore.saveMatchSnapshot(matchId, latestState);
      await EventStore.appendEvent(matchId, { type: 'FORFEIT', userId });

      ns.to(matchRoom).emit(EVENTS.GAME_OVER, {
        state: latestState,
        reason: 'forfeit',
        forfeitedBy: userId,
      });

      await _archiveMatch(matchId, latestState);
    });
  }

  function _startTurnTimer(ns, matchId, gameSlug, state) {
    const turnBasedSlugs = ['chess', 'ludo', 'snake-ladder'];
    if (turnBasedSlugs.includes(gameSlug)) {
      const currentPlayerId =
        state.pluginState?.turnOrder?.[state.pluginState?.currentTurnIndex];
      if (!currentPlayerId) return;

      TimerEngine.clearAllTimers(matchId);

      if (currentPlayerId.startsWith('bot_')) {
        _scheduleBotAction(ns, matchId, gameSlug, state);
        return;
      }

      let timerDuration = TURN_TIMEOUT_MS;
      if (gameSlug === 'chess') {
        const turnColor = state.pluginState.turn;
        timerDuration = state.pluginState.timers?.[turnColor] ?? 600000;
        
        // Reset lastMoveTime on turn start if this is a fresh reconnect/start
        if (!state.pluginState.lastMoveTime) {
          state.pluginState.lastMoveTime = Date.now();
          EventStore.saveMatchSnapshot(matchId, state);
        }
      }

      TimerEngine.startTimer(matchId, 'turn', timerDuration, async () => {
        const latestState = await EventStore.loadMatchSnapshot(matchId);
        if (!latestState || latestState.status !== MATCH_STATES.ACTIVE) return;

        await EventStore.appendEvent(matchId, { type: 'TURN_TIMEOUT', userId: currentPlayerId });

        if (gameSlug === 'chess') {
          // In chess, timeout means instant loss
          latestState.status = MATCH_STATES.FINISHED;
          latestState.winner = latestState.pluginState?.turnOrder?.find((id) => id !== currentPlayerId);
          if (latestState.pluginState) {
            latestState.pluginState.status = 'finished';
            latestState.pluginState.winner = latestState.winner;
            latestState.pluginState.drawReason = 'timeout';
            if (latestState.pluginState.timers) {
              const turnColor = latestState.pluginState.turn;
              latestState.pluginState.timers[turnColor] = 0;
            }
          }
        } else {
          // Normal skip logic for ludo/snake-ladder
          latestState.pluginState = {
            ...latestState.pluginState,
            currentTurnIndex:
              ((latestState.pluginState.currentTurnIndex || 0) + 1) %
              (latestState.pluginState.turnOrder?.length || 1),
          };
        }

        await EventStore.saveMatchSnapshot(matchId, latestState);

        ns.to(`match:${matchId}`).emit(EVENTS.SYNC, {
          state: latestState.pluginState,
          reason: 'turn_timeout',
          timedOutPlayer: currentPlayerId,
        });

        _startTurnTimer(ns, matchId, gameSlug, latestState);
      });
    } else if (gameSlug === 'scribble') {
      const ROUND_TIMEOUT_MS = 80000;
      TimerEngine.startTimer(matchId, 'round', ROUND_TIMEOUT_MS, async () => {
        const latestState = await EventStore.loadMatchSnapshot(matchId);
        if (!latestState || latestState.status !== MATCH_STATES.ACTIVE) return;

        const GameRegistry = require('../modules/game/engine/GameRegistry');
        const plugin = GameRegistry.createInstance(gameSlug, latestState.metadata);
        
        latestState.pluginState = plugin.advanceRound(latestState.pluginState);
        
        if (plugin.isFinished(latestState.pluginState)) {
          latestState.status = MATCH_STATES.FINISHED;
          TimerEngine.clearAllTimers(matchId);
          await EventStore.saveMatchSnapshot(matchId, latestState);
          ns.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
            state: latestState,
            winner: latestState.pluginState?.winner || null,
          });
          await _archiveMatch(matchId, latestState);
        } else {
          await EventStore.saveMatchSnapshot(matchId, latestState);
          
          const sockets = await ns.in(`match:${matchId}`).fetchSockets();
          for (const s of sockets) {
            const ps = _getPlayerState(gameSlug, latestState, s.userId);
            s.emit(EVENTS.SYNC, {
              state: ps.pluginState,
              reason: 'round_timeout',
            });
          }

          if (latestState.isBotMatch) {
            _scheduleBotAction(ns, matchId, gameSlug, latestState);
          }
          _startTurnTimer(ns, matchId, gameSlug, latestState);
        }
      });
    }
  }

  // ── Player-specific state helper ─────────────────────────────────────────
  function _getPlayerState(gameSlug, fullState, playerId) {
    // Scribble: drawer sees word, guessers see mask
    if (gameSlug === 'scribble' && fullState.pluginState) {
      const ps = fullState.pluginState;
      const drawer = ps.turnOrder?.[ps.currentDrawerIndex];
      if (playerId === drawer) {
        // Drawer state: include word, mask it for others
        const wordMask = ps.secretWord ? ps.secretWord.replace(/./g, '_') : null;
        return { ...fullState, pluginState: { ...ps, word: ps.secretWord, wordMask, drawerId: drawer } };
      } else {
        const wordMask = ps.secretWord ? ps.secretWord.split('').map((c, i) => {
          // Reveal letters as hints after 30s
          return '_';
        }).join(' ') : null;
        const { secretWord, ...safe } = ps;
        return { ...fullState, pluginState: { ...safe, wordMask, drawerId: drawer } };
      }
    }
    return fullState;
  }

  // ── Bot AI ───────────────────────────────────────────────────────────────
  async function _scheduleBotAction(ns, matchId, gameSlug, state) {
    const BOT_DELAY_MS = 2500 + Math.random() * 1500; // 2.5-4s human-like delay

    setTimeout(async () => {
      try {
        const latestState = await EventStore.loadMatchSnapshot(matchId);
        if (!latestState || latestState.status !== MATCH_STATES.ACTIVE) return;

        const ps = latestState.pluginState;
        let isBotTurn = false;
        let currentUserId = null;

        if (gameSlug === 'scribble') {
          const drawer = ps.turnOrder?.[ps.currentDrawerIndex];
          const sockets = await ns.in(`match:${matchId}`).fetchSockets();
          const connectedUserIds = new Set(sockets.map(s => s.userId));
          // Bot is the one not connected
          const botId = ps.turnOrder.find(id => !connectedUserIds.has(id));
          if (!botId) return;
          currentUserId = botId;
          isBotTurn = true; // Bot can always act in scribble (guess or draw)
        } else if (gameSlug === 'tap-rush' || gameSlug === 'memory-grid') {
          isBotTurn = true; // These games are concurrent, no turn order needed
        } else {
          const turnOrder = ps.turnOrder || [];
          currentUserId = turnOrder[ps.currentTurnIndex];
          const sockets = await ns.in(`match:${matchId}`).fetchSockets();
          const connectedUserIds = new Set(sockets.map(s => s.userId));
          isBotTurn = currentUserId && !connectedUserIds.has(currentUserId);
        }

        if (!isBotTurn) return; // Human's turn, don't interfere

        let botMove = null;

        if (gameSlug === 'snake-ladder' || gameSlug === 'ludo') {
          // Roll dice for bot
          const diceValue = Math.floor(Math.random() * 6) + 1;
          if (gameSlug === 'snake-ladder') {
            botMove = { type: 'ROLL', diceValue };
          } else {
            // Ludo: find first movable token or roll
            const botTokens = ps.tokens?.[currentUserId] || [];
            const movable = botTokens.filter(t => t.pos !== 57);
            if (movable.length > 0) {
              botMove = { diceValue, tokenId: movable[0].id };
            }
          }
        } else if (gameSlug === 'chess') {
          require('fs').appendFileSync('d:/Workspace/Unlox/code/taddle/debug.log', `[Bot] Checking chess bot turn...\n`);
          const { Chess } = require('chess.js');
          const chess = new Chess(ps.fen);
          require('fs').appendFileSync('d:/Workspace/Unlox/code/taddle/debug.log', `[Bot] FEN: ${ps.fen}\n`);
          const moves = chess.moves({ verbose: true });
          require('fs').appendFileSync('d:/Workspace/Unlox/code/taddle/debug.log', `[Bot] Valid moves: ${moves.length}\n`);
          if (moves.length > 0) {
            const randomMove = moves[Math.floor(Math.random() * moves.length)];
            botMove = { from: randomMove.from, to: randomMove.to };
            if (randomMove.promotion) {
              botMove.promotion = randomMove.promotion;
            }
            require('fs').appendFileSync('d:/Workspace/Unlox/code/taddle/debug.log', `[Bot] Chose move: ${JSON.stringify(botMove)}\n`);
          } else {
            return;
          }
        } else if (gameSlug === 'scribble') {
          const drawer = ps.turnOrder?.[ps.currentDrawerIndex];
          if (drawer === currentUserId) {
            // Bot is drawing: emit STROKE_CHUNK periodically
            let cx = 100, cy = 100;
            const drawInterval = setInterval(() => {
              if (!TimerEngine.timers[`${matchId}_round`]) {
                clearInterval(drawInterval);
                return;
              }
              cx += (Math.random() - 0.5) * 50;
              cy += (Math.random() - 0.5) * 50;
              ns.to(`match:${matchId}`).emit(EVENTS.SYNC, {
                type: 'STROKE_CHUNK',
                userId: currentUserId,
                points: [[cx, cy]],
                color: '#EF4444',
                width: 6,
              });
            }, 1000);
            return;
          } else {
            // Bot is guessing
            setTimeout(async () => {
              if (!TimerEngine.timers[`${matchId}_round`]) return;
              botMove = { type: 'GUESS', word: ps.secretWord };
              
              const GameRegistry = require('../modules/game/engine/GameRegistry');
              const updatedState = await MatchManager.handlePlayerMove(
                matchId, gameSlug, currentUserId, botMove
              );
              
              const sockets = await ns.in(`match:${matchId}`).fetchSockets();
              for (const s of sockets) {
                const pss = _getPlayerState(gameSlug, updatedState, s.userId);
                s.emit(EVENTS.SYNC, { state: pss.pluginState, valid: true });
              }
            }, 15000); // Guesses after 15 seconds
            return;
          }
        } else if (gameSlug === 'tap-rush') {
          const botId = Object.keys(ps.scores || {}).find(id => id.startsWith('bot_'));
          if (!botId) return;
          let tapCount = 0;
          const botInterval = setInterval(async () => {
            try {
              const st = await EventStore.loadMatchSnapshot(matchId);
              if (!st || st.status !== MATCH_STATES.ACTIVE) {
                clearInterval(botInterval);
                return;
              }
              if (tapCount >= 10) return;
              
              const updatedState = await MatchManager.handlePlayerMove(
                matchId, gameSlug, botId, { type: 'TAP', seq: tapCount, clientTs: Date.now() }
              );
              tapCount++;
              ns.to(`match:${matchId}`).emit(EVENTS.SYNC, { state: updatedState.pluginState, botMove: true });
            } catch (e) {
              // Ignore bot move errors
            }
          }, 1800);
          return;
        } else if (gameSlug === 'memory-grid') {
          const botId = Object.keys(ps.scores || {}).find(id => id.startsWith('bot_'));
          if (!botId) return;
          let roundCount = 0;
          const botInterval = setInterval(async () => {
            try {
              const st = await EventStore.loadMatchSnapshot(matchId);
              if (!st || st.status !== MATCH_STATES.ACTIVE) {
                clearInterval(botInterval);
                return;
              }
              if (roundCount >= 5) return;
              
              await MatchManager.handlePlayerMove(
                matchId, gameSlug, botId, { type: 'READY_INPUT' }
              );
              const latest = await EventStore.loadMatchSnapshot(matchId);
              const updatedState = await MatchManager.handlePlayerMove(
                matchId, gameSlug, botId, { type: 'INPUT', tiles: latest.pluginState.currentPattern || [] }
              );
              roundCount++;
              ns.to(`match:${matchId}`).emit(EVENTS.SYNC, { state: updatedState.pluginState, botMove: true });
            } catch (e) {
               // Ignore bot move errors
            }
          }, 4500);
          return;
        } else if (gameSlug === 'word-rush') {
          return; // Word Rush is single player vs clock, no bot turn
        }

        if (!botMove) return;

        // Apply bot move through MatchManager
        const GameRegistry = require('../modules/game/engine/GameRegistry');
        const updatedState = await MatchManager.handlePlayerMove(
          matchId, gameSlug, currentUserId, botMove
        );

        if (updatedState.status === MATCH_STATES.FINISHED) {
          TimerEngine.clearAllTimers(matchId);
          ns.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
            state: updatedState,
            winner: updatedState.pluginState?.winner || null,
          });
          await _archiveMatch(matchId, updatedState);
        } else {
          ns.to(`match:${matchId}`).emit(EVENTS.SYNC, { state: updatedState.pluginState, botMove: true });
          _startTurnTimer(ns, matchId, gameSlug, updatedState);
        }
      } catch (e) {
        require('fs').appendFileSync('d:/Workspace/Unlox/code/taddle/debug.log', `[Bot] Error executing bot move: ${e.message}\n${e.stack}\n`);
        console.error('[Bot] Error executing bot move:', e.message);
      }
    }, BOT_DELAY_MS);
  }

  async function _archiveMatch(matchId, finalState) {
    try {
      await pool.query(
        `UPDATE game_matches SET status = 'COMPLETED', metadata = metadata || $1, ended_at = NOW()
         WHERE id = $2`,
        [
          JSON.stringify({ 
            finalState,
            result: finalState.pluginState?.winner || 'DRAW'
          }),
          matchId,
        ]
      );
      // Clean up Redis after archiving
      await EventStore.cleanupMatch(matchId);
    } catch (e) {
      console.error('[GameEngine] Failed to archive match:', e.message);
    }
  }
};

module.exports = { setupGameSocket };
