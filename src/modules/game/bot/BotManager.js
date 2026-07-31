const BotRegistry = require('./BotRegistry');
const Easy = require('./difficulty/Easy');
const Medium = require('./difficulty/Medium');
const Hard = require('./difficulty/Hard');
const seedrandom = require('seedrandom');

const difficulties = { Easy, Medium, Hard };

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
            // Determine difficulty from somewhere, default to Medium for now
            // Ideally, this is passed during match setup metadata
            const session = new BotSession(matchId, gameSlug, botId, 'Medium', engineCallback);
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
