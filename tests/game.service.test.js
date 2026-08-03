'use strict';

/**
 * Tests for GameService.completeGameSession PVP score reading.
 *
 * The engine archives a finished match's final state into game_matches.metadata
 * (->>'finalState') and cleans up the Redis snapshot. completeGameSession must
 * fall back to that archived state so PVP scores are still read correctly
 * instead of silently defaulting to 0.
 */

// app.config.js throws on missing env vars, and game.service.js pulls it in via
// error.util -> logger.middleware. Provide a test secret before requiring modules.
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

jest.mock('../src/modules/game/engine/EventStore', () => ({
  loadMatchSnapshot: jest.fn(),
  saveMatchSnapshot: jest.fn(),
  appendEvent: jest.fn(),
  cleanupMatch: jest.fn(),
}));

jest.mock('../src/modules/game/engine/MatchManager', () => {
  const MATCH_STATES = {
    WAITING: 'WAITING', READY: 'READY', STARTING: 'STARTING',
    ACTIVE: 'ACTIVE', PAUSED: 'PAUSED', FINISHED: 'FINISHED', ARCHIVED: 'ARCHIVED',
  };
  return {
    MatchManager: { loadOrInitializeMatch: jest.fn() },
    MATCH_STATES,
  };
});

jest.mock('../src/sockets/notification.socket', () => ({
  emitNotification: jest.fn(),
}));

const EventStore = require('../src/modules/game/engine/EventStore');
const MatchManagerModule = require('../src/modules/game/engine/MatchManager');
const GameService = require('../src/modules/game/game.service');
const gameModel = require('../src/modules/game/game.model');

const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OPPONENT_ID = 'aaaaaaaa-0000-0000-0000-000000000002';
const GAME_ID = '11111111-1111-4111-8111-111111111111';
const MATCH_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

function buildMocks() {
  const gameRepo = {
    findGameSessionById: jest.fn().mockResolvedValue(null),
    findGameById: jest.fn().mockResolvedValue(null),
    getMatchArchivedState: jest.fn().mockResolvedValue(null),
    updateGameSessionStatus: jest.fn().mockResolvedValue({}),
    createRewardLedgerEntry: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
    findOpponentSessionByMatchGroup: jest.fn().mockResolvedValue(null),
    recordMatchHistory: jest.fn().mockResolvedValue({}),
  };
  const xpSvc = { creditXP: jest.fn().mockResolvedValue({}), debitXP: jest.fn().mockResolvedValue({}) };
  const service = new GameService({ gameRepository: gameRepo, xpService: xpSvc });
  return { gameRepo, xpSvc, service };
}

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    user_id: USER_ID,
    game_id: GAME_ID,
    status: 'ACTIVE',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    metadata: { mode: 'AUTO', matchGroupId: MATCH_ID },
    ...overrides,
  };
}

function makeGame(overrides = {}) {
  return {
    id: GAME_ID,
    name: 'Tap Rush',
    slug: 'tap-rush',
    metadata: { runtime: 'html5_webview', maxXp: 35, durationSeconds: 20, winScore: 14 },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('completeGameSession — PVP score reading fallback', () => {
  test('reads score from archived finalState when the Redis snapshot is gone', async () => {
    const { gameRepo, xpSvc, service } = buildMocks();
    gameRepo.findGameSessionById.mockResolvedValue(makeSession());
    gameRepo.findGameById.mockResolvedValue(makeGame());
    EventStore.loadMatchSnapshot.mockResolvedValue(null); // Redis cleaned up after archive
    gameRepo.getMatchArchivedState.mockResolvedValue({
      status: 'FINISHED',
      pluginState: {
        scores: { [USER_ID]: 20, [OPPONENT_ID]: 10 },
        startedAt: 1000,
        finishedAt: 21000,
      },
    });
    gameRepo.findOpponentSessionByMatchGroup.mockResolvedValue({
      id: 'session-2', user_id: OPPONENT_ID, status: 'PENDING', validated_score: 10,
    });

    const result = await service.completeGameSession({ userId: USER_ID, sessionId: 'session-1' });

    expect(result).toMatchObject({ result: 'WIN', score: 20, xpEarned: 35, ledgerId: 'ledger-1' });
    // Score must come from the archived state, not a fresh (score-less) initialize
    expect(gameRepo.getMatchArchivedState).toHaveBeenCalledWith({ matchId: MATCH_ID });
    expect(gameRepo.updateGameSessionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', status: 'COMPLETED' })
    );
    expect(gameRepo.recordMatchHistory).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'WIN', score: 20, xpEarned: 35 })
    );
    expect(xpSvc.creditXP).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, xp: 35 })
    );
  });

  test('falls back to loadOrInitializeMatch when neither Redis nor the archive has state', async () => {
    const { gameRepo, service } = buildMocks();
    gameRepo.findGameSessionById.mockResolvedValue(makeSession());
    gameRepo.findGameById.mockResolvedValue(makeGame());
    EventStore.loadMatchSnapshot.mockResolvedValue(null);
    gameRepo.getMatchArchivedState.mockResolvedValue(null);
    MatchManagerModule.MatchManager.loadOrInitializeMatch.mockResolvedValue({
      state: {
        status: 'FINISHED',
        pluginState: { scores: { [USER_ID]: 18 }, startedAt: 1000, finishedAt: 19000 },
      },
    });
    gameRepo.findOpponentSessionByMatchGroup.mockResolvedValue({
      id: 'session-2', user_id: OPPONENT_ID, status: 'PENDING', validated_score: 5,
    });

    const result = await service.completeGameSession({ userId: USER_ID, sessionId: 'session-1' });

    expect(MatchManagerModule.MatchManager.loadOrInitializeMatch).toHaveBeenCalled();
    expect(result).toMatchObject({ result: 'WIN', score: 18 });
  });

  test('resolves a bot-filled match immediately against the archived final state', async () => {
    const { gameRepo, service } = buildMocks();
    gameRepo.findGameSessionById.mockResolvedValue(makeSession());
    gameRepo.findGameById.mockResolvedValue(makeGame());
    EventStore.loadMatchSnapshot.mockResolvedValue(null);
    gameRepo.getMatchArchivedState.mockResolvedValue({
      status: 'FINISHED',
      players: [
        { userId: USER_ID, isBot: false },
        { id: 'bot_alpha_abc123_1', isBot: true },
      ],
      pluginState: {
        scores: { [USER_ID]: 20, bot_alpha_abc123_1: 8 },
        startedAt: 1000,
        finishedAt: 21000,
      },
    });
    const result = await service.completeGameSession({ userId: USER_ID, sessionId: 'session-1' });

    expect(result).toMatchObject({ result: 'WIN', score: 20 });
    // Bot match must skip the PVP opponent-waiting path
    expect(gameRepo.findOpponentSessionByMatchGroup).not.toHaveBeenCalled();
    expect(gameRepo.updateGameSessionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', status: 'COMPLETED' })
    );
    expect(gameRepo.recordMatchHistory).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'WIN' })
    );
  });
});

describe('resolveNaturalMaxPlayers — AUTO bot-fill sizing', () => {
  test('returns 4 for ludo and snake-ladder with empty metadata', () => {
    expect(gameModel.resolveNaturalMaxPlayers({ slug: 'ludo', metadata: {} })).toBe(4);
    expect(gameModel.resolveNaturalMaxPlayers({ slug: 'snake-ladder', metadata: {} })).toBe(4);
  });

  test('returns 2 for 1v1 games with empty metadata', () => {
    expect(gameModel.resolveNaturalMaxPlayers({ slug: 'chess', metadata: {} })).toBe(2);
    expect(gameModel.resolveNaturalMaxPlayers({ slug: 'tap-rush', metadata: {} })).toBe(2);
    expect(gameModel.resolveNaturalMaxPlayers({ slug: 'unknown-game', metadata: {} })).toBe(2);
  });

  test('prefers explicit metadata.maxPlayers and is null-safe', () => {
    expect(gameModel.resolveNaturalMaxPlayers({ slug: 'ludo', metadata: { maxPlayers: 4 } })).toBe(4);
    expect(gameModel.resolveNaturalMaxPlayers({ slug: 'ludo', metadata: { maxPlayers: 3 } })).toBe(3);
    expect(gameModel.resolveNaturalMaxPlayers(null)).toBe(2);
    expect(gameModel.resolveNaturalMaxPlayers(undefined)).toBe(2);
  });

  test('formatGame exposes maxPlayers (metadata > map > 2)', () => {
    expect(gameModel.formatGame({ id: 'x', name: 'Ludo', slug: 'ludo', metadata: {} }).maxPlayers).toBe(4);
    expect(gameModel.formatGame({ id: 'y', name: 'Chess', slug: 'chess', metadata: { maxPlayers: 3 } }).maxPlayers).toBe(3);
  });
});

describe('normalizeMatchMode — game_match CHECK-constraint safety', () => {
  test('maps lowercase app modes to uppercase canonical set', () => {
    expect(gameModel.normalizeMatchMode('auto')).toBe('AUTO');
    expect(gameModel.normalizeMatchMode('custom')).toBe('CUSTOM');
    expect(gameModel.normalizeMatchMode('tournament')).toBe('TOURNAMENT');
    expect(gameModel.normalizeMatchMode('AUTO')).toBe('AUTO');
  });

  test('does not special-case legacy modes (quick/bot/invite) — they default to AUTO', () => {
    expect(gameModel.normalizeMatchMode('QUICK')).toBe('AUTO');
    expect(gameModel.normalizeMatchMode('quick')).toBe('AUTO');
    expect(gameModel.normalizeMatchMode('BOT')).toBe('AUTO');
    expect(gameModel.normalizeMatchMode('bot')).toBe('AUTO');
    expect(gameModel.normalizeMatchMode('INVITE')).toBe('AUTO');
    expect(gameModel.normalizeMatchMode('invite')).toBe('AUTO');
  });

  test('defaults null/undefined/unknown to AUTO', () => {
    expect(gameModel.normalizeMatchMode(null)).toBe('AUTO');
    expect(gameModel.normalizeMatchMode(undefined)).toBe('AUTO');
    expect(gameModel.normalizeMatchMode('')).toBe('AUTO');
    expect(gameModel.normalizeMatchMode('weird-mode')).toBe('AUTO');
  });
});
