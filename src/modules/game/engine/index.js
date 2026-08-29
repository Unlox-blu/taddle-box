'use strict';

const GameRegistry = require('./GameRegistry');
const ChessPlugin = require('./plugins/ChessPlugin');
const LudoPlugin = require('./plugins/LudoPlugin');
const SnakeLadderPlugin = require('./plugins/SnakeLadderPlugin');
const ScribblePlugin = require('./plugins/ScribblePlugin');
const WordRushPlugin = require('./plugins/WordRushPlugin');
const TapRushPlugin = require('./plugins/TapRushPlugin');
const MemoryGridPlugin = require('./plugins/MemoryGridPlugin');

// ── Register ALL game plugins with metadata ──────────────────────────────
// Each registration includes the runtime contract that the frontend uses
// to select the correct renderer. Backend is SSOT for runtime selection.
GameRegistry.register('chess', ChessPlugin, {
  turnBased: true,
  supportsDifficulty: false,
  maxPlayers: 2,
  rounds: { min: 1, max: 5, default: 1 },
  // ── Frontend runtime contract ──
  runtimeType: 'app',
  runtime: 'chess',
  runtimeVersion: 1,
  protocolVersion: 1,
  minAppVersion: '1.0.0',
  assetSetId: 'chess-v1',
  assetManifestVersion: 1,
});

GameRegistry.register('ludo', LudoPlugin, {
  turnBased: true,
  supportsDifficulty: false,
  maxPlayers: 4,
  rounds: { min: 1, max: 5, default: 1 },
  runtimeType: 'app',
  runtime: 'ludo',
  runtimeVersion: 1,
  protocolVersion: 1,
  minAppVersion: '1.0.0',
  assetSetId: 'ludo-v1',
  assetManifestVersion: 1,
});

GameRegistry.register('snake-ladder', SnakeLadderPlugin, {
  turnBased: true,
  supportsDifficulty: false,
  maxPlayers: 4,
  rounds: { min: 1, max: 5, default: 1 },
  runtimeType: 'app',
  runtime: 'snake-ladder',
  runtimeVersion: 1,
  protocolVersion: 1,
  minAppVersion: '1.0.0',
  assetSetId: 'snake-ladder-v1',
  assetManifestVersion: 1,
});

GameRegistry.register('scribble', ScribblePlugin, {
  turnBased: false,
  supportsDifficulty: false,
  maxPlayers: 2,
  rounds: { min: 1, max: 5, default: 1 },
  runtimeType: 'app',
  runtime: 'scribble',
  runtimeVersion: 1,
  protocolVersion: 1,
  minAppVersion: '1.0.0',
  assetSetId: 'scribble-v1',
  assetManifestVersion: 1,
});

GameRegistry.register('word-rush', WordRushPlugin, {
  turnBased: false,
  supportsDifficulty: false,
  maxPlayers: 2,
  rounds: { min: 1, max: 5, default: 1 },
  runtimeType: 'app',
  runtime: 'word-rush',
  runtimeVersion: 1,
  protocolVersion: 1,
  minAppVersion: '1.0.0',
  assetSetId: 'word-rush-v1',
  assetManifestVersion: 1,
});

GameRegistry.register('tap-rush', TapRushPlugin, {
  turnBased: false,
  supportsDifficulty: true,
  maxPlayers: 2,
  rounds: { min: 1, max: 5, default: 1 },
  runtimeType: 'app',
  runtime: 'tap-rush',
  runtimeVersion: 1,
  protocolVersion: 1,
  minAppVersion: '1.0.0',
  assetSetId: 'tap-rush-v1',
  assetManifestVersion: 1,
});

GameRegistry.register('memory-grid', MemoryGridPlugin, {
  turnBased: false,
  supportsDifficulty: true,
  maxPlayers: 2,
  rounds: { min: 1, max: 5, default: 1 },
  runtimeType: 'app',
  runtime: 'memory-grid',
  runtimeVersion: 1,
  protocolVersion: 1,
  minAppVersion: '1.0.0',
  assetSetId: 'memory-grid-v1',
  assetManifestVersion: 1,
});

module.exports = GameRegistry;
