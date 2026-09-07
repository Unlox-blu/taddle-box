# 🏗️ TADDLE GAME PLATFORM — IMPLEMENTATION PLAN

> Goal: Build a **plugin-based modular game platform with a strict engine contract** so the mobile app becomes a stable runtime, and most future games are backend-only additions.
>
> ## Architecture: `runtimeType` + `runtime` + One Unified Game Registry
>
> ```text
>                         GAME REGISTRY
>                              │
>                  ┌───────────┴───────────┐
>                  │                       │
>           runtimeType=app         runtimeType=web
>                  │                       │
>            App Runtime              Web Runtime
>                  │                       │
>          ┌───────┼───────┐              │
>          ▼       ▼       ▼              ▼
>        board   quiz   reaction     Web Game
>       -v1     -v1     -v1          Bundle
> ```
>
> **Two fields define a game's execution:**
> - `runtimeType: 'app' | 'web'` — **where** the runtime lives
> - `runtime: string` — **which** runtime executes the game (e.g. `board-v1`, `quiz-v1`, `reaction-v1`, `web-v1`)
>
> `runtimeType = app` does NOT mean every game needs custom native code. It means the required game runtime is already shipped inside the Taddle app. That runtime can be configured entirely by backend data.
>
> **Key rule:** App runtimes are the foundation. Web Runtime is an optional escape hatch. The platform should NEVER depend on dynamically downloaded executable code as its primary delivery mechanism.
>
> | What changes | App update needed? | App Store safe? | Play Store safe? |
> |---|---|---|---|
> | Game enabled/disabled, config, XP, timers | No | 🟢 | 🟢 |
> | Server-side game logic, rules, versions | No | 🟢 | 🟢 |
> | Assets, content, levels, difficulty | No | 🟢 | 🟢 |
> | New game using existing app runtime (board/quiz/reaction) | No | 🟢 | 🟢 |
> | New game using web runtime (HTML5) | No | 🟢 w/ 4.7 | 🟡 policy-sensitive |
> | New runtime capability (3D, physics, AR) | Yes | 🟢 | 🟢 |
> | Arbitrary remote JS execution | No | 🟡 | 🔴 |

---

## PHASE 0: ENHANCE THE EXISTING PLUGIN CONTRACT (Week 1–2)

> This is the foundation. Every subsequent phase depends on this contract being rock-solid.

### 0.1 — Define the GameDefinition Interface

**File:** `taddle-box/src/modules/game/engine/GamePlugin.js` (upgrade to TypeScript-style contract via JSDoc)

```js
/**
 * @typedef {Object} GameState
 * @property {'WAITING'|'ACTIVE'|'PAUSED'|'FINISHED'} status
 * @property {Object} pluginState - game-specific state
 * @property {string[]} players
 * @property {Object} metadata
 * @property {number} startedAt
 * @property {number} stateRevision - optimistic concurrency counter
 */

/**
 * @typedef {Object} GameCommand
 * @property {string} commandId - UUID for idempotency
 * @property {string} type - e.g. 'MOVE', 'TAP', 'ROLL', 'WORD_SUBMIT'
 * @property {string} userId - DERIVED server-side, never trusted from client
 * @property {number} expectedRevision - client's STALENESS HINT only (never trusted as authoritative state; server uses authoritative match state revision)
 * @property {number} clientSequence - client-side sequence number
 * @property {Object} payload - command-specific data
 */

/**
 * @typedef {Object} PublicState
 * @property {Object} state - filtered for this player's eyes only
 * @property {boolean} isMyTurn
 * @property {number|null} myScore
 * @property {Object|null} gameSpecificUI - e.g. { wordMask, movableTokens }
 * @property {number} stateRevision - for optimistic concurrency on next command
 */

/**
 * @typedef {Object} GameResult
 * @property {'WIN'|'LOSS'|'DRAW'} result
 * @property {number} xpEarned
 * @property {Object} stats - per-game stats (accuracy, longestStreak, etc.)
 */

class GamePlugin {
  constructor(matchData) {
    this.matchData = matchData;
    this.players = matchData.players || [];
    this.gameMetadata = matchData.metadata || {};
  }

  // ── Identity ────────────────────────────────────────────────────────────
  static ID = 'unknown';          // e.g. 'chess', 'ludo'
  static EXECUTION_MODEL = 'real-time'; // 'turn-based' | 'real-time' | 'round-based' | 'simultaneous'
  static VERSION = 1;
  static ENTRY_FEE_DEFAULT = 10;  // fallback if DB has no entryFee

  // ── Security Policy ─────────────────────────────────────────────────────
  // Platform-enforced requirements. The engine validates these BEFORE
  // calling plugin.validateCommand(). Plugins cannot override these.
  static SECURITY_POLICY = {
    serverAuthoritative: true,      // server always decides win/loss/reward
    requiresPlayerView: true,       // plugin must implement getPlayerView()
    requiresIdempotency: true,      // commands must be deduplicated
    maxCommandRate: 10,             // commands per second per player
    maxPayloadBytes: 4096,          // max command payload size
    allowSpectators: false,         // spectator mode (future)
    allowReconnect: true,           // reconnect support
    rewardType: 'xp',              // reward type
    maxStateSizeBytes: 65536,       // max serialized state size
    maxCommandsPerMatch: 10000,     // safety valve
  };

  // ── Command Schemas ─────────────────────────────────────────────────────
  // Each plugin defines schemas for its commands. The engine validates
  // payloads BEFORE calling validateCommand(). Rejects: unknown fields,
  // unexpected types, oversized strings, huge arrays, NaN, Infinity.
  //
  // Example:
  // static COMMAND_SCHEMAS = {
  //   MOVE: { from: 'number', to: 'number' },
  //   ROLL: {},
  //   WORD_SUBMIT: { word: 'string', path: 'array' },
  // };
  static COMMAND_SCHEMAS = {};  // each plugin overrides this

  // ── Lifecycle ───────────────────────────────────────────────────────────
  /** Initialize match state (must include stateRevision: 0) */
  createMatch() { throw new Error('createMatch() required'); }

  /** Called when all players are ready, match transitions to ACTIVE */
  onMatchStart(state) { return state; }

  /** Validate + execute a command, return new state */
  executeCommand(state, command) { throw new Error('executeCommand() required'); }

  /** Check if match is over */
  isFinished(state) { throw new Error('isFinished() required'); }

  /** Calculate reward for a player */
  calculateReward(state, userId) { throw new Error('calculateReward() required'); }

  /** Assert game invariants (used in test builds for invariant testing) */
  assertInvariants(state) {
    // Override per-plugin. Should throw on any broken invariant.
    // Examples:
    //   chess: pieces cannot duplicate, turn is valid
  }

  // ── Player view ─────────────────────────────────────────────────────────
  /**
   * Return state filtered for one player (hides opponent's hand, secret word, etc.).
   * FAIL CLOSED: every plugin MUST implement this. Default throws to prevent
   * accidental state leakage. Never return full pluginState as a fallback.
   */
  getPlayerView(state, playerId) {
    throw new Error(
      `getPlayerView() must be implemented by every game. ${this.constructor.ID} has no player view.`
    );
  }

  /**
   * Return state safe for spectators (no hidden info at all).
   * FAIL CLOSED: every plugin MUST implement this if spectators are supported.
   */
  getSpectatorView(state) {
    throw new Error(
      `getSpectatorView() must be implemented by every game. ${this.constructor.ID} has no spectator view.`
    );
  }

  // ── Timing model ────────────────────────────────────────────────────────
  /** Return timer definitions for this match */
  getTimers(state) {
    return [];  // e.g. [{ type: 'turn', ms: 60000 }, { type: 'round', ms: 90000 }]
  }

  /** Handle a timer expiry */
  onTimerExpired(state, timerType, userId) {
    return state;  // default: no-op
  }

  /**
   * Return the next turn player. Plugin-authoritative, not executor.
   * Plugins MUST implement this — handles: skipped players, extra turns,
   * eliminated players, team turns, penalties, special turn rules.
   */
  getNextTurnPlayer(state, currentPlayerId) {
    throw new Error(
      `getNextTurnPlayer() must be implemented by ${this.constructor.ID}. Executor must not define game rules.`
    );
  }

  // ── Connection lifecycle ────────────────────────────────────────────────
  onPlayerJoin(userId) {}
  onPlayerLeave(userId) {}
  onReconnect(userId) {}

  // ── Serialization ───────────────────────────────────────────────────────
  /** Return the versioned state blob for Redis/PostgreSQL persistence */
  serialize(state) { return state; }
  deserialize(blob) { return blob; }
}
```

### 0.1A — Immutable State Boundaries

> Plugins must not accidentally mutate shared state. The engine provides input state,
> the plugin produces new state. Old state must NEVER be mutated.

```text
Input state (frozen in dev)
    ↓
Plugin.executeCommand(state, command)
    ↓
New state (new object, old state untouched)
```

**In development/test builds, freeze input state:**
```js
// In test builds, Object.freeze to detect accidental mutation:
if (process.env.NODE_ENV === 'test') {
  Object.freeze(state.pluginState);
  Object.freeze(state);
}
const newState = plugin.executeCommand(state, command);
// If plugin mutates state.pluginState, this will throw in tests.
```

**At minimum, tests should detect:**
```text
plugin mutates previous state
```

Because that can create subtle race bugs that are nearly impossible to reproduce in production.

**Pattern for plugins:**
```js
executeCommand(state, command) {
  // NEVER: state.pluginState.score += 10;  // ← mutates input!
  // ALWAYS: create new state object
  return {
    ...state,
    pluginState: {
      ...state.pluginState,
      score: state.pluginState.score + 10,
    },
  };
}
```

### 0.2 — Migrate All 7 Plugins to the New Contract

Each plugin must implement:

| Method | Chess | Ludo | SnakeLadder | TapRush | WordRush | Scribble | MemoryGrid |
|--------|-------|------|-------------|---------|----------|----------|------------|
| `createMatch()` | ✅ `createState()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `executeCommand()` | ✅ `applyMove()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `isFinished()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `calculateReward()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `getPlayerView()` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (word mask) | ❌ |
| `getSpectatorView()` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `getTimers()` | ❌ (inline) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `onTimerExpired()` | ❌ (inline) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Migration per game:**

```
chess:
  - Rename createState → createMatch
  - Rename applyMove → executeCommand  
  - Extract timer logic from game.socket.js into getTimers/onTimerExpired
  - getPlayerView: return { fen, turn, isMyTurn, myColor, opponentName }

ludo:
  - Same renames
  - Extract auto-move timeout from game.socket.js → onTimerExpired
  - getPlayerView: return { board, myTokens, movableTokens, dice, isMyTurn }

snake-ladder:
  - Same renames
  - Extract auto-roll timeout → onTimerExpired
  - getPlayerView: return { board, myPosition, opponentPosition, dice, isMyTurn }

tap-rush:
  - Same renames
  - Hide targetSequence from getPlayerView — only expose current target
  - getPlayerView: return { currentTarget, score, timeLeft, duration }

word-rush:
  - Same renames
  - Hide dictionary (already hidden), hide opponents' found words
  - getPlayerView: return { grid, myScore, foundWords, timeLeft }

scribble:
  - Already has player-specific state (_getPlayerState in game.socket.js)
  - Move that logic INTO getPlayerView
  - getPlayerView: drawer sees { word, drawTool }, guessers see { wordMask, hints }

memory-grid:
  - Hide pattern during SHOW phase
  - getPlayerView: return { visibleCards, myScore, timeLeft }
```

**Effort:** ~3 days

---

## PHASE 1: GAME EXECUTION ABSTRACTION (Week 2–3)

> Create the **Game Execution Manager** on the backend — a manager that selects the appropriate server execution model for each game plugin. Client runtime metadata is handled separately by the unified Game Registry.
>
> Three clean, non-overlapping concepts:
> ```text
> runtimeType    WHERE the runtime lives          'app' | 'web'
> runtime        WHICH client runtime renders it  'board-v1', 'reaction-v1', 'web-v1', ...
> executionModel HOW the server orchestrates       'turn-based', 'real-time', 'round-based', 'simultaneous'
> ```
> The backend doesn't need to care whether the client is WebView or React Native to execute a turn.

### 1.1 — Execution Model Enum

**New file:** `taddle-box/src/modules/game/engine/ExecutionModels.js`

```js
const EXECUTION_MODELS = {
  TURN_BASED: 'turn-based',       // Chess, Ludo, SnakeLadder
  REAL_TIME: 'real-time',         // TapRush
  ROUND_BASED: 'round-based',    // WordRush, Scribble
  SIMULTANEOUS: 'simultaneous',  // MemoryGrid (both flip at once)
};

module.exports = EXECUTION_MODELS;
```

### 1.2 — Game Execution Manager

**New file:** `taddle-box/src/modules/game/engine/GameExecutionManager.js`

```js
class GameExecutionManager {
  static executors = new Map();

  static register(executionModel, executor) {
    this.executors.set(executionModel, executor);
  }

  static getExecutor(executionModel) {
    return this.executors.get(executionModel);
  }
}

// ── Turn-based executor ──────────────────────────────────────────────────
class TurnBasedExecutor {
  static handleMove(state, plugin, command) {
    // Validate it's this player's turn
    const turnOwner = state.pluginState.turnOrder[state.pluginState.currentTurnIndex];
    if (command.userId !== turnOwner) {
      throw new Error('Not your turn');
    }
    // Execute
    const newState = plugin.executeCommand(state, command);
    if (!plugin.isFinished(newState)) {
      // Plugin-authoritative turn advancement: the plugin determines who goes next.
      // This handles skipped players, extra turns, eliminated players, team turns,
      // penalties, and special turn rules. The executor orchestrates — it does not
      // define game rules.
      const nextPlayer = plugin.getNextTurnPlayer(newState, command.userId);
      newState.pluginState.currentTurnIndex = 
        newState.pluginState.turnOrder.indexOf(nextPlayer);
    }
    return newState;
  }

  static getTimers(state, gameSlug) {
    return [{ type: 'turn', ms: getTurnTimeout(gameSlug) }];
  }
}

// ── Real-time executor ───────────────────────────────────────────────────
class RealTimeExecutor {
  static handleMove(state, plugin, command) {
    // Any player can move anytime — just validate + apply
    return plugin.executeCommand(state, command);
  }

  static getTimers(state, gameSlug) {
    return [{ type: 'game', ms: getGameDuration(gameSlug) }];
  }
}

// ── Round-based executor ─────────────────────────────────────────────────
class RoundBasedExecutor {
  static handleMove(state, plugin, command) {
    return plugin.executeCommand(state, command);
  }

  static handleTimerExpired(state, plugin, timerType) {
    if (timerType === 'round') {
      return plugin.onTimerExpired(state, 'round');
    }
    return state;
  }

  static getTimers(state, gameSlug) {
    return [{ type: 'round', ms: getRoundTimeout(gameSlug) }];
  }
}
```

### 1.3 — Refactor MatchManager to Use Execution Manager

**File:** `taddle-box/src/modules/game/engine/MatchManager.js`

Currently, `MatchManager.handlePlayerMove` does:

```js
state.pluginState = plugin.applyMove(userId, moveData, state.pluginState);
```

Change to:

```js
const executor = GameExecutionManager.getExecutor(plugin.constructor.EXECUTION_MODEL);
state = executor.handleMove(state, plugin, { userId, type: moveData.type, payload: moveData });
```

This removes the game-specific `if (gameSlug === 'chess')` blocks from `game.socket.js`.

**Effort:** ~4 days

---

## PHASE 2: PLAYER VIEW ENCAPSULATION (Week 3)

> Every game must project its own player-specific view. No more `_getPlayerState()` in `game.socket.js` with `if (gameSlug === 'scribble')` guards.

### 2.1 — Move _getPlayerState Into Plugins

**Current:** `game.socket.js` lines 380–410 have:
```js
function _getPlayerState(gameSlug, fullState, playerId) {
  if (gameSlug === 'scribble' && fullState.pluginState) {
    // ... 20 lines of scribble-specific logic
  }
  return fullState;  // everything else leaks full state
}
```

**After:** Each plugin implements `getPlayerView(state, playerId)`:
```js
// In game.socket.js
const sockets = await gameNs.in(matchRoom).fetchSockets();
for (const s of sockets) {
  const view = plugin.getPlayerView(fullState, s.userId);
  s.emit(EVENTS.SYNC, { state: view.state, ...view.gameSpecificUI });
}
```

### 2.2 — Fix State Leakage in TapRush and MemoryGrid

**TapRushPlugin:**
```js
getPlayerView(state, playerId) {
  const elapsed = Date.now() - (state.startedAt || Date.now());
  const currentTarget = state.targetSequence.find(t => t.delay <= elapsed && !t.hit);
  return {
    state: {
      phase: state.status,
      currentTarget,  // only the CURRENT target, not the full sequence
      score: state.scores[playerId] || 0,
      timeLeft: Math.max(0, GAME_DURATION_SECONDS * 1000 - elapsed),
    },
    isMyTurn: true, // real-time: always "my turn"
  };
}
```

**MemoryGridPlugin:**
```js
getPlayerView(state, playerId) {
  if (state.phase === 'SHOW') {
    // During show phase, all cards are visible
    return { state: { cards: state.cards, phase: 'SHOW' } };
  }
  // During play, only show cards that have been flipped
  const revealedCards = state.cards.map((c, i) => 
    state.revealed?.includes(i) ? c : null
  );
  return {
    state: { cards: revealedCards, phase: state.phase, score: state.scores[playerId] },
  };
}
```

**Effort:** ~2 days

---

## PHASE 3: VERSIONED STATE (Week 3–4)

> Every match stores its game version. When you deploy v2 of a game, existing matches finish on v1.

### 3.1 — Add Version to Match Snapshot

**File:** `taddle-box/src/modules/game/engine/MatchManager.js`

```js
static async loadOrInitializeMatch(matchId, gameSlug, matchMetadata) {
  let state = await EventStore.loadMatchSnapshot(matchId);
  const gameVersion = state?.gameVersion ?? matchMetadata.gameVersion ?? 1;
  const plugin = GameRegistry.createInstance(gameSlug, state?.metadata || matchMetadata, gameVersion);
  
  if (!state) {
    state = {
      status: MATCH_STATES.WAITING,
      gameVersion: matchMetadata.gameVersion || 1,       // <-- NEW
      runtimeType: matchMetadata.runtimeType || 'app',    // <-- NEW
      runtime: matchMetadata.runtime || 'reaction-v1',    // <-- NEW
      runtimeVersion: matchMetadata.runtimeVersion || 1,  // <-- NEW
      executionModel: matchMetadata.executionModel || 'real-time', // <-- NEW
      players: matchMetadata.players || [],
      maxPlayers: matchMetadata.maxPlayers || 2,
      pluginState: plugin.createMatch(),         // renamed from createState
      metadata: matchMetadata,
      startedAt: null,
      readyPlayers: [],
    };
    await EventStore.saveMatchSnapshot(matchId, state);
  }
  return { state, plugin };
}
```

### 3.2 — Versioned Plugin Registry

**File:** `taddle-box/src/modules/game/engine/GameRegistry.js`

```js
class GameRegistry {
  static plugins = new Map(); // slug → [{ version, PluginClass }]

  static register(slug, PluginClass) {
    if (!this.plugins.has(slug)) this.plugins.set(slug, []);
    const versions = this.plugins.get(slug);
    // Replace if same version, append if new
    const idx = versions.findIndex(v => v.version === PluginClass.VERSION);
    if (idx >= 0) versions[idx] = { version: PluginClass.VERSION, PluginClass };
    else versions.push({ version: PluginClass.VERSION, PluginClass });
  }

  /** Get the plugin for a specific version (for resuming existing matches) */
  static createInstance(slug, matchData, version) {
    const versions = this.plugins.get(slug);
    if (!versions?.length) throw new Error(`No plugin for "${slug}"`);
    
    if (version !== undefined) {
      // FAIL CLOSED: old match must never silently switch rules
      const entry = versions.find(v => v.version === version);
      if (!entry) {
        throw new Error(`Required game version unavailable: ${slug}@${version}`);
      }
      return new entry.PluginClass(matchData);
    }
    
    // No version specified → use latest (new matches only)
    return versions[versions.length - 1].PluginClass(matchData);
  }
}
```

### 3.3 — PostgreSQL Schema Update

```sql
-- Add version/runtime columns to game_matches for versioned match snapshots
ALTER TABLE game_matches
  ADD COLUMN IF NOT EXISTS game_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS runtime_type VARCHAR(10) DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS runtime VARCHAR(50) DEFAULT 'reaction-v1',
  ADD COLUMN IF NOT EXISTS runtime_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS execution_model VARCHAR(20) DEFAULT 'real-time';

-- Database constraints: don't depend exclusively on Node.js validation
ALTER TABLE game_matches
  ADD CONSTRAINT chk_game_version_positive CHECK (game_version > 0),
  ADD CONSTRAINT chk_runtime_version_positive CHECK (runtime_version > 0),
  ADD CONSTRAINT chk_runtime_type CHECK (runtime_type IN ('app', 'web')),
  ADD CONSTRAINT chk_execution_model CHECK (execution_model IN ('turn-based', 'real-time', 'round-based', 'simultaneous'));

-- Game config pinning: snapshot config at match creation for deterministic replay
ALTER TABLE game_matches
  ADD COLUMN IF NOT EXISTS config_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS config_snapshot JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS random_seed VARCHAR(64);
```

**Effort:** ~2 days

---

## PHASE 4: EVENT-DRIVEN INTERNALS (Week 4–5)

> Every state mutation produces events. Events feed analytics, anti-cheat, replays, and auditing.

### 4.1 — Event Schema

**New file:** `taddle-box/src/modules/game/engine/EventTypes.js`

```js
const EVENT_TYPES = {
  // Lifecycle
  MATCH_CREATED: 'MATCH_CREATED',
  PLAYER_JOINED: 'PLAYER_JOINED',
  MATCH_STARTED: 'MATCH_STARTED',
  MATCH_PAUSED: 'MATCH_PAUSED',
  MATCH_RESUMED: 'MATCH_RESUMED',
  MATCH_FINISHED: 'MATCH_FINISHED',
  MATCH_ARCHIVED: 'MATCH_ARCHIVED',
  
  // Gameplay
  MOVE: 'MOVE',
  COMMAND_EXECUTED: 'COMMAND_EXECUTED',
  STATE_CHANGED: 'STATE_CHANGED',
  ROUND_STARTED: 'ROUND_STARTED',
  ROUND_ENDED: 'ROUND_ENDED',
  TIMER_EXPIRED: 'TIMER_EXPIRED',
  
  // Player events
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED: 'PLAYER_RECONNECTED',
  PLAYER_FORFEITED: 'PLAYER_FORFEITED',
  PLAYER_TIMED_OUT: 'PLAYER_TIMED_OUT',
  
  // Anti-cheat
  SUSPICIOUS_MOVE: 'SUSPICIOUS_MOVE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Rewards
  XP_AWARDED: 'XP_AWARDED',
  XP_DEDUCTED: 'XP_DEDUCTED',
  LEVEL_UP: 'LEVEL_UP',
  
  // Chat
  CHAT_MESSAGE: 'CHAT_MESSAGE',
};
```

### 4.1A — Reward Idempotency (Critical for XP/Wallet/Coins)

> Reward processing must be independently idempotent. Even if `MATCH_FINISHED`
> is delivered twice, rewards must only be awarded once.

```sql
-- Idempotent reward table: UNIQUE constraint prevents duplicate awards
CREATE TABLE reward_claims (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL,
  user_id UUID NOT NULL,
  reward_type VARCHAR(50) NOT NULL,  -- 'xp', 'coins', 'badge'
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, user_id, reward_type)  -- prevents duplicate awards
);
```

**Usage:**
```js
// In RewardService:
async function awardXP(matchId, userId, amount) {
  try {
    await pool.query(
      'INSERT INTO reward_claims (match_id, user_id, reward_type, amount) VALUES ($1, $2, $3, $4)',
      [matchId, userId, 'xp', amount]
    );
    // Actually award XP
    await pool.query('UPDATE users SET xp = xp + $1 WHERE id = $2', [amount, userId]);
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      // Already awarded — no-op (idempotent)
      console.log(`[RewardService] XP already awarded for match ${matchId}, user ${userId}`);
      return;
    }
    throw err;
  }
}
```

**Why this matters:** If `MATCH_FINISHED` is delivered twice (due to outbox retry, network glitch, etc.), the second `awardXP` call will hit the UNIQUE constraint and no-op. XP/wallet/coins have real value — never double-award.

### 4.2 — Persistent Event Log with Sequence Numbers

> Sequence is truth. Timestamps are metadata.

```sql
CREATE TABLE game_events (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES game_matches(id),
  sequence_number INTEGER NOT NULL,  -- deterministic ordering
  event_type VARCHAR(50) NOT NULL,
  user_id UUID,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, sequence_number)   -- deterministic replay constraint
);

CREATE INDEX idx_game_events_match ON game_events(match_id, sequence_number);
CREATE INDEX idx_game_events_type ON game_events(event_type);
CREATE INDEX idx_game_events_user ON game_events(user_id);
```

### 4.3 — Outbox Pattern for Critical Events

> For security-critical events (XP awarded, match completed, suspicious moves),
> use PostgreSQL transactional outbox instead of fire-and-forget.

```sql
-- Transactional outbox table with retry + dead-letter support
CREATE TABLE event_outbox (
  id BIGSERIAL PRIMARY KEY,
  aggregate_id UUID NOT NULL,  -- match_id
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_unprocessed ON event_outbox(created_at)
  WHERE processed_at IS NULL AND attempt_count < 5;
CREATE INDEX idx_outbox_dead_letter ON event_outbox(event_type, created_at)
  WHERE attempt_count >= 5;
```

**Usage:** In the same PostgreSQL transaction that updates match state:
```sql
BEGIN;
  -- Update match state
  UPDATE game_matches SET metadata = $1 WHERE id = $2;
  -- Append to outbox (critical domain event)
  INSERT INTO event_outbox (aggregate_id, event_type, payload)
    VALUES ($2, 'MATCH_FINISHED', $3);
COMMIT;
```

**Worker** (separate process) polls outbox with FOR UPDATE SKIP LOCKED, retries, and dead-letter:
```js
const MAX_ATTEMPTS = 5;

async function processOutbox() {
  const { rows } = await pool.query(
    `SELECT * FROM event_outbox
     WHERE processed_at IS NULL AND attempt_count < $1
     ORDER BY created_at
     LIMIT 100
     FOR UPDATE SKIP LOCKED`,
    [MAX_ATTEMPTS]
  );
  
  for (const event of rows) {
    try {
      await pool.query('BEGIN');
      
      // Re-check lock (another worker may have picked it up)
      const { rows: locked } = await pool.query(
        'UPDATE event_outbox SET attempt_count = attempt_count + 1, last_attempt_at = NOW() WHERE id = $1 AND processed_at IS NULL RETURNING *',
        [event.id]
      );
      if (locked.length === 0) { await pool.query('COMMIT'); continue; }
      
      await publishToRedis(event);  // or Kafka
      
      await pool.query(
        'UPDATE event_outbox SET processed_at = NOW() WHERE id = $1',
        [event.id]
      );
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`[Outbox] Failed event ${event.id} (attempt ${event.attempt_count + 1}):`, err.message);
      
      // Store error for debugging
      await pool.query(
        'UPDATE event_outbox SET last_error = $1 WHERE id = $2',
        [err.message, event.id]
      );
      
      if (event.attempt_count + 1 >= MAX_ATTEMPTS) {
        // Dead-letter: alert immediately
        console.error(`[DEAD LETTER] Event ${event.id} (${event.event_type}) exceeded ${MAX_ATTEMPTS} attempts. Needs manual intervention.`);
        // TODO: alert to monitoring system (PagerDuty, Slack, etc.)
      }
    }
  }
}
```

### 4.4 — Redis: Hot State Only

**File:** `taddlebox/src/modules/game/engine/EventStore.js`

```js
static async appendEvent(matchId, event, ttlSeconds = 3600 * 24) {
  // Redis: fast read for active matches only
  const key = `match:${matchId}:events`;
  const serializedEvent = JSON.stringify({ timestamp: Date.now(), ...event });
  await redis.rpush(key, serializedEvent);
  await redis.expire(key, ttlSeconds);
  // PostgreSQL persistence handled by the outbox pattern above
}
```

### 4.4 — Anti-Cheat Event Consumer

```js
// In the event consumer (can be a separate process later)
const SUSPICIOUS_PATTERNS = {
  TAP_RUSH: (events) => {
    const taps = events.filter(e => e.event_type === 'COMMAND_EXECUTED' && e.payload.commandType === 'TAP');
    if (taps.length > 100) return 'EXCESSIVE_TAPS';
    // Check for inhuman tap intervals
    for (let i = 1; i < taps.length; i++) {
      if (taps[i].created_at - taps[i-1].created_at < 50) return 'SUPERHUMAN_SPEED';
    }
    return null;
  },
  WORD_RUSH: (events) => {
    const words = events.filter(e => e.event_type === 'COMMAND_EXECUTED' && e.payload.commandType === 'WORD_SUBMIT');
    // Words submitted faster than humanly possible
    for (let i = 1; i < words.length; i++) {
      if (words[i].created_at - words[i-1].created_at < 500) return 'AUTOMATED_INPUT';
    }
    return null;
  },
};
```

**Effort:** ~5 days

---

## PHASE 5: CLIENT-SIDE GAME RUNTIME REGISTRY (Week 5–6)

> Replace the hardcoded `GAME_COMPONENTS` map with a **runtime-driven GameHost** that the backend populates via a single unified registry.
>
> ```text
> GameHost
>    │
>    ├── runtimeType = app
>    │       ↓
>    │   AppRuntimeRegistry
>    │       ↓
>    │   board-v1 / quiz-v1 / reaction-v1 / ...
>    │
>    └── runtimeType = web
>            ↓
>        WebGameRuntime
> ```

### 5.1 — Game Registry API

**New endpoint:** `GET /api/games/registry`

```json
{
  "games": [
    {
      "id": "chess",
      "slug": "chess",
      "name": "Chess",
      "runtimeType": "app",
      "runtime": "chess-v1",
      "runtimeVersion": 1,
      "gameVersion": 1,
      "executionModel": "turn-based",
      "enabled": true,
      "entryFee": 15,
      "maxXp": 100,
      "config": {
        "turnTimeout": 600000,
        "maxPlayers": 2
      }
    },
    {
      "id": "ludo",
      "slug": "ludo",
      "name": "Ludo",
      "runtimeType": "app",
      "runtime": "board-v1",
      "runtimeVersion": 1,
      "gameVersion": 3,
      "executionModel": "turn-based",
      "enabled": true,
      "entryFee": 10,
      "maxXp": 25,
      "config": {
        "turnTimeout": 30000,
        "maxPlayers": 4
      }
    },
    {
      "id": "tap-rush",
      "slug": "tap-rush",
      "name": "Tap Rush",
      "runtimeType": "app",
      "runtime": "reaction-v1",
      "runtimeVersion": 1,
      "gameVersion": 1,
      "executionModel": "real-time",
      "enabled": true,
      "entryFee": 5,
      "maxXp": 35,
      "config": {
        "duration": 20,
        "targetCount": 15
      }
    },
    {
      "id": "word-blast",
      "slug": "word-blast",
      "name": "Word Blast",
      "runtimeType": "web",
      "runtime": "web-v1",
      "runtimeVersion": 1,
      "gameVersion": 1,
      "executionModel": "round-based",
      "enabled": true,
      "entryFee": 5,
      "maxXp": 20,
      "bundle": {
        "url": "https://cdn.taddle.com/games/word-blast/v1/index.html",
        "hash": "sha256:abc123...",
        "size": 512000
      },
      "ageRating": "4+",
      "config": {
        "rounds": 3,
        "timerPerRound": 60
      }
    }
  ]
}
```

### 5.2 — Client-Side Game Runtime Registry

**New file:** `taddlebox-app/src/games/GameRuntimeRegistry.ts`

```ts
type RuntimeType = 'app' | 'web';

// ── App runtimes: permanent capabilities shipped in the binary ────────────
// These are the generic game engines. Adding a new runtime requires an app
// update. Adding a new GAME using an existing runtime is backend-only.
//
// Example: board-v1 handles Ludo, Checkers, Snakes & Ladders, etc.
//          quiz-v1 handles any quiz/trivia game.
//          reaction-v1 handles TapRush-style timed reaction games.
const APP_RUNTIMES: Record<string, React.LazyExoticComponent<any>> = {
  'chess-v1':        React.lazy(() => import("../../components/games/ChessGame")),
  'board-v1':        React.lazy(() => import("../../components/games/LudoGame")),
  'snake-ladder-v1': React.lazy(() => import("../../components/games/SnakeLadderGame")),
  'scribble-v1':     React.lazy(() => import("../../components/games/ScribbleGame")),
  'word-v1':         React.lazy(() => import("../../components/games/WordRushGame")),
  'reaction-v1':     React.lazy(() => import("../../components/games/TapRushGame")),
  'memory-v1':       React.lazy(() => import("../../components/games/MemoryGridGame")),
};

// ── Web runtime: loaded from CDN into sandboxed WebView ───────────────────
// The WebView is sandboxed: no native APIs, no eval(), postMessage only.
// Use ONLY for simple casual games. Complex games should use app runtimes.
const WEB_BUNDLES: Record<string, { url: string; hash: string }> = {};

/**
 * Check if a game's runtime is supported by the current binary.
 * App runtimes: check if the runtime exists in APP_RUNTIMES.
 * Web runtimes: always supported (WebView handles it).
 */
function isRuntimeSupported(runtimeType: RuntimeType, runtime: string): boolean {
  if (runtimeType === 'app') return runtime in APP_RUNTIMES;
  if (runtimeType === 'web') return true;
  return false;
}
```

### 5.3 — GameHost Component (runtime-driven)

> GameHost routes by `runtimeType` (client-side). `executionModel` (server-side) is handled by the GameExecutionManager and is invisible to the client.

**New file:** `taddlebox-app/src/components/games/GameHost.tsx`

```tsx
import React from 'react';
import { APP_RUNTIMES } from '../../games/GameRuntimeRegistry';
import WebGameHost from './WebGameHost';

// GameHost only cares about runtimeType and runtime.
// executionModel is a server-side concept — the GameExecutionManager
// on the backend selects the right orchestration (turn-based, real-time, etc.)
// regardless of whether the client is a native component or a WebView.

interface Props {
  game: {
    runtimeType: 'app' | 'web';
    runtime: string;
    executionModel?: string; // 'turn-based' | 'real-time' | 'round-based' | 'simultaneous'
    config?: Record<string, any>;
    bundle?: { url: string; hash: string };
  };
  gameProps: Record<string, any>;  // socket, session, players, etc.
}

export default function GameHost({ game, gameProps }: Props) {
  if (game.runtimeType === 'web') {
    return (
      <WebGameHost
        bundleUrl={game.bundle?.url || ''}
        bundleHash={game.bundle?.hash}
        gameConfig={game.config || {}}
        onCommand={(cmd) => gameProps.gameSocket?.emit('MOVE', cmd)}
        onStateUpdate={() => {}} // Server-authoritative: ignore client state
        onResult={(result) => gameProps.onComplete?.(result)}
      />
    );
  }

  // runtimeType = app
  const GameComponent = APP_RUNTIMES[game.runtime];
  if (!GameComponent) {
    throw new Error(`Unknown app runtime: ${game.runtime}`);
  }

  return (
    <React.Suspense fallback={<BrandedGameLoader />}>
      <GameComponent {...gameProps} />
    </React.Suspense>
  );
}
```

### 5.4 — Refactor GamePlayModal

**File:** `taddlebox-app/src/screens/main/GamesScreen.tsx`

Before (hardcoded per-game):
```tsx
const GAME_COMPONENTS: Record<string, any> = {
  chess: ChessGame,
  ludo: LudoGame,
  // ...
};
```

After (runtime-driven):
```tsx
import GameHost from '../../components/games/GameHost';

// In GamePlayModal render:
<GameHost
  game={{
    runtimeType: session.game.runtimeType || 'app',
    runtime: session.game.runtime || 'reaction-v1',
    config: (session.game as any).config,
    bundle: (session.game as any).bundle,
  }}
  gameProps={{
    sessionId: session.sessionId,
    matchId: session.matchId,
    wsToken: session.wsToken,
    players: session.players,
    user,
    onComplete: handleComplete,
    // ... other props
  }}
/>
```

**Effort:** ~5 days

---

## STORE POLICY REFERENCE

### Apple App Store (guideline 4.7)

Apple explicitly allows HTML5/JavaScript mini-games, streaming games, plug-ins, and emulators under guideline 4.7. Requirements include:
- Software index/metadata for hosted content
- Age restrictions handling
- Content reporting/moderation
- Privacy compliance
- Don't expose native APIs to downloaded software without permission
- Consider Apple's Mini Apps Partner Program for full compliance

### Google Play Store

More restrictive than Apple:
- Apps must not dynamically download and execute remote code that introduces functionality not present during review
- Interpreted code (JS in WebView) can be exempt from native code restrictions, BUT must not violate Play policies
- Prohibits downloading Dex/JAR/.so from outside Google Play

### Our approach

1. **`runtimeType: app` is the guaranteed safe foundation** — all complex games ship as React Native components in the binary, using the app's existing runtimes (board-v1, reaction-v1, etc.)
2. **`runtimeType: web` is optional** — used only for simple casual games (quiz, puzzle, word), reviewed before enabling. Classified as 🟡 policy-sensitive on Google Play — not guaranteed safe
3. **Backend controls everything except the binary** — configs, enable/disable, versions, assets, entry fees, XP, timers, execution model
4. **No arbitrary code execution** — web games use sandboxed WebView with strict originWhitelist and postMessage-only communication
5. **App update required only when you need a new runtime** (e.g., 3D, physics, AR) — adding a new game using an existing runtime is backend-only

---

## PHASE 6: COMMAND PIPELINE & SECURITY (Week 6–7)

### 6.1 — Security Pipeline (every command goes through this)

```text
Socket connected
     ↓
Authentication (JWT + match token)
     ↓
Authorization (user belongs to match?)
     ↓
Match state check (is match ACTIVE?)
     ↓
Schema validation (command payload matches plugin schema?)
     ↓
Rate limit (Redis, per-user + per-match)
     ↓
Idempotency (deduplicate by commandId)
     ↓
Concurrency check (expectedRevision === stateRevision?)
     ↓
Plugin.validateCommand()
     ↓
Plugin.executeCommand()
     ↓
State revision increment
     ↓
Event append
     ↓
State persist
     ↓
SYNC to clients
```

### 6.2 — Redis-Based Rate Limiter

**New file:** `taddle-box/src/modules/game/engine/RateLimiter.js`

```js
const redis = require('../../../config/redis');

/**
 * Distributed rate limiter using Redis sliding window.
 * Multiple PM2 instances all share the same Redis counter.
 * Two fail modes: SECURITY_CRITICAL rejects on Redis failure;
 * NON_CRITICAL uses local emergency limiter.
 */
class GameRateLimiter {
  constructor() {
    this.defaultLimits = {
      'tap-rush': 15,     // taps per second
      'word-rush': 2,     // words per second
      'scribble': 10,     // strokes per second
      'chess': 1,         // moves per 3 seconds
      'ludo': 1,          // moves per 2 seconds
      'snake-ladder': 1,  // moves per 2 seconds
      'memory-grid': 5,   // flips per second
    };
    // Local emergency limiter state (used when Redis is unavailable)
    this._localCounts = new Map(); // key → { count, windowStart }
    this._redisHealthy = true;
    this._lastRedisCheck = 0;
  }

  /**
   * SECURITY_CRITICAL: Redis unavailable → reject or use local emergency limiter.
   * For competitive games with XP/rewards, we NEVER fail open.
   * @param {'SECURITY_CRITICAL'|'NON_CRITICAL'} mode
   */
  async check(userId, matchId, gameSlug, maxPerSecond, mode = 'SECURITY_CRITICAL') {
    const limit = maxPerSecond || this.defaultLimits[gameSlug] || 10;
    const window = 1; // 1 second window
    const key = `ratelimit:${matchId}:${userId}`;
    
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, window);
      }
      this._redisHealthy = true;
      return count <= limit;
    } catch (err) {
      this._redisHealthy = false;
      console.error('[RateLimiter] Redis error:', err.message);
      
      // SECURITY_CRITICAL: reject immediately, alert, and use local emergency limiter
      if (mode === 'SECURITY_CRITICAL') {
        this._alertRedisDown('SECURITY_CRITICAL rate limit bypassed');
        // Local emergency limiter: very conservative limits
        return this._localEmergencyCheck(key, Math.min(limit, 2)); // cap at 2/sec
      }
      // NON_CRITICAL: use local emergency limiter with standard limits
      return this._localEmergencyCheck(key, limit);
    }
  }

  /** Local in-memory rate limiter as emergency fallback. Very conservative. */
  _localEmergencyCheck(key, limit) {
    const now = Date.now();
    const entry = this._localCounts.get(key);
    if (!entry || now - entry.windowStart > 1000) {
      this._localCounts.set(key, { count: 1, windowStart: now });
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  }

  _alertRedisDown(message) {
    // TODO: emit to monitoring/alerting system (PagerDuty, Datadog, etc.)
    console.error(`[SECURITY ALERT] ${message}`);
  }

  /** Check match-wide command rate (anti-flood) */
  async checkMatch(matchId, maxPerSecond = 50) {
    const key = `ratelimit:match:${matchId}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 1);
      return count <= maxPerSecond;
    } catch {
      // Anti-flood is also security-critical: reject on Redis failure
      this._alertRedisDown('Match rate limiter Redis unavailable');
      return this._localEmergencyCheck(key, Math.min(maxPerSecond, 5));
    }
  }
}

module.exports = new GameRateLimiter();
```

### 6.3 — Idempotency Store

**New file:** `taddle-box/src/modules/game/engine/CommandDeduplicator.js`

```js
const redis = require('../../../config/redis');

const COMMAND_STATES = {
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

/**
 * Prevents duplicate command execution using atomic reservation.
 * Uses SET NX EX to prevent the TOCTOU race condition where two
 * concurrent requests both see 'not found' and both execute.
 */
class CommandDeduplicator {
  /**
   * Atomically reserve a command for processing.
   * If the key doesn't exist, sets it to PROCESSING and returns true.
   * If the key exists (duplicate or in-progress), returns false.
   */
  async tryReserve(matchId, commandId, ttlSeconds = 300) {
    const key = `cmd:${matchId}:${commandId}`;
    const acquired = await redis.set(
      key,
      COMMAND_STATES.PROCESSING,
      'NX',
      'EX',
      ttlSeconds
    );
    if (acquired) {
      return { acquired: true, state: COMMAND_STATES.PROCESSING };
    }
    // Key exists — check if it's a completed result or still processing
    const existing = await redis.get(key);
    if (existing === COMMAND_STATES.PROCESSING) {
      return { acquired: false, state: COMMAND_STATES.PROCESSING };
    }
    if (existing === COMMAND_STATES.COMPLETED || existing === COMMAND_STATES.FAILED) {
      const result = await redis.get(`${key}:result`);
      return { acquired: false, state: existing, result: result ? JSON.parse(result) : null };
    }
    return { acquired: false, state: null };
  }

  /** Mark command as completed with its result */
  async complete(matchId, commandId, result, ttlSeconds = 300) {
    const key = `cmd:${matchId}:${commandId}`;
    await redis.set(key, COMMAND_STATES.COMPLETED, 'EX', ttlSeconds);
    await redis.set(`${key}:result`, JSON.stringify(result), 'EX', ttlSeconds);
  }

  /** Mark command as failed */
  async fail(matchId, commandId, error, ttlSeconds = 300) {
    const key = `cmd:${matchId}:${commandId}`;
    await redis.set(key, COMMAND_STATES.FAILED, 'EX', ttlSeconds);
    await redis.set(`${key}:result`, JSON.stringify({ error: error.message }), 'EX', ttlSeconds);
  }

  /** Legacy: check without reservation (for read-only lookups) */
  async check(matchId, commandId, ttlSeconds = 300) {
    const key = `cmd:${matchId}:${commandId}`;
    const existing = await redis.get(key);
    if (existing === COMMAND_STATES.COMPLETED || existing === COMMAND_STATES.FAILED) {
      const result = await redis.get(`${key}:result`);
      return { duplicate: true, result: result ? JSON.parse(result) : null };
    }
    return { duplicate: false };
  }
}

module.exports = new CommandDeduplicator();
```

### 6.4 — Concurrency Check (State Revision)

```js
// In MatchManager.handlePlayerMove:
//
// IMPORTANT: Client-provided expectedRevision is NEVER trusted as authoritative state.
// It is purely a staleness hint — the server compares against the authoritative
// match state revision from the match actor / single-writer.
if (command.expectedRevision !== undefined && command.expectedRevision !== state.stateRevision) {
  throw new Error('STALE_STATE'); // Client must resync
}
// After successful execution:
state.stateRevision = (state.stateRevision || 0) + 1;
```

### 6.4A — Match Actor: Single-Writer Architecture

> **This is the most important architectural improvement.** One logical writer per match makes
> idempotency, state revision, timers, reconnect, replay, and anti-cheat dramatically easier.

```text
                   ┌──────────────────────────────────┐
Socket A ─────────►│                                  │
Socket B ─────────►│   Match Actor (match-123)        │
Socket C ─────────►│   One logical owner per match    │
                   │                                  │
                   └──────────────┬───────────────────┘
                                  │
                            authoritative
                               state
```

**Each match has exactly ONE logical writer.** All commands are serialized through that owner:

```text
command 1 → match actor → sequential processing
command 2 → match actor → sequential processing
command 3 → match actor → sequential processing
command 4 → match actor → sequential processing
```

**Benefits:**
- Eliminates race conditions entirely — no concurrent state mutations
- Idempotency becomes trivial — one owner knows if a command is being processed
- State revision check is always against the single authoritative state
- Timer management is deterministic
- Reconnect/replay is deterministic
- Anti-cheat analysis is straightforward

**Implementation options:**

1. **Redis distributed lock per match (simpler):**
   ```js
   // Acquire exclusive ownership before processing any command
   const lock = await redlock.acquire([`lock:match:${matchId}`], 5000);
   try {
     // Load authoritative state
     const state = await loadMatchState(matchId);
     // Process command (idempotency + revision check happen here)
     const newState = await processCommand(state, command);
     // Save state
     await saveMatchState(matchId, newState);
   } finally {
     await lock.release();
   }
   ```

2. **Actor model (Colyseus / Cloudflare Durable Objects / Elixir processes):**
   - One lightweight process per match
   - Naturally serializes all commands
   - Crash isolation per match
   - Preferred for high-scale deployments

**Atomic state revision + idempotency (single-writer guarantees):**

```js
// With a match actor, this is a single sequential operation:
const result = await deduplicator.tryReserve(matchId, commandId);
if (!result.acquired) {
  // Duplicate or currently processing — return cached result
  return result;
}

try {
  // Load authoritative state (single writer = no race)
  const state = await loadMatchState(matchId);
  
  // Client revision is only a staleness hint, never authoritative
  if (command.expectedRevision !== undefined && command.expectedRevision !== state.stateRevision) {
    await deduplicator.fail(matchId, commandId, new Error('STALE_STATE'));
    throw new Error('STALE_STATE');
  }
  
  // Execute
  const newState = await processCommand(state, command);
  
  // Save + mark complete atomically
  await saveMatchState(matchId, newState);
  await deduplicator.complete(matchId, commandId, newState);
  return newState;
} catch (err) {
  await deduplicator.fail(matchId, commandId, err);
  throw err;
}
```

### 6.5 — Command Schema Validation

```js
// In the MOVE handler, BEFORE calling plugin.validateCommand:
function validateCommandSchema(plugin, command) {
  const schemas = plugin.constructor.COMMAND_SCHEMAS;
  if (!schemas || !schemas[command.type]) {
    throw new Error(`Unknown command type: ${command.type}`);
  }
  const schema = schemas[command.type];
  // Validate each field against the schema
  // Reject: unknown fields, wrong types, oversized values, NaN, Infinity
  // Use a lightweight validator (no heavy deps)
  for (const [field, expectedType] of Object.entries(schema)) {
    const value = command.payload[field];
    if (value === undefined) throw new Error(`Missing required field: ${field}`);
    if (typeof value !== expectedType) throw new Error(`Invalid type for ${field}: expected ${expectedType}`);
  }
  // Check payload size
  const size = Buffer.byteLength(JSON.stringify(command.payload));
  if (size > (plugin.constructor.SECURITY_POLICY?.maxPayloadBytes || 4096)) {
    throw new Error('Payload too large');
  }
}
```

### 6.6 — Anti-Cheat Audit Table

```sql
CREATE TABLE anti_cheat_events (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL,
  user_id UUID NOT NULL,
  game_slug VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'LOW',
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_anti_cheat_user ON anti_cheat_events(user_id);
CREATE INDEX idx_anti_cheat_severity ON anti_cheat_events(severity) WHERE NOT reviewed;
```

### 6.7 — Kill Switch

```js
// Runtime kill switch — disable entire game categories instantly
const killSwitches = {
  games: {},        // { 'chess': true } → disable chess
  runtimes: {},     // { 'web-v1': true } → disable all web games
  versions: {},     // { 'ludo@2': true } → disable ludo v2
};

// Check before allowing new matches
if (killSwitches.games[gameSlug] || killSwitches.runtimes[runtime]) {
  throw new Error('Game temporarily disabled');
}
```

### 6.8 — No Secrets in Game State (Hard Platform Rule)

> Game state must NEVER contain sensitive data. This is a hard platform rule.

```text
Game state must NEVER contain:
  ❌ API secrets
  ❌ DB credentials
  ❌ Private signing keys
  ❌ Internal service tokens
  ❌ Unnecessary PII (beyond userId)
```

And NEVER serialize secrets into:
```text
  ❌ Redis
  ❌ PostgreSQL event payload
  ❌ Replay data
  ❌ Analytics
```

Enforce in tests:
```js
// In invariant testing:
assertInvariants(state) {
  const serialized = JSON.stringify(state.pluginState);
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`State contains sensitive data matching: ${pattern}`);
    }
  }
}
```

### 6.9 — Admin Audit Trail

> Every publish, config change, and kill switch activation must be immutably logged.

```sql
CREATE TABLE admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,  -- 'game.publish', 'config.update', 'killswitch.activate', etc.
  target_type VARCHAR(50) NOT NULL,  -- 'game', 'runtime', 'config', 'match'
  target_id VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_admin ON admin_audit_log(admin_user_id, created_at);
CREATE INDEX idx_audit_action ON admin_audit_log(action, created_at);
```

**Effort:** ~4 days

---

## PHASE 7: GAME CONFIGURATION VIA DATABASE (Week 7)

> Today, game configs (turn timeout, round duration, max players) are hardcoded constants in the plugins. Move them to the database so they can be changed without deployment.

### 7.1 — Unified Game Table Schema

```sql
-- One game table, one model. runtime_type tells you WHERE the game runs.
-- runtime tells you WHICH runtime executes it.
ALTER TABLE game
  ADD COLUMN IF NOT EXISTS runtime_type VARCHAR(10) DEFAULT 'app',  -- 'app' | 'web'
  ADD COLUMN IF NOT EXISTS runtime VARCHAR(50) DEFAULT 'reaction-v1',
  ADD COLUMN IF NOT EXISTS runtime_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS game_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS execution_model VARCHAR(20) DEFAULT 'real-time';  -- 'turn-based' | 'real-time' | 'round-based' | 'simultaneous'

-- Web-specific fields (only used when runtime_type = 'web')
ALTER TABLE game
  ADD COLUMN IF NOT EXISTS web_bundle_url TEXT,
  ADD COLUMN IF NOT EXISTS web_bundle_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS web_bundle_hash VARCHAR(100),
  ADD COLUMN IF NOT EXISTS max_bundle_size_bytes INTEGER DEFAULT 2097152;  -- configurable per runtime

-- Database CHECK constraints: don't depend exclusively on Node.js validation
ALTER TABLE game
  ADD CONSTRAINT chk_game_runtime_type CHECK (runtime_type IN ('app', 'web')),
  ADD CONSTRAINT chk_game_version CHECK (game_version > 0),
  ADD CONSTRAINT chk_game_runtime_version CHECK (runtime_version > 0),
  ADD CONSTRAINT chk_game_max_players CHECK (metadata->>'maxPlayers' IS NULL OR (metadata->>'maxPlayers')::int > 0),
  ADD CONSTRAINT chk_game_execution_model CHECK (execution_model IN ('turn-based', 'real-time', 'round-based', 'simultaneous'));

-- Config versioning: pin config at match creation for deterministic replay
-- (config_version and config_snapshot are on game_matches, not game table)

-- Config JSONB already exists in metadata; ensure it includes:
-- {
--   "turnTimeoutMs": 60000,
--   "roundTimeoutMs": 90000,
--   "gameDurationMs": 20000,
--   "maxPlayers": 2,
--   "minPlayers": 2,
--   "reconnectWindowMs": 60000,
--   "rateLimits": { "movesPerSecond": 10 }
-- }
```

### 7.2 — Game Registry Query

```sql
SELECT id, slug, name, description, emoji, thumbnail,
       runtime_type, runtime, runtime_version, game_version,
       execution_model,
       enabled, metadata,
       web_bundle_url, web_bundle_version, web_bundle_hash
FROM game
WHERE enabled = true
ORDER BY name;
```

### 7.3 — Load Config in Game Plugin Constructor

```js
constructor(matchData) {
  super(matchData);
  this.config = matchData.config || {};  // from DB metadata
  this.turnTimeout = this.config.turnTimeoutMs || 60000;
  this.roundTimeout = this.config.roundTimeoutMs || 90000;
}
```

**Effort:** ~2 days

---

## PHASE 8: STATE DIFF COMPRESSION (Week 8)

> Send only changed fields in SYNC events instead of full state every time.

### 8.1 — StateDiff Utility

**New file:** `taddle-box/src/modules/game/engine/StateDiff.js`

```js
class StateDiff {
  /** Compare two state objects and return only changed keys */
  static diff(oldState, newState) {
    if (!oldState) return { full: newState };
    
    const changes = {};
    const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);
    
    for (const key of allKeys) {
      const oldVal = JSON.stringify(oldState[key]);
      const newVal = JSON.stringify(newState[key]);
      if (oldVal !== newVal) {
        changes[key] = newState[key];
      }
    }
    
    return Object.keys(changes).length > 0 ? changes : null;
  }

  /** Apply a patch to a state object */
  static patch(state, patch) {
    if (patch.full) return patch.full;
    return { ...state, ...patch };
  }
}
```

### 8.2 — Integrate Into SYNC Emission

> **IMPORTANT:** Don't use `socket._lastSyncState` because player-specific views mean
> each socket may have a different projection. Use `socket.lastProjectedRevision` and
> generate the diff against the same player's projected state.

```js
// In game.socket.js MOVE handler
const projectedView = plugin.getPlayerView(updatedState, s.userId);
const previousProjected = socket._lastProjectedView || {};
const diff = StateDiff.diff(previousProjected, projectedView);

if (diff) {
  s.emit(EVENTS.SYNC, {
    state: diff,
    patch: true,  // tells client to merge, not replace
    valid: true,
    stateRevision: updatedState.stateRevision,
    moveType: moveData.type,
    userId,
  });
  socket._lastProjectedView = { ...previousProjected, ...diff };
  socket.lastProjectedRevision = updatedState.stateRevision;
}
```

### 8.3 — Client-Side Merge

```tsx
// In each game component's SYNC handler
onSYNC: (data) => {
  if (data.patch) {
    setState(prev => ({ ...prev, ...data.state }));
  } else {
    setState(data.state);
  }
}
```

**Effort:** ~2 days

---

## PHASE 9: GAME PROCESS ISOLATION (Week 9–10)

> Extract the game engine into a separate process so a plugin crash doesn't take down the API.

### 9.1 — Game Engine Process

**New file:** `taddle-box/src/game-engine/index.js`

```js
const express = require('express');
const { Server } = require('socket.io');
const GameRegistry = require('../modules/game/engine');
const { MatchManager } = require('../modules/game/engine/MatchManager');

const ENGINE_PORT = process.env.GAME_ENGINE_PORT || 3002;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { /* ... */ });

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', games: GameRegistry.plugins.size }));

// Load all game plugins
require('../modules/game/engine');

// Setup game socket namespace
const gameNs = io.of('/game');
require('../sockets/game.socket').setupGameSocket(io, gameNs);

server.listen(ENGINE_PORT, () => {
  console.log(`[GameEngine] Running on port ${ENGINE_PORT}`);
});
```

### 9.2 — API ↔ Engine Communication

```js
// In game.service.js (API process)
const { io: engineIo } = require('socket.io-client')(
  process.env.GAME_ENGINE_URL || 'http://localhost:3002'
);

// When API starts a match, notify the engine
async function startMatch(matchId, gameSlug, players) {
  engineIo.emit('MATCH_CREATED', { matchId, gameSlug, players });
}
```

### 9.3 — Process Management

```json
// package.json
{
  "scripts": {
    "start": "node src/index.js",
    "start:engine": "node src/game-engine/index.js",
    "dev": "concurrently \"npm run dev:api\" \"npm run dev:engine\""
  }
}
```

**Effort:** ~5 days

---

## PHASE 10: ANALYTICS & REPLAY (Week 10–11)

### 10.1 — Match Replay Endpoint

> **Sequence is truth.** Replay queries MUST order by `sequence_number`, not `created_at`.
> Timestamps are metadata; sequence numbers are the deterministic ordering.

```sql
-- Replay query: get all events for a match in order
SELECT sequence_number, event_type, user_id, payload, created_at
FROM game_events
WHERE match_id = $1
ORDER BY sequence_number ASC;
```

```js
// New endpoint: GET /api/games/match/:matchId/replay
// Authorization: authenticated AND (participant OR admin/moderator) AND replay enabled
router.get('/match/:matchId/replay', verifyToken, async (req, res) => {
  const matchId = req.params.matchId;
  const userId = req.user.id;
  
  // 1. Verify token (authentication)
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  // 2. Check if replay is allowed for this match/game
  const match = await pool.query('SELECT * FROM game_matches WHERE id = $1', [matchId]);
  if (!match.rows.length) return res.status(404).json({ error: 'Match not found' });
  
  const matchData = match.rows[0];
  const game = await pool.query('SELECT * FROM game WHERE id = $1', [matchData.game_id]);
  const gameConfig = game.rows[0]?.metadata || {};
  
  if (gameConfig.replayEnabled === false) {
    return res.status(403).json({ error: 'Replay not available for this game' });
  }
  
  // 3. Check if user is authorized to view replay
  const isParticipant = matchData.players?.includes(userId);
  const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';
  
  if (!isParticipant && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized to view this replay' });
  }
  
  // 4. Fetch events ordered by sequence (deterministic replay)
  const { rows } = await pool.query(
    `SELECT sequence_number, event_type, user_id, payload, created_at 
     FROM game_events WHERE match_id = $1 ORDER BY sequence_number ASC`,
    [matchId]
  );
  
  // 5. Apply player view filtering to sensitive events
  const filteredEvents = rows.map(event => {
    // Never expose full state to non-admins — only expose what the participant saw
    if (!isAdmin && event.payload?.fullState) {
      delete event.payload.fullState;
    }
    return event;
  });
  
  res.json({ events: filteredEvents });
});
```

### 10.2 — Player Statistics Aggregation

```sql
CREATE MATERIALIZED VIEW player_game_stats AS
SELECT 
  user_id,
  game_slug,
  COUNT(*) as total_matches,
  SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
  SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
  SUM(CASE WHEN result = 'DRAW' THEN 1 ELSE 0 END) as draws,
  AVG(score) as avg_score,
  MAX(score) as best_score,
  SUM(xp_earned) as total_xp_earned
FROM game_sessions gs
JOIN game_matches gm ON gs.metadata->>'matchGroupId' = gm.id::text
JOIN game g ON gm.game_id = g.id
WHERE gs.status = 'COMPLETED'
GROUP BY user_id, g.slug;

REFRESH MATERIALIZED VIEW CONCURRENTLY player_game_stats;
```

**Effort:** ~3 days

---

## PHASE 11: WEB GAME RUNTIME (Week 12+) — OPTIONAL

> The `web-v1` runtime is the escape hatch for simple casual games.
> `runtimeType: 'web'` + `runtime: 'web-v1'` → the app loads a sandboxed WebView bundle from CDN.
> This is NOT required for the platform to function. App runtimes handle all current games.

### 11.1 — Web Game Bundle Specification

Each web game is a self-contained HTML5 bundle hosted on CDN:

```
games/word-blast/v1/
  ├── index.html        (entry point)
  ├── game.js           (game logic)
  ├── style.css         (styling)
  └── assets/           (images, sounds)
```

**Rules for web game bundles:**
- No external script imports (everything bundled)
- No `eval()`, `new Function()`, or dynamic code loading
- Communication ONLY through `TaddleBridge` (postMessage)
- No access to `localStorage`, `sessionStorage`, cookies (default; game must explicitly justify any exception)
- No access to device APIs (camera, GPS, contacts, etc.)
- Max bundle size: configurable per runtime (default: `maxBundleSizeBytes = 2097152` for web-v1)
- Must pass automated security scan + manual review before deployment
- **No secrets in game state:** game state must NEVER contain API secrets, DB credentials, private signing keys, internal service tokens, or unnecessary PII
- Never serialize secrets into Redis, PostgreSQL event payload, replay, or analytics

### 11.2 — Backend: Web Game Deployment

```js
// game.service.js — register a web game
async function registerWebGame({ slug, name, bundle, config }) {
  await pool.query(
    `INSERT INTO game (slug, name, runtime_type, runtime, runtime_version, game_version, metadata)
     VALUES ($1, $2, 'web', 'web-v1', 1, 1, $3)
     ON CONFLICT (slug) DO UPDATE SET
       runtime_type = EXCLUDED.runtime_type,
       runtime = EXCLUDED.runtime,
       metadata = EXCLUDED.metadata`,
    [slug, name, JSON.stringify({
      bundle: {
        url: bundle.url,
        hash: bundle.hash,
        size: bundle.size,
      },
      ageRating: config.ageRating || '4+',
      ...config
    })]
  );
}
```

### 11.3 — Client: Web Game Security Sandbox

The `WebGameHost` component (defined in Phase 5) enforces:

1. **Origin whitelist:** Only loads from `https://cdn.taddle.com` — validates every navigation, not just initial URL
2. **No native bridge:** WebView has no `react-native` module access
3. **No file access:** `allowFileAccess={false}`
4. **No local storage (default):** `domStorageEnabled={false}` — game must explicitly justify any exception; default disabled
5. **postMessage only:** All communication through `TaddleBridge` with strict schema validation
6. **Signed manifest:** Complete security identity — app verifies the ENTIRE manifest, not just URL/hash:
   ```json
   {
     "gameId": "word-blast",
     "gameVersion": 3,
     "runtime": "web-v1",
     "runtimeVersion": 1,
     "bundleUrl": "https://cdn.taddle.com/games/word-blast/v3/index.html",
     "sha256": "abc123...",
     "size": 512000,
     "issuedAt": "2026-08-23T00:00:00Z",
     "expiresAt": "2027-08-23T00:00:00Z",
     "keyId": "prod-2026-01"
   }
   ```
   **Key rotation:** support multiple `keyId` values over time. Don't hard-code one forever.
7. **Short-lived session token:** WebView never gets the user's auth token. Instead, receives a match-scoped, user-scoped, short-lived, capability-limited game session token:
   ```json
   { "sub": "user", "matchId": "...", "gameId": "word-blast", "scope": ["game:command"], "exp": 123456 }
   ```
8. **Content security:** CSP headers from CDN
9. **Strict navigation:** https-only, exact host, no redirects to unknown hosts, no custom schemes, no intent URLs, no file URLs, no localhost
10. **Fail closed:** If `runtimeType: web` but app doesn't support web runtime version → DO NOT LOAD
11. **Security headers on CDN:** Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy. Correct MIME types for application/javascript, text/html, etc.

### 11.3A — TaddleBridge Schema Validation

> Don't allow arbitrary `postMessage` traffic. Every bridge message must be validated.

```typescript
type BridgeMessage =
  | { type: 'READY' }
  | { type: 'COMMAND'; commandId: string; payload: unknown }
  | { type: 'RESULT_REQUEST' }
  | { type: 'HEARTBEAT' };

// Enforce:
// - Known message types only (unknown → REJECT)
// - Max message size (e.g., 64KB)
// - Allowed command types per game (plugin defines COMMAND_SCHEMAS)
// - Rate limit on bridge messages
// - Origin/source validation (only from known bundle origin)
```

**Validation flow:**
```text
postMessage received
  ↓
Origin check (known bundle origin?)
  ↓
Size check (< max?)
  ↓
Schema validation (known type? valid fields?)
  ↓
Rate limit (per-session)
  ↓
Command type allowlist (game-specific)
  ↓
Accept / Reject
```

### 11.3B — Server-Side Bundle Validation Pipeline

> Don't rely solely on the mobile app to validate bundles.

```text
Upload bundle
  ↓
Hash (SHA-256)
  ↓
Static scan (no eval, no external scripts, no native APIs)
  ↓
Dependency scan (known vulnerabilities)
  ↓
Policy scan (no secrets, no PII, no disallowed patterns)
  ↓
Security review (manual)
  ↓
Sign manifest (asymmetric signature)
  ↓
Publish immutable bundle (CDN serves immutable versioned path)
```

**CDN immutable versioning:** Never mutate `word-blast/v1/` after publishing. Publish to `word-blast/v3/` instead.

### 11.4 — Config Version Pinning

> **Pin configuration at match creation.** Admin changes to turn timeout, round duration, etc.
> must NOT affect existing live matches. Configuration changes only apply to new matches.

```js
// When creating a match, snapshot the current config:
state.configVersion = gameConfig.version || 1;
state.configSnapshot = {
  turnTimeoutMs: gameConfig.turnTimeoutMs,
  roundTimeoutMs: gameConfig.roundTimeoutMs,
  maxPlayers: gameConfig.maxPlayers,
  rateLimits: gameConfig.rateLimits,
  // ... all config that affects gameplay
};
```

**Why:** If admin changes `turnTimeout` from 30s to 60s mid-match, existing matches could suddenly behave differently. Config must be pinned at match creation for deterministic replay.

### 11.5 — RNG Seed Pinning

> For **deterministic replay**, the following must be sufficient to reproduce a match:
> - `gameVersion`
> - `configVersion`
> - `configSnapshot`
> - `initialState`
> - `randomSeed`
> - `event sequence`

```js
// At match creation:
state.randomSeed = crypto.randomBytes(32).toString('hex');

// Plugin uses seeded RNG:
// const rng = seedrandom(state.randomSeed);
// const dice = Math.floor(rng() * 6) + 1;
```

Otherwise replay becomes: "Here's roughly what happened." instead of "We can deterministically reproduce exactly what happened."

### 11.6 — Web Game Lifecycle

```
1. Backend registers web game (runtimeType: web, signed manifest, config)
2. Client fetches GET /games/registry → sees runtimeType: "web"
3. GameHost checks: web runtime supported? → fail if not
4. App verifies signed manifest (asymmetric signature)
5. App generates short-lived game session token
6. GameHost routes to WebGameRuntime → loads bundle.url
7. Bundle loads → sends READY via TaddleBridge
8. Game starts → commands flow through TaddleBridge → socket → server
9. Server GamePlugin validates + executes (server-authoritative)
10. Game ends → sends RESULT via TaddleBridge
11. Server validates result → result overlay shown to player
```

### 11.5 — Release Pipeline

```text
upload bundle → automated scan → security review → policy review → publish → enable
```

Status flow:
```text
DRAFT → REVIEW → APPROVED → PUBLISHED → ENABLED → DISABLED → ROLLED_BACK
```

Every publish creates an immutable audit record:
```text
who, what, old version, new version, bundle hash, config hash, timestamp, reason
```

### 11.6 — Store Policy Compliance

**Apple App Store (guideline 4.7):**
- HTML5 mini-games explicitly allowed
- Requires: software index with universal links, age restrictions, content moderation/reporting, privacy, no native API exposure
- Use Apple's Mini Apps Partner Program for compliance
- Each web game must be listed in app's age rating metadata
- Registry fields: `universalLink`, `ageRating`, `contentCategories`, `reportingEnabled`, `softwareVersion`

**Google Play Store:**
- More restrictive: no dynamically downloaded executable code that introduces functionality not present during review
- Interpreted code (JS in WebView) can be exempt from native code restrictions, BUT must not violate Play policies
- **NOT automatically compliant** merely because content is controlled by the backend
- Each implementation/release should be reviewed against current Play policies
- Classified as 🟡 policy-sensitive — not guaranteed safe

**Mitigation:**
- Web games are opt-in per game (backend `enabled` flag)
- Each game undergoes security review before deployment
- Automated bundle scanning for malicious patterns
- Manual review for games with complex interactions
- Signed manifests prevent bundle tampering
- Short-lived tokens prevent WebView credential theft

**Effort:** ~3 days (on top of Phase 5's GameHost)

---

## WHAT THIS UNLOCKS

After all 11 phases:

1. **Add a new game without app update** (for supported runtimes):
   - Backend: create plugin, register in GameRegistry, add config
   - Client: `runtimeType: app` → already ships the runtime (board-v1, reaction-v1, etc.)
   - Backend: add to `GET /games/registry` → game appears in app
   - Example: add "Checkers" using `board-v1` → backend-only change

2. **Version everything**:
   - `gameVersion` for game logic changes
   - `runtimeVersion` for runtime capability changes
   - Running matches finish on their original version
   - Can A/B test game changes without breaking live matches

3. **Server-authoritative for everything**:
   - Client never determines win/loss
   - Client only sends commands, server validates + applies
   - Player view projection hides all secrets

4. **Anti-cheat built in**:
   - Rate limiting per game type
   - Event-based audit trail
   - Anomaly detection on tap/word patterns
   - Server-authoritative scoring

5. **Process isolation**:
   - Game engine crash → API stays up
   - Can scale game engine independently
   - Future: extract individual heavy games to separate services

6. **Analytics & replay**:
   - Every move is logged with timestamps
   - Can replay any match
   - Player statistics aggregated in real-time
   - Anti-cheat review dashboard

7. **Web Runtime escape hatch**:
   - Add simple HTML5 games without app update    - Sandboxed WebView isolates the game and significantly reduces the impact of malicious game code
   - Backend controls which web games are enabled
   - Only for casual games (quiz, puzzle, word, arcade)

---

## IMPLEMENTATION TIMELINE

```
Week 1-2:   Phase 0  — GameDefinition contract + migrate 7 plugins
Week 2-3:   Phase 1  — Game Runtime Manager (turn-based, real-time, round-based executors)
Week 3:     Phase 2  — Player View encapsulation (fix state leakage)
Week 3-4:   Phase 3  — Versioned state (game version per match)
Week 4-5:   Phase 4  — Event-driven internals (persistent event log)
Week 5-6:   Phase 5  — Client-side runtime registry (backend-driven game list)
Week 6-7:   Phase 6  — Rate limiting + anti-cheat
Week 7:     Phase 7  — Game configuration via database
Week 8:     Phase 8  — State diff compression
Week 9-10:  Phase 9  — Game process isolation
Week 10-11: Phase 10 — Analytics & replay
Week 12+:   Phase 11 — Web Game Runtime (optional, for casual games)
```

---

## PRIORITY ORDER


If you can't do all 11 phases, here's what to prioritize:

### 🔴 P0 — Before Production (Security-Critical)

```text
P0 SECURITY
├── Single-writer / Match Actor (Phase 6.4A)
├── Atomic idempotency reservation (Phase 6.3)
├── Fail-closed security-critical rate limiting (Phase 6.2)
├── Plugin player-view fail-closed (Phase 0.1)
├── Atomic state revision (Phase 6.4)
├── Reward idempotency (Phase 4.1A)
├── Replay authorization (Phase 10.1)
├── Bridge schema validation (Phase 11.3A)
├── Config version pinning (Phase 11.4)
├── RNG seed/version pinning (Phase 11.5)
├── Immutable bundle + manifest verification (Phase 11.3)
├── No secrets in game state (Phase 6.8)
└── Admin audit trail (Phase 6.9)
```

| Priority | Phase | Why |
|----------|-------|-----|
| 🔴 P0 | Phase 0 (Contract + Player View + Immutable State) | Everything depends on this |
| 🔴 P0 | Phase 6 (Command Pipeline + Match Actor + Rate Limiting + Idempotency) | Security: auth, idempotency, concurrency, rate limiting, schemas |
| 🔴 P0 | Phase 3 (Versioning + Config Pinning + RNG) | Fail-closed version pinning prevents silent rule changes |
| 🔴 P0 | Phase 4 (Events + Reward Idempotency) | Transactional outbox + idempotent rewards |

### 🟡 P1 — Reliability

```text
P1 RELIABILITY
├── Outbox retries + dead letter (Phase 4.3)
├── Engine ownership/recovery (Phase 9)
├── Health/readiness probes (Phase 9)
├── Circuit breakers (Phase 9)
├── Observability (Phase 10)
└── Disaster recovery (Phase 9)
```

| Priority | Phase | Why |
|----------|-------|-----|
| 🟡 P1 | Phase 1 (Execution Manager) | Removes game-specific if/else from socket |
| 🟡 P1 | Phase 7 (DB Config) | Hot-fix game parameters + game security policy |
| 🟡 P1 | Phase 9 (Process Isolation) | Crash isolation + health probes |

### 🟢 P2 — Performance

```text
P2 PERFORMANCE
├── State diff (Phase 8, measure first)
├── Registry caching (Phase 5)
├── Compression (Phase 8)
├── Connection scaling (Phase 9)
└── Analytics optimization (Phase 10)
```

| Priority | Phase | Why |
|----------|-------|-----|
| 🟢 P2 | Phase 5 (Client Registry) | Backend-driven game list |
| 🟢 P2 | Phase 8 (State Diff) | Performance optimization (measure first, use lastProjectedRevision) |
| 🟢 P2 | Phase 10 (Analytics) | Nice-to-have for v2 |

### ⚪ P3 — Optional

```text
P3 OPTIONAL
└── Web Runtime (Phase 11, policy-sensitive)
```

| Priority | Phase | Why |
|----------|-------|-----|
| ⚪ P3 | Phase 11 (Web Runtime) | Policy-sensitive, requires review per implementation |

---

## PHILOSOPHY: CLIENT COMPROMISE IS HARMLESS

**Don't optimize for "unhackable." Optimize for "client compromise is harmless."**

If someone modifies the React Native app, tampers with the WebView, sends fake commands,
replays packets, manipulates scores, or writes their own Socket.IO client, the server
should basically shrug and say:

```text
❌ invalid authentication
❌ not authorized
❌ invalid command
❌ stale revision
❌ duplicate command
❌ rate limited
❌ illegal state transition
❌ invalid reward
```

That's the production-grade target. This architecture is structured around exactly that
philosophy.

---

## MIGRATION STRATEGY

**Don't rewrite. Refactor incrementally.**

1. The new `GamePlugin` contract is **backwards-compatible** — old `createState()` still works, just add the new methods
2. The `GameExecutionManager` can wrap existing plugins without changing their internals
3. `_getPlayerState()` in `game.socket.js` can coexist with `plugin.getPlayerView()` — migrate one game at a time
4. The persistent event log uses **outbox pattern** for critical events, Redis for hot state
5. Process isolation is the **last step** — everything works in-process first
6. Security pipeline is **additive** — existing MOVE handler gets wrapped, not replaced
7. Idempotency and state revision are **opt-in per game initially**, enforced platform-wide after migration

**Each phase can be deployed independently.** There's no "big bang" rewrite.

---

## RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| Plugin contract change breaks existing games | High | Keep old methods as aliases, deprecate over 2 versions |
| Version pinning failure (old match gets new rules) | Critical | Fail-closed: throw if version unavailable, never fallback to latest |
| Duplicate command execution (network retry) | High | Atomic idempotency reservation (SET NX EX), prevents TOCTOU race |
| Race condition on concurrent commands | High | Match actor / single-writer per match + state revision check |
| Rate limiter bypass (Redis down) | Critical | Fail-closed for SECURITY_CRITICAL; local emergency limiter; alert |
| Event data loss (PostgreSQL async failure) | High | Outbox pattern with retry + dead-letter for critical domain events |
| State diff causes stale state bugs | Medium | Always send full state on reconnect/start; use lastProjectedRevision |
| Event log table grows unbounded | Medium | Partition by month, auto-archive after 90 days |
| Process isolation adds latency | Low | Engine and API on same host, localhost socket |
| Rate limiter blocks legitimate moves | Medium | Generous limits per game, log rejections for tuning |
| WebView bundle tampering | High | Signed manifest (full identity), app verifies entire manifest |
| WebView credential theft | High | Short-lived match-scoped session tokens, not user auth tokens |
| Malicious/buggy plugin | High | Resource limits, invariant testing, kill switches, immutable state |
| Admin compromise | Critical | Separate permissions, immutable audit records per publish |
| Reward double-award | Critical | Idempotent reward_claims table (UNIQUE constraint on match+user+type) |
| Replay authorization bypass | High | Check: authenticated + (participant OR admin) + replay enabled |
| Secrets in game state | Critical | Hard platform rule: no secrets in state; test invariant checks |
| Config drift in live matches | High | Config pinned at match creation (configVersion + configSnapshot) |
| Non-deterministic replay | High | RNG seed pinned at match creation; sequence_number ordering |
| Bridge message injection | High | TaddleBridge schema validation; unknown types rejected |
| TaddleBridge message tampering | High | Origin check, size limit, rate limit, command type allowlist |

---

*Generated for Taddle Games Platform — Plugin-Based Modular Architecture*
