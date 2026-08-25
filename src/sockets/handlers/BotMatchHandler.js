'use strict';

const BotManager = require('../../modules/game/bot/BotManager');
const { MatchManager, MATCH_STATES } = require('../../modules/game/engine/MatchManager');
const TimerEngine = require('../../modules/game/engine/TimerEngine');
const EventStore = require('../../modules/game/engine/EventStore');
const GameRegistry = require('../../modules/game/engine');

class BotMatchHandler {
  constructor(ns, events, archiveMatchFn, startTurnTimerFn) {
    this.ns = ns;
    this.EVENTS = events;
    this.archiveMatch = archiveMatchFn;
    this.startTurnTimer = startTurnTimerFn;
    this.reDriveCounts = new Map();
    this.MAX_RE_DRIVES = 3;
  }

  getBotId(matchId, state) {
    if (!state) return `bot_${matchId}`;
    return (
      Object.keys(state.pluginState?.scores || {}).find((id) => id.startsWith('bot_')) ||
      state.pluginState?.turnOrder?.find((id) => id.startsWith('bot_')) ||
      `bot_${matchId}`
    );
  }

  getBotIds(state) {
    const ids = new Set();
    (state?.players || []).forEach(p => {
      const id = p?.userId || p?.id;
      if (id && (p.isBot || String(id).startsWith('bot_'))) ids.add(id);
    });
    const scores = state?.pluginState?.scores || {};
    Object.keys(scores).forEach(id => { if (String(id).startsWith('bot_')) ids.add(id); });
    (state?.pluginState?.turnOrder || []).forEach(id => { if (String(id).startsWith('bot_')) ids.add(id); });
    return Array.from(ids);
  }

  _assignBotColor(socket, players) {
    const plugin = GameRegistry.createInstance(socket.gameSlug, {});
    return plugin.getBotColor(players);
  }

  async handleBotMoveGenerated(matchId, gameSlug, botId, botMove) {
    try {
      // Use the actor to process the bot's move
      const commandId = require('crypto').randomUUID();
      const updatedState = await MatchManager.handlePlayerMove(
        matchId, gameSlug, botId, botMove, commandId
      );
      this.reDriveCounts.delete(matchId);

      if (updatedState.status === MATCH_STATES.FINISHED) {
        await TimerEngine.clearAllTimers(matchId);
        this.ns.to(`match:${matchId}`).emit(this.EVENTS.GAME_OVER, {
          state: updatedState,
          winner: updatedState.pluginState?.winner || null,
        });
        BotManager.onMatchEnd(matchId, gameSlug, updatedState);
        await this.archiveMatch(matchId, updatedState);

        try {
          const { getIO } = require('../../sockets/index');
          const io = getIO();
          const matchPlayers = updatedState.metadata?.players || updatedState.players || [];
          for (const p of matchPlayers) {
            const pid = p?.userId || p?.id;
            if (pid && !String(pid).startsWith('bot_')) {
              io.to(`user:${pid}`).emit('SESSION_EXPIRED', { matchId });
            }
          }
        } catch (e) {
          console.error('[BotEngine] Failed to emit SESSION_EXPIRED:', e.message);
        }
      } else {
        if (botMove.type === 'STROKE_CHUNK') {
          this.ns
            .to(`match:${matchId}`)
            .emit(this.EVENTS.SYNC, { type: botMove.type, ...botMove, userId: botId });
        } else {
          this.ns
            .to(`match:${matchId}`)
            .emit(this.EVENTS.SYNC, { state: updatedState.pluginState, botMove: true });
          if (gameSlug !== 'scribble' && gameSlug !== 'word-rush') {
            this.startTurnTimer(this.ns, matchId, gameSlug, updatedState);
          }

          if (updatedState.isBotMatch) {
            const plugin = GameRegistry.createInstance(gameSlug, updatedState.metadata);
            if (!plugin.isTurnBased()) {
              this.handleTurn(matchId, gameSlug, updatedState);
            }
          }
        }
      }
    } catch (e) {
      console.error('[BotEngine] Error executing bot move:', e.message);
      const attempts = (this.reDriveCounts.get(matchId) || 0) + 1;
      if (attempts > this.MAX_RE_DRIVES) {
        this.reDriveCounts.delete(matchId);
        console.error(`[BotEngine] Giving up re-driving ${matchId} after ${attempts - 1} consecutive failures`);
        return;
      }
      this.reDriveCounts.set(matchId, attempts);
      try {
        const fresh = await EventStore.loadMatchSnapshot(matchId);
        if (!fresh || fresh.status !== MATCH_STATES.ACTIVE) return;
        this.startTurnTimer(this.ns, matchId, gameSlug, fresh);
      } catch (err) {
        console.error('[BotEngine] Failed to re-drive turn after rejected move:', err.message);
      }
    }
  }

  handleMatchStart(matchId, gameSlug, state) {
    if (!state || !state.isBotMatch) return;
    for (const botId of this.getBotIds(state)) {
      BotManager.onMatchStart(matchId, gameSlug, state, botId, (bId, move) =>
        this.handleBotMoveGenerated(matchId, gameSlug, bId, move)
      );
    }
  }

  handleTurn(matchId, gameSlug, state, currentPlayerId = null) {
    if (!state || !state.isBotMatch) return;

    if (currentPlayerId) {
      if (!String(currentPlayerId).startsWith('bot_')) return;
      BotManager.onTurn(matchId, gameSlug, state, currentPlayerId, (bId, move) =>
        this.handleBotMoveGenerated(matchId, gameSlug, bId, move)
      );
      return;
    }

    const ps = state.pluginState || {};
    const current = ps.turnOrder ? ps.turnOrder[ps.currentTurnIndex] : null;
    if (current && String(current).startsWith('bot_')) {
      BotManager.onTurn(matchId, gameSlug, state, current, (bId, move) =>
        this.handleBotMoveGenerated(matchId, gameSlug, bId, move)
      );
      return;
    }

    for (const botId of this.getBotIds(state)) {
      BotManager.onTurn(matchId, gameSlug, state, botId, (bId, move) =>
        this.handleBotMoveGenerated(matchId, gameSlug, bId, move)
      );
    }
  }

  handlePause(matchId, gameSlug, state) {
    if (!state || !state.isBotMatch) return;
    for (const botId of this.getBotIds(state)) {
      BotManager.onPause(matchId, gameSlug, state, botId);
    }
  }

  handleResume(matchId, gameSlug, state) {
    if (!state || !state.isBotMatch) return;
    for (const botId of this.getBotIds(state)) {
      BotManager.onResume(matchId, gameSlug, state, botId);
    }
  }

  handleMatchEnd(matchId, gameSlug, state) {
    for (const botId of this.getBotIds(state)) {
      BotManager.onMatchEnd(matchId, gameSlug, state, botId);
    }
  }

  setupBotPlayer(socket, players) {
    const lobbyBots = Array.isArray(socket.lobbyBots) ? socket.lobbyBots : [];
    for (const bot of lobbyBots) {
      if (!players.find(p => String(p.userId) === String(bot.id))) {
        players.push({
          userId: bot.id,
          color: this._assignBotColor(socket, players),
          isBot: true,
          name: bot.name || bot.username,
          username: bot.username,
          avatar: bot.avatar || null,
          level: bot.level,
          badge: bot.badge,
        });
      }
    }
    return lobbyBots.length > 0;
  }
}

module.exports = BotMatchHandler;
