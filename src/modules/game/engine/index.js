'use strict';

const GameRegistry = require('./GameRegistry');
const ChessPlugin = require('./plugins/ChessPlugin');
const LudoPlugin = require('./plugins/LudoPlugin');
const SnakeLadderPlugin = require('./plugins/SnakeLadderPlugin');
const ScribblePlugin = require('./plugins/ScribblePlugin');
const WordRushPlugin = require('./plugins/WordRushPlugin');
const TapRushPlugin = require('./plugins/TapRushPlugin');
const MemoryGridPlugin = require('./plugins/MemoryGridPlugin');

// --- Register ALL game plugins ---
GameRegistry.register('chess', ChessPlugin);
GameRegistry.register('ludo', LudoPlugin);
GameRegistry.register('snake-ladder', SnakeLadderPlugin);
GameRegistry.register('scribble', ScribblePlugin);
GameRegistry.register('word-rush', WordRushPlugin);
GameRegistry.register('tap-rush', TapRushPlugin);
GameRegistry.register('memory-grid', MemoryGridPlugin);

module.exports = GameRegistry;
