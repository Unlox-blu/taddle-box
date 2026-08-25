'use strict';

const GAME_TABLE = 'game';
const GAME_MATCH_TABLE = 'game_match';
const GAME_STATS_TABLE = 'game_stats';
const GAME_TOURNAMENT_TABLE = 'game_tournament';
const GAME_TOURNAMENT_ENTRY_TABLE = 'game_tournament_entry';
const GAME_MATCHMAKING_TICKET_TABLE = 'game_matchmaking_ticket';
const GAME_SESSION_TABLE = 'game_sessions';

const GAME_FIELDS = [
    'id', 'name', 'slug', 'description', 'thumbnail', 'category', 
    'difficulty', 'is_active', 'metadata', 'created_at', 'updated_at'
].join(', ');

const GAME_MATCH_FIELDS = [
    'id', 'user_id', 'game_id', 'mode', 'result', 'score', 'duration', 'xp_earned', 
    'category', 'difficulty', 'metadata', 'created_at', 'updated_at'
].join(', ');


const GAME_STATS_FIELDS = [
    'id', 'user_id', 'games_played', 'wins', 'losses', 'draws', 'current_streak', 'best_streak', 
    'total_xp', 'created_at', 'updated_at'
].join(', ');

// Natural player capacity per game.
// Source of truth: GameRegistry.getMeta(slug).maxPlayers (set at startup).
// This map is the fallback for code that doesn't have a plugin instance
// (e.g. matchmaking SQL queries).
const GAME_MAX_PLAYERS = {
  'ludo': 4,
  'snake-ladder': 4,
  'tap-rush': 2,
  'memory-grid': 2,
  'scribble': 2,
  'chess': 2,
  'word-rush': 2,
};

// Resolve a game's natural player capacity: explicit metadata wins, then the
// per-game map (ludo/snake-ladder = 4), then a default of 2 (1v1).
const resolveNaturalMaxPlayers = (game) =>
  Number(game?.metadata?.maxPlayers || (game && GAME_MAX_PLAYERS[game.slug]) || 2);

// Normalize a match mode for storage. game_match.mode has a CHECK constraint
// that only allows uppercase AUTO/CUSTOM/TOURNAMENT/PRACTICE — the app sends
// lowercase ('auto', 'custom', 'tournament', 'practice'). Map to the canonical
// uppercase set so history inserts never fail; anything unknown defaults to AUTO.
const normalizeMatchMode = (mode) => {
  const m = String(mode || 'AUTO').toUpperCase();
  if (['AUTO', 'CUSTOM', 'TOURNAMENT', 'PRACTICE'].includes(m)) return m;
  return 'AUTO';
};

const formatGame = (row) => {
  if (!row) return null;

  // Merge runtime contract from GameRegistry (SSOT for runtime selection).
  // The registry meta is set at startup in engine/index.js — it carries the
  // runtimeType, runtime, runtimeVersion, protocolVersion, minAppVersion,
  // assetSetId, and assetManifestVersion that the frontend needs to render.
  let registryMeta = {};
  try {
    const GameRegistry = require('./engine/GameRegistry');
    registryMeta = GameRegistry.getMeta(row.slug) || {};
  } catch { /* registry not initialized yet (tests, migrations) */ }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    thumbnail: row.thumbnail,
    category: row.category,
    difficulty: row.difficulty,
    isActive: row.is_active,
    metadata: row.metadata,
    maxXp: Number(row.metadata?.maxXp || 25),
    entryFee: Number(row.metadata?.entryFee) || 0,
    maxPlayers: resolveNaturalMaxPlayers(row),
    rounds: registryMeta.rounds || { min: 1, max: 1, default: 1 },

    // ── Frontend runtime contract (from GameRegistry) ──
    // Runtime fields are included so the frontend can validate compatibility
    // and preload the correct bundle. Asset fields (assetSetId, assetManifestVersion)
    // are NOT included here — they are only returned by startGameSession after
    // matchmaking, allowing per-match asset customization.
    runtimeType: registryMeta.runtimeType || 'app',
    runtime: registryMeta.runtime || row.slug,
    runtimeVersion: registryMeta.runtimeVersion || 1,
    protocolVersion: registryMeta.protocolVersion || 1,
    minAppVersion: registryMeta.minAppVersion || '1.0.0',

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const formatGameMatch = (row) => {
  if (!row) return null;
  return {
	    id: row.id,
	    userId: row.user_id,
	    gameId: row.game_id,
    gameName: row.game_name,
    gameSlug: row.game_slug,
    gameThumbnail: row.game_thumbnail,
    mode: row.mode,
    result: row.result,
    score: row.score,
    duration: row.duration,
    xpEarned: row.xp_earned,
    category: row.category,
    difficulty: row.difficulty,
    isActive: row.is_active,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const formatGameStats = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    gamesPlayed: row.games_played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    totalXP: row.total_xp,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const formatTournament = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    gameId: row.game_id,
    gameName: row.game_name,
    gameSlug: row.game_slug,
    title: row.title,
    description: row.description,
    entryFeeXP: row.entry_fee_xp,
    prizeXP: row.prize_xp,
    maxPlayers: row.max_players,
    playerCount: Number(row.player_count || 0),
    isJoined: Boolean(row.is_joined),
    // Current user's own stats inside this tournament (null when not joined).
    myScore: row.my_score != null ? Number(row.my_score) : null,
    myRank: row.my_rank != null ? Number(row.my_rank) : null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const formatMatchmakingTicket = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    tournamentId: row.tournament_id,
    mode: row.mode,
    status: row.status,
    opponentUserId: row.opponent_user_id,
    opponentName: row.opponent_name,
    opponentUsername: row.opponent_username,
    userMatchId: row.user_match_id,
    opponentMatchId: row.opponent_match_id,
    matchGroupId: row.match_group_id,
    lobbyId: row.lobby_id,
    settings: row.settings,
    metadata: row.metadata,
    matchedAt: row.matched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

module.exports = {
  GAME_TABLE, GAME_MATCH_TABLE, GAME_STATS_TABLE,
  GAME_TOURNAMENT_TABLE, GAME_TOURNAMENT_ENTRY_TABLE, GAME_MATCHMAKING_TICKET_TABLE, GAME_SESSION_TABLE,
  GAME_FIELDS, GAME_MATCH_FIELDS, GAME_STATS_FIELDS,
  GAME_MAX_PLAYERS,
  resolveNaturalMaxPlayers,
  normalizeMatchMode,
  formatGame, formatGameMatch, formatGameStats, formatTournament, formatMatchmakingTicket
}
