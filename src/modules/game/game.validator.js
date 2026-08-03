'use strict';

const { z } = require('zod');
const config = require('../../config/app.config')

const ALLOWED_MODE = ['AUTO', 'CUSTOM', 'TOURNAMENT', 'PRACTICE']
const DIFFICULTY_TYPE = ['easy', 'medium', 'hard']
const RESULT_TYPE = ['WIN', 'LOSS', 'DRAW']

// Canonical match-mode gate shared by every endpoint that accepts a mode.
// Accepts auto/custom/tournament case-insensitively, normalizes to uppercase,
// and rejects anything else (legacy 'quick'/'bot'/'invite' or junk) before it
// can reach the DB. validateRequest writes result.data back onto req.body, so
// controllers always receive the normalized uppercase value.
const matchModeSchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.toUpperCase() : val),
  z.enum(ALLOWED_MODE, {
    error: () => ({ message: `Mode must be one of: ${ALLOWED_MODE.join(', ')}` })
  })
);

const typeCheck = (val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  }

const gameIdParamSchema  = z.object({
  gameId: z.string().uuid({ message: "Invalid game ID format" }),
}).strict();

const matchIdParamSchema  = z.object({
  matchId: z.string().uuid({ message: "Invalid match ID format" }),
}).strict();

const tournamentIdParamSchema  = z.object({
  tournamentId: z.string().uuid({ message: "Invalid tournament ID format" }),
}).strict();

const ticketIdParamSchema  = z.object({
  ticketId: z.string().uuid({ message: "Invalid matchmaking ticket ID format" }),
}).strict();

const searchSchema = z.object({
  query: z.string().default(''),
  page: z.coerce
    .number({ invalid_type_error: 'Page must be a number' })
    .int({ message: 'Page must be an integer' })
    .positive({ message: 'Page must be greater than zero' })
    .default(1).optional(),

  limit: z.coerce
    .number({ invalid_type_error: 'Limit must be a number' })
    .int({ message: 'Limit must be an integer' })
    .positive({ message: 'Limit must be greater than zero' })
    .max(100, 'Maximum limit allowed is 100')
    .default(10).optional(),
}).strict();

const paginationSchema = z.object({
  page: z.coerce
    .number({ invalid_type_error: 'Page must be a number' })
    .int({ message: 'Page must be an integer' })
    .positive({ message: 'Page must be greater than zero' })
    .default(1).optional(),

  limit: z.coerce
    .number({ invalid_type_error: 'Limit must be a number' })
    .int({ message: 'Limit must be an integer' })
    .positive({ message: 'Limit must be greater than zero' })
    .max(100, 'Maximum limit allowed is 100')
    .default(10).optional(),
}).strict();


const createMatchSchema = z.object({
  gameId: z.string().uuid({ message: 'Invalid game ID format' }),
  mode: matchModeSchema,
  category: z.string().optional(),
  difficulty: z.enum(DIFFICULTY_TYPE, {
            error_map: () => ({ message: `Difficulty must be one of: ${DIFFICULTY_TYPE.join(', ')}` })
          }).optional(),
  metadata: z.preprocess(typeCheck, z.record(z.any())).optional()
})

const updateMatchSchema = z.object({
  matchId: z.string().uuid({ message: 'Invalid match ID format' }),
  result : z.enum(RESULT_TYPE, {
            error_map: () => ({ message: `Result must be one of: ${RESULT_TYPE.join(', ')}` })
          }),
	  score: z.coerce.number().nonnegative({ message: "Score cannot be negative" }),
	  duration: z.coerce.number().nonnegative({ message: "Duration cannot be negative" }),
	  xpEarned: z.coerce.number().nonnegative({ message: "xpEarned cannot be negative" }).optional().default(0),
		})

const joinMatchmakingSchema = z.object({
  gameId: z.string().uuid({ message: 'Invalid game ID format' }),
  mode: matchModeSchema,
  tournamentId: z.string().uuid({ message: 'Invalid tournament ID format' }).optional(),
  targetPlayers: z.number().positive().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
})

const startGameSessionSchema = z.object({
  gameId: z.string().uuid({ message: 'Invalid game ID format' }),
  mode: matchModeSchema,
  matchGroupId: z.string().uuid({ message: 'Invalid match group ID format' }).optional().nullable(),
})

const inviteMatchmakingSchema = z.object({
  opponentId: z.string().uuid({ message: 'Invalid opponent ID format' }),
  gameId: z.string().uuid({ message: 'Invalid game ID format' }),
  matchGroupId: z.string(),
})

const lobbyIdParamSchema = z.object({
  lobbyId: z.string().uuid({ message: 'Invalid lobby ID format' })
}).strict();

// playerId may be a real user UUID or a bot id (bots live in settings.bots[]
// with ids like "bot_alpha_<lobbyHash>_<seat>", never in game_matchmaking_ticket).
const lobbyPlayerIdSchema = z.string().refine(
  (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
      || /^bot_[a-z0-9_]+$/i.test(v),
  { message: 'Invalid player ID format' }
);

const lobbyPlayerParamSchema = z.object({
  lobbyId: z.string().uuid({ message: 'Invalid lobby ID format' }),
  playerId: lobbyPlayerIdSchema
}).strict();

const updateLobbySchema = z.object({
  teamsLocked: z.boolean().optional(),
  autoBalance: z.boolean().optional(),
  targetPlayers: z.number().positive().optional()
}).strict();

const updateLobbyPlayerSchema = z.object({
  team: z.number().positive().optional(),
  seat: z.number().nonnegative().optional(),
  isReady: z.boolean().optional(),
  lobbyRole: z.enum(['HOST', 'PLAYER']).optional()
}).strict();

module.exports = {
  typeCheck,
  matchModeSchema,
  paginationSchema,
  searchSchema,
  gameIdParamSchema,
  matchIdParamSchema,
  tournamentIdParamSchema,
  ticketIdParamSchema,
  createMatchSchema,
  updateMatchSchema,
  joinMatchmakingSchema,
  startGameSessionSchema,
  inviteMatchmakingSchema,
  lobbyIdParamSchema,
  lobbyPlayerParamSchema,
  updateLobbySchema,
  updateLobbyPlayerSchema
};
