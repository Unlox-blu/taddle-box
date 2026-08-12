const ChessBot = require('./chess/ChessBot');
const LudoBot = require('./ludo/LudoBot');
const SnakeLadderBot = require('./snake-ladder/SnakeLadderBot');
const ScribbleBot = require('./scribble/ScribbleBot');
const TapRushBot = require('./taprush/TapRushBot');
const MemoryBot = require('./memory/MemoryBot');
const WordRushBot = require('./wordrush/WordRushBot');

// Registry of all bot plugins along with metadata
const BotRegistry = {
    'chess': {
        plugin: ChessBot,
        metadata: {
            supportsDifficulty: true,
            turnBased: true,
            requiresEngine: true
        }
    },
    'ludo': {
        plugin: LudoBot,
        metadata: {
            supportsDifficulty: false,
            turnBased: true,
            requiresEngine: false
        }
    },
    'snake-ladder': {
        plugin: SnakeLadderBot,
        metadata: {
            supportsDifficulty: false,
            turnBased: true,
            requiresEngine: false
        }
    },
    'scribble': {
        plugin: ScribbleBot,
        metadata: {
            supportsDifficulty: false,
            turnBased: false,
            requiresEngine: false
        }
    },
    'tap-rush': {
        plugin: TapRushBot,
        metadata: {
            supportsDifficulty: true,
            turnBased: false,
            requiresEngine: false
        }
    },
    'memory-grid': {
        plugin: MemoryBot,
        metadata: {
            supportsDifficulty: true,
            turnBased: false,
            requiresEngine: false
        }
    },
    'word-rush': {
        plugin: WordRushBot,
        metadata: {
            supportsDifficulty: true,
            turnBased: false,
            requiresEngine: false
        }
    }
};

module.exports = BotRegistry;
