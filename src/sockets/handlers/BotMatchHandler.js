const BotManager = require('../../modules/game/bot/BotManager');
const { MatchManager, MATCH_STATES } = require('../../modules/game/engine/MatchManager');
const TimerEngine = require('../../modules/game/engine/TimerEngine');

class BotMatchHandler {
  constructor(ns, events, archiveMatchFn, startTurnTimerFn) {
    this.ns = ns;
    this.EVENTS = events;
    this.archiveMatch = archiveMatchFn;
    this.startTurnTimer = startTurnTimerFn;
    // Bounded re-drive guard: matchId -> consecutive rejected-move count.
    // Prevents an infinite catch → re-drive → reject loop if a bot move keeps
    // failing (e.g. engine fault). Reset on any successful move.
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

  /** All bot ids present in the match state (multi-bot lobbies) */
  getBotIds(state) {
    const ids = new Set();
    // state.players is the most reliable source — injected lobby bots always appear here
    (state?.players || []).forEach(p => {
      const id = p?.userId || p?.id;
      if (id && (p.isBot || String(id).startsWith('bot_'))) ids.add(id);
    });
    // Fallbacks for engine states that only track bots in plugin state
    const scores = state?.pluginState?.scores || {};
    Object.keys(scores).forEach(id => { if (String(id).startsWith('bot_')) ids.add(id); });
    (state?.pluginState?.turnOrder || []).forEach(id => { if (String(id).startsWith('bot_')) ids.add(id); });
    return Array.from(ids);
  }

  /** Assign a color the real players haven't taken (chess: w/b, ludo/snake-ladder: palettes) */
  _assignBotColor(socket, players) {
    const used = players.filter(p => !String(p.userId || '').startsWith('bot_')).map(p => p.color);
    const slug = socket.gameSlug;
    if (slug === 'chess') return used.includes('b') ? 'w' : 'b';
    if (slug === 'ludo') {
      const palette = ['red', 'green', 'yellow', 'blue'];
      return palette.find(c => !used.includes(c)) || palette[players.length % 4];
    }
    if (slug === 'snake-ladder') {
      const palette = ['red', 'blue', 'green', 'yellow'];
      return palette.find(c => !used.includes(c)) || palette[players.length % 4];
    }
    return 'blue';
  }

  async handleBotMoveGenerated(matchId, gameSlug, botId, botMove) {
    try {
      const updatedState = await MatchManager.handlePlayerMove(matchId, gameSlug, botId, botMove);
      // A move landed — reset the re-drive guard.
      this.reDriveCounts.delete(matchId);

      if (updatedState.status === MATCH_STATES.FINISHED) {
        await TimerEngine.clearAllTimers(matchId);
        this.ns.to(`match:${matchId}`).emit(this.EVENTS.GAME_OVER, {
          state: updatedState,
          winner: updatedState.pluginState?.winner || null,
        });
        BotManager.onMatchEnd(matchId, gameSlug, updatedState);
        await this.archiveMatch(matchId, updatedState);
      } else {
        if (botMove.type === 'STROKE_CHUNK') {
          this.ns
            .to(`match:${matchId}`)
            .emit(this.EVENTS.SYNC, { type: botMove.type, ...botMove, userId: botId });
        } else {
          this.ns
            .to(`match:${matchId}`)
            .emit(this.EVENTS.SYNC, { state: updatedState.pluginState, botMove: true });
          this.startTurnTimer(this.ns, matchId, gameSlug, updatedState);
          
          if (updatedState.isBotMatch) {
            const turnBasedSlugs = ['chess', 'ludo', 'snake-ladder'];
            if (!turnBasedSlugs.includes(gameSlug)) {
              this.handleTurn(matchId, gameSlug, updatedState);
            }
          }
        }
      }
    } catch (e) {
      console.error('[BotEngine] Error executing bot move:', e.message);
      // A rejected/stale move must never deadlock the match. Reload the freshest
      // state and re-drive the current player's turn so the game continues — but
      // only up to a bounded number of consecutive failures.
      const attempts = (this.reDriveCounts.get(matchId) || 0) + 1;
      if (attempts > this.MAX_RE_DRIVES) {
        this.reDriveCounts.delete(matchId);
        console.error(`[BotEngine] Giving up re-driving ${matchId} after ${attempts - 1} consecutive failures`);
        return;
      }
      this.reDriveCounts.set(matchId, attempts);
      try {
        const EventStore = require('../modules/game/engine/EventStore');
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

    // If a specific player's turn is being triggered, drive only that bot
    if (currentPlayerId) {
      if (!String(currentPlayerId).startsWith('bot_')) return;
      BotManager.onTurn(matchId, gameSlug, state, currentPlayerId, (bId, move) =>
        this.handleBotMoveGenerated(matchId, gameSlug, bId, move)
      );
      return;
    }

    // Otherwise determine whose turn it is and drive the bot if it's theirs
    const ps = state.pluginState || {};
    const current = ps.turnOrder ? ps.turnOrder[ps.currentTurnIndex] : null;
    if (current && String(current).startsWith('bot_')) {
      BotManager.onTurn(matchId, gameSlug, state, current, (bId, move) =>
        this.handleBotMoveGenerated(matchId, gameSlug, bId, move)
      );
      return;
    }

    // Fallback: drive all bots (realtime games without turns)
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
    // Inject lobby bots (AUTO/CUSTOM flow) so the engine treats them as players.
    // Bot matches are detected via the bot_ ID prefix / isBot flag — there is
    // no standalone BOT mode anymore, so no mode-based fallback is needed.
    const lobbyBots = Array.isArray(socket.lobbyBots) ? socket.lobbyBots : [];
    for (const bot of lobbyBots) {
      if (!players.find(p => String(p.userId) === String(bot.id))) {
        players.push({
          userId: bot.id,
          color: this._assignBotColor(socket, players),
          isBot: true,
        });
      }
    }

    return lobbyBots.length > 0;
  }
}

module.exports = BotMatchHandler;
