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

const formatGame = (row) => {
  if (!row) return null;
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
  formatGame, formatGameMatch, formatGameStats, formatTournament, formatMatchmakingTicket
}
