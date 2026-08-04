const BotRegistry = require('./BotRegistry');
const Easy = require('./difficulty/Easy');
const Medium = require('./difficulty/Medium');
const Hard = require('./difficulty/Hard');
const seedrandom = require('seedrandom');

const difficulties = { Easy, Medium, Hard };

// Maps each bot profile id (embedded in bot ids like bot_alpha_<hash>_<seat>)
// to its gameplay skill tier, matching the `difficulty` field on BOT_PROFILES
// in game.repository.js. Weak bots (bronze/silver) are Easy and make realistic
// mistakes; strong ones (diamond/master) are Hard and genuinely dominate.
const PROFILE_DIFFICULTY = {
  bot_001: 'Easy',
  bot_002: 'Easy',
  bot_003: 'Medium',
  bot_004: 'Medium',
  bot_005: 'Medium',
  bot_006: 'Medium',
  bot_007: 'Hard',
  bot_008: 'Hard',
};

const resolveBotDifficulty = (botId) => {
  const key = String(botId || '').split('_').slice(0, 2).join('_');
  return PROFILE_DIFFICULTY[key] || 'Medium';
};

class BotSession {
    constructor(matchId, gameSlug, botId, difficultyLevel, engineCallback) {
        this.matchId = matchId;
        this.gameSlug = gameSlug;
        this.botId = botId;
        this.difficulty = difficulties[difficultyLevel] || difficulties['Medium'];
        this.engineCallback = engineCallback;
        
        this.timers = new Set();
        this.intervals = new Set();
        
        // Seeded RNG for this session
        // Using matchId and botId to ensure deterministic but unique randomness per match
        this.rng = seedrandom(`${matchId}-${botId}`);
    }

    // Helper for bots to get a seeded random number
    random() {
        return this.rng();
    }

    setTimeout(fn, delay) {
        const id = setTimeout(() => {
            this.timers.delete(id);
            fn();
        }, delay);
        this.timers.add(id);
        return id;
    }

    clearTimeout(id) {
        clearTimeout(id);
        this.timers.delete(id);
    }

    setInterval(fn, delay) {
        const id = setInterval(fn, delay);
        this.intervals.add(id);
        return id;
    }

    clearInterval(id) {
        clearInterval(id);
        this.intervals.delete(id);
    }

    submitMove(move) {
        if (this.engineCallback) {
            this.engineCallback(this.botId, move);
        }
    }

    cleanup() {
        for (const id of this.timers) clearTimeout(id);
        for (const id of this.intervals) clearInterval(id);
        this.timers.clear();
        this.intervals.clear();
    }
}

class BotManager {
    constructor() {
        this.sessions = new Map(); // matchId -> map of botId -> BotSession
    }

    _getPlugin(gameSlug) {
        const entry = BotRegistry[gameSlug];
        return entry ? entry.plugin : null;
    }

    _getOrCreateSession(matchId, gameSlug, botId, engineCallback) {
        if (!this.sessions.has(matchId)) {
            this.sessions.set(matchId, new Map());
        }
        const matchSessions = this.sessions.get(matchId);
        
        if (!matchSessions.has(botId)) {
            // Difficulty is derived from the bot's profile id (its rating tier),
            // so a strong bot plays Hard and a weak one plays Easy.
            const session = new BotSession(matchId, gameSlug, botId, resolveBotDifficulty(botId), engineCallback);
            matchSessions.set(botId, session);
        }
        
        return matchSessions.get(botId);
    }

    _invokePlugin(gameSlug, method, session, state) {
        const plugin = this._getPlugin(gameSlug);
        if (plugin && typeof plugin[method] === 'function') {
            try {
                plugin[method](session, state);
            } catch (e) {
                console.error(`[BotManager] Error in ${gameSlug} bot ${method}:`, e);
            }
        }
    }

    onMatchStart(matchId, gameSlug, state, botId, engineCallback) {
        const session = this._getOrCreateSession(matchId, gameSlug, botId, engineCallback);
        this._invokePlugin(gameSlug, 'onMatchStart', session, state);
    }

    onTurn(matchId, gameSlug, state, botId, engineCallback) {
        const session = this._getOrCreateSession(matchId, gameSlug, botId, engineCallback);
        this._invokePlugin(gameSlug, 'onTurn', session, state);
    }

    onReconnect(matchId, gameSlug, state, botId) {
        const matchSessions = this.sessions.get(matchId);
        if (matchSessions && matchSessions.has(botId)) {
            this._invokePlugin(gameSlug, 'onReconnect', matchSessions.get(botId), state);
        }
    }

    onPause(matchId, gameSlug, state, botId) {
        const matchSessions = this.sessions.get(matchId);
        if (matchSessions && matchSessions.has(botId)) {
            this._invokePlugin(gameSlug, 'onPause', matchSessions.get(botId), state);
        }
    }

    onResume(matchId, gameSlug, state, botId) {
        const matchSessions = this.sessions.get(matchId);
        if (matchSessions && matchSessions.has(botId)) {
            this._invokePlugin(gameSlug, 'onResume', matchSessions.get(botId), state);
        }
    }

    onMatchEnd(matchId, gameSlug, state, botId) {
        const matchSessions = this.sessions.get(matchId);
        if (matchSessions && matchSessions.has(botId)) {
            this._invokePlugin(gameSlug, 'onMatchEnd', matchSessions.get(botId), state);
            this.cleanup(matchId, botId);
        }
    }

    cleanup(matchId, botId) {
        const matchSessions = this.sessions.get(matchId);
        if (matchSessions) {
            if (botId) {
                const session = matchSessions.get(botId);
                if (session) {
                    const plugin = this._getPlugin(session.gameSlug);
                    if (plugin && typeof plugin.cleanup === 'function') {
                        plugin.cleanup(session);
                    }
                    session.cleanup();
                    matchSessions.delete(botId);
                }
            } else {
                for (const [id, session] of matchSessions.entries()) {
                    const plugin = this._getPlugin(session.gameSlug);
                    if (plugin && typeof plugin.cleanup === 'function') {
                        plugin.cleanup(session);
                    }
                    session.cleanup();
                }
                this.sessions.delete(matchId);
            }
        }
    }
}

module.exports = new BotManager();
