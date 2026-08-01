const BotManager = require('../../modules/game/bot/BotManager');
const { MatchManager, MATCH_STATES } = require('../../modules/game/engine/MatchManager');
const TimerEngine = require('../../modules/game/engine/TimerEngine');

class BotMatchHandler {
  constructor(ns, events, archiveMatchFn, startTurnTimerFn) {
    this.ns = ns;
    this.EVENTS = events;
    this.archiveMatch = archiveMatchFn;
    this.startTurnTimer = startTurnTimerFn;
  }

  getBotId(matchId, state) {
    if (!state) return `bot_${matchId}`;
    return (
      Object.keys(state.pluginState?.scores || {}).find((id) => id.startsWith('bot_')) ||
      state.pluginState?.turnOrder?.find((id) => id.startsWith('bot_')) ||
      `bot_${matchId}`
    );
  }

  async handleBotMoveGenerated(matchId, gameSlug, botId, botMove) {
    try {
      const updatedState = await MatchManager.handlePlayerMove(matchId, gameSlug, botId, botMove);

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
    }
  }

  handleMatchStart(matchId, gameSlug, state) {
    if (!state || !state.isBotMatch) return;
    const botId = this.getBotId(matchId, state);
    BotManager.onMatchStart(matchId, gameSlug, state, botId, (bId, move) =>
      this.handleBotMoveGenerated(matchId, gameSlug, bId, move)
    );
  }

  handleTurn(matchId, gameSlug, state, currentPlayerId = null) {
    if (!state || !state.isBotMatch) return;
    const botId = this.getBotId(matchId, state);

    // If it's a specific player's turn trigger (e.g. from turn timeout or explicit turn check)
    // ensure it's actually the bot's turn
    if (currentPlayerId && currentPlayerId !== botId) return;

    BotManager.onTurn(matchId, gameSlug, state, botId, (bId, move) =>
      this.handleBotMoveGenerated(matchId, gameSlug, bId, move)
    );
  }

  handlePause(matchId, gameSlug, state) {
    if (!state || !state.isBotMatch) return;
    const botId = this.getBotId(matchId, state);
    BotManager.onPause(matchId, gameSlug, state, botId);
  }

  handleResume(matchId, gameSlug, state) {
    if (!state || !state.isBotMatch) return;
    const botId = this.getBotId(matchId, state);
    BotManager.onResume(matchId, gameSlug, state, botId);
  }

  handleMatchEnd(matchId, gameSlug, state) {
    const botId = this.getBotId(matchId, state);
    BotManager.onMatchEnd(matchId, gameSlug, state, botId);
  }

  setupBotPlayer(socket, players, matchId) {
    const isBotMode =
      socket.matchMode === 'BOT' ||
      socket.matchMetadata?.mode === 'BOT' ||
      socket.matchMetadata?.mode === 'bot';
    if (isBotMode && !players.find((p) => p.userId.startsWith('bot_'))) {
      players.push({ userId: `bot_${matchId}`, color: 'black' });
    }
    return isBotMode;
  }
}

module.exports = BotMatchHandler;
