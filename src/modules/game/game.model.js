'use strict';

const GAME_TABLE = 'game';
const GAME_MATCH_TABLE = 'game_match';

const GAME_FIELDS = [
    'id', 'name', 'slug', 'description', 'thumbnail', 'category', 
    'difficulty', 'is_active', 'metadata', 'created_at', 'updated_at'
].join(', ');

const GAME_MATCH_FIELDS = [
    'id', 'user_id', 'game_id', 'mode', 'result', 'score', 'duration', 'xp_earned', 
    'category', 'difficulty', 'metadata', 'created_at', 'updated_at'
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

module.exports = {
  GAME_TABLE, GAME_MATCH_TABLE, GAME_FIELDS, GAME_MATCH_FIELDS, 
  formatGame, formatGameMatch
}
