'use strict';

/**
 * Tests for game.validator lobbyPlayerParamSchema playerId validation.
 *
 * playerId may be a real user UUID OR a bot id (bots live in settings.bots[]
 * with ids like "bot_alpha_<lobbyHash>_<seat>", never in
 * game_matchmaking_ticket). This locks in the fix for the 400
 * "Invalid player ID format" when kicking a bot from a custom lobby.
 */

process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const { lobbyPlayerParamSchema } = require('../src/modules/game/game.validator');

const LOBBY_UUID = '4b814432-ae8f-43cc-a29a-0bc7e72d19fe';
const USER_UUID = '362ebbd2-748d-48a6-a46c-9cda81499c2c';

describe('lobbyPlayerParamSchema.playerId', () => {
  it('accepts a real user UUID', () => {
    expect(() => lobbyPlayerParamSchema.parse({
      lobbyId: LOBBY_UUID,
      playerId: USER_UUID,
    })).not.toThrow();
  });

  it('accepts bot ids of every shape the engine generates', () => {
    const botIds = [
      'bot_alpha_4b814432_0',
      'bot_bravo_4b814432_1',
      'bot_nova_abcdef12_3',
      'bot_titan_0',           // seat 0 with no lobby hash
      'BOT_DELTA_9',           // case-insensitive
    ];
    for (const botId of botIds) {
      expect(() => lobbyPlayerParamSchema.parse({
        lobbyId: LOBBY_UUID,
        playerId: botId,
      })).not.toThrow();
    }
  });

  it('rejects malformed player ids', () => {
    const badIds = [
      'not-a-uuid',
      'alpha_4b814432_0',      // missing bot_ prefix
      'bot_',
      'bot_alpha!x',
      'bot alpha_1',           // space
      '362ebbd2-748d-48a6',    // truncated uuid
    ];
    for (const badId of badIds) {
      expect(() => lobbyPlayerParamSchema.parse({
        lobbyId: LOBBY_UUID,
        playerId: badId,
      })).toThrow();
    }
  });

  it('rejects a missing playerId', () => {
    expect(() => lobbyPlayerParamSchema.parse({ lobbyId: LOBBY_UUID })).toThrow();
  });
});
