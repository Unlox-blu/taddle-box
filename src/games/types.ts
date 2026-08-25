import type { Game } from '../types';

// ─── Runtime Contract ──────────────────────────────────────────────────────
// The backend advertises which capabilities a frontend runtime supports.
// Used by AppGameHost to verify compatibility before launching a game.

export type RuntimeFeature =
  | 'full-sync'
  | 'patch-sync'
  | 'reconnect'
  | 'animations'
  | 'chat'
  | 'bots';

export interface RuntimeContract {
  /** Runtime identity (e.g. 'ludo', 'chess') — shared across versions. */
  runtime: string;
  /** Monotonically increasing implementation version. */
  version: number;
  /** Protocol version the runtime speaks (backend must match). */
  protocolVersion: number;
  /** Capabilities this runtime supports. */
  features: RuntimeFeature[];
}

// ─── Game Definition ───────────────────────────────────────────────────────
// Complete game descriptor from backend. Controls what the client renders,
// which runtime to use, and which assets to load.

export interface GameDefinition {
  slug: string;
  name: string;
  emoji: string;

  /** 'app' = native React Native, 'web' = HTML5 in WebView. */
  runtimeType: 'app' | 'web';

  /** Runtime identity (e.g. 'ludo', 'chess'). */
  runtime: string;
  /** Runtime implementation version (e.g. 2 for ludo-v2). */
  runtimeVersion: number;

  /** Game logic version — bump when rules/rewards change. */
  gameVersion: number;
  /** Config version — bump when config structure changes. */
  configVersion: number;

  /** Minimum app version required to run this game (semver). */
  minAppVersion?: string;

  /** Runtime-specific configuration (board layout, timers, etc.). */
  config: Record<string, any>;

  /** Asset set identifier (e.g. 'ludo-classic-v3', 'ludo-neon-v1'). */
  assetSetId: string;
  /** Asset manifest version — bump when S3/CDN assets change. */
  assetManifestVersion: number;

  /** Web-only: HTML5 bundle URL + integrity hash. */
  bundle?: { url: string; hash: string };

  /** Gradient for card/lobby UI. */
  gradient: [string, string];
  /** Maximum XP earnable per session. */
  maxXp: number;
  /** Entry fee in XP (0 = free). */
  entryFee?: number;
  /** Max players per match. */
  maxPlayers?: number;
}

// ─── Game Result ───────────────────────────────────────────────────────────

/** Shared player context passed to every game component. */
export type PlayerContext = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  team?: number;
  seat?: number;
  level?: number;
};

export type HtmlGameResult = {
  score: number;
  won: boolean;
  xpEarned?: number;
  durationSeconds: number;
  /** Optional 0–100 accuracy/hit-rate breakdown for the celebration overlay */
  accuracy?: number;
  /** Optional longest consecutive correct/streak count for the celebration overlay */
  longestStreak?: number;
};
