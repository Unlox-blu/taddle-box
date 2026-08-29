/**
 * Standalone bot integration test — verifies each game's bot plugin
 * generates valid moves without needing the full backend stack.
 *
 * Usage: node test-bots.js
 */

const BotRegistry = require('./src/modules/game/bot/BotRegistry');
const seedrandom = require('seedrandom');

// ── Mock BotSession ──────────────────────────────────────────────────────
function createMockSession(matchId, botId, difficultyLevel) {
  const difficulties = {
    Easy: { reactionMs: 1200, accuracy: 60, mistakeChance: 40, chessSkill: 2, chessDepth: 4, chessMoveTime: 50, wordRushPercentile: 20, memoryAccuracy: 70 },
    Medium: { reactionMs: 800, accuracy: 80, mistakeChance: 20, chessSkill: 8, chessDepth: 10, chessMoveTime: 500, wordRushPercentile: 60, memoryAccuracy: 90 },
    Hard: { reactionMs: 300, accuracy: 98, mistakeChance: 2, chessSkill: 15, chessDepth: 15, chessMoveTime: 1000, wordRushPercentile: 100, memoryAccuracy: 100 },
  };

  return {
    matchId,
    botId,
    gameSlug: null,
    difficulty: difficulties[difficultyLevel] || difficulties.Medium,
    engineCallback: null,
    timers: new Set(),
    intervals: new Set(),
    rng: seedrandom(`${matchId}-${botId}`),
    busy: false,
    botThinking: false,
    enginePromise: null,
    engine: null,
    pendingTurnId: null,
    scheduledRound: -1,
    scheduledRound: -1,
    tapCount: 0,
    currentRoundScheduled: -1,
    currentInputScheduled: -1,

    random() { return this.rng(); },
    setTimeout(fn, delay) {
      const id = setTimeout(() => {
        this.timers.delete(id);
        this.busy = false;
        fn();
      }, delay);
      this.timers.add(id);
      return id;
    },
    clearTimeout(id) {
      clearTimeout(id);
      this.timers.delete(id);
    },
    setInterval(fn, delay) {
      const id = setInterval(fn, delay);
      this.intervals.add(id);
      return id;
    },
    clearInterval(id) {
      clearInterval(id);
      this.intervals.delete(id);
    },
    submitMove(move) {
      this.busy = false;
      if (this.engineCallback) {
        this.engineCallback(this.botId, move);
      }
    },
    cleanup() {
      for (const id of this.timers) clearTimeout(id);
      for (const id of this.intervals) clearInterval(id);
      this.timers.clear();
      this.intervals.clear();
    },
  };
}

// ── Test helpers ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ ${msg}`);
  }
}

// ── Tests ────────────────────────────────────────────────────────────────
async function testChess() {
  console.log('\n♟️  Chess Bot');
  const plugin = BotRegistry.chess.plugin;
  const session = createMockSession('chess-test-001', 'bot_001_test_0', 'Easy');
  let moveResult = null;
  session.engineCallback = (botId, move) => { moveResult = move; };

  // Test onMatchStart — spawns Stockfish
  plugin.onMatchStart(session, {});
  assert(session.enginePromise !== null, 'Stockfish engine promise created');

  try {
    const engine = await session.enginePromise;
    assert(engine !== null && engine !== undefined, 'Stockfish engine resolved');

    // Test onTurn — should send go command and produce a bestmove
    const state = {
      pluginState: {
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        turn: 'b',
        turnOrder: ['human_user', 'bot_001_test_0'],
        currentTurnIndex: 1,
      },
    };

    plugin.onTurn(session, state);
    // onTurn is async — botThinking is set in a microtask after await
    await new Promise(r => setImmediate(r));
    assert(session.botThinking === true, 'Bot thinking flag set');

    // Wait for bestmove + delay
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (moveResult) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(checkInterval); resolve(); }, 15000);
    });

    assert(moveResult !== null, `Bot produced a move: ${JSON.stringify(moveResult)}`);
    if (moveResult) {
      assert(typeof moveResult.from === 'string' && moveResult.from.length === 2, `Move has valid from: ${moveResult.from}`);
      assert(typeof moveResult.to === 'string' && moveResult.to.length === 2, `Move has valid to: ${moveResult.to}`);
    }

    // Cleanup
    plugin.cleanup(session);
  } catch (err) {
    assert(false, `Chess test failed: ${err.message}`);
    plugin.cleanup(session);
  }
}

function testLudo() {
  console.log('\n🎲  Ludo Bot');
  const plugin = BotRegistry.ludo.plugin;
  const session = createMockSession('ludo-test-001', 'bot_001_test_0', 'Medium');
  let moveResult = null;
  session.engineCallback = (botId, move) => { moveResult = move; };

  // Test onTurn — should schedule a ROLL after 2s delay
  const state = {
    pluginState: {
      dice: null,
      movableTokens: [],
      turnOrder: ['human_user', 'bot_001_test_0'],
      currentTurnIndex: 1,
    },
  };

  plugin.onTurn(session, state);
  assert(session.pendingTurnId !== null, 'Pending turn scheduled');
  assert(session.timers.size > 0, 'Timer added for delay');
}

function testSnakeLadder() {
  console.log('\n🐍  Snake & Ladder Bot');
  const plugin = BotRegistry['snake-ladder'].plugin;
  const session = createMockSession('sl-test-001', 'bot_001_test_0', 'Medium');
  let moveResult = null;
  session.engineCallback = (botId, move) => { moveResult = move; };

  const state = { pluginState: {} };

  plugin.onTurn(session, state);
  assert(session.timers.size > 0, 'Timer scheduled for dice roll');
}

function testWordRush() {
  console.log('\n📝  Word Rush Bot');
  const plugin = BotRegistry['word-rush'].plugin;
  const session = createMockSession('wr-test-001', 'bot_001_test_0', 'Medium');
  let moves = [];
  session.engineCallback = (botId, move) => { moves.push(move); };

  // Create a grid with some words
  const state = {
    pluginState: {
      grid: ['C', 'A', 'T', 'D', 'O', 'G', 'B', 'A', 'T'],
      foundWords: [],
      currentRound: 1,
      status: 'active',
    },
  };

  plugin.onTurn(session, state);
  assert(session.scheduledRound === 1, 'Round scheduled');
  assert(session.timers.size > 0, 'Timers scheduled for word submissions');
}

function testTapRush() {
  console.log('\n👆  Tap Rush Bot');
  const plugin = BotRegistry['tap-rush'].plugin;
  const session = createMockSession('tr-test-001', 'bot_001_test_0', 'Medium');
  let moves = [];
  session.engineCallback = (botId, move) => { moves.push(move); };

  const state = { pluginState: {} };

  plugin.onMatchStart(session, state);
  assert(session.tapCount === 0, 'Tap count initialized to 0');
  assert(session.timers.size > 0, 'Tap timer scheduled');

  plugin.onPause(session);
  assert(session.timers.size === 0, 'Timers cleared on pause');
}

function testMemoryGrid() {
  console.log('\n🧠  Memory Grid Bot');
  const plugin = BotRegistry['memory-grid'].plugin;
  const session = createMockSession('mg-test-001', 'bot_001_test_0', 'Medium');
  let moves = [];
  session.engineCallback = (botId, move) => { moves.push(move); };

  // Test SHOW phase
  const showState = {
    pluginState: {
      currentPattern: [0, 1, 2],
      currentRound: 1,
      roundPhase: 'SHOW',
      playerInputs: {},
    },
  };

  plugin.onTurn(session, showState);
  assert(session.currentRoundScheduled === 1, 'SHOW round scheduled');
  assert(session.timers.size > 0, 'Timer scheduled for READY_INPUT');

  plugin.onPause(session);
  assert(session.currentRoundScheduled === -1, 'Paused resets round schedule');
}

function testScribble() {
  console.log('\n✏️  Scribble Bot');
  const plugin = BotRegistry.scribble.plugin;
  const session = createMockSession('scrib-test-001', 'bot_001_test_0', 'Medium');
  let moves = [];
  session.engineCallback = (botId, move) => { moves.push(move); };

  // Test drawing bot
  const drawState = {
    pluginState: {
      turnOrder: ['bot_001_test_0', 'human_user'],
      currentDrawerIndex: 0,
      secretWord: 'apple',
    },
  };

  plugin.onTurn(session, drawState);
  assert(session.intervals.size > 0, 'Drawing interval started');

  if (plugin.onPause) {
    plugin.onPause(session);
    assert(session.intervals.size === 0, 'Intervals cleared on pause');
  } else {
    session.cleanup();
    assert(session.intervals.size === 0, 'Intervals cleared via cleanup');
  }
}

// ── Run all tests ────────────────────────────────────────────────────────
async function main() {
  console.log('🤖 Bot Plugin Integration Tests');
  console.log('═'.repeat(50));

  // Synchronous tests first
  testLudo();
  testSnakeLadder();
  testWordRush();
  testTapRush();
  testMemoryGrid();
  testScribble();

  // Async test (Chess with Stockfish)
  await testChess();

  console.log('\n' + '═'.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n✅ All bot plugins working correctly!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
