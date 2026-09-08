export interface RoundConfig {
  min: number;
  max: number;
  default: number;
}

export interface RoundContext {
  roundId: string;
  number: number;
  total: number;
  status: 'WAITING' | 'LOADING' | 'READY' | 'ACTIVE' | 'FINISHED';
  config?: Record<string, any>;
  assetSetId?: string;
  assetManifestVersion?: number;
  stateRevision?: number;
}

export interface Game {
  id: string;
  name: string;
  emoji: string;
  gradient: [string, string];
  imageUrl?: string;
  /** Backend thumbnail URL from games table */
  thumbnail?: string;
  /** Backend banner/cover URLs (game detail hero) — optional until set. */
  bannerUrl?: string;
  coverUrl?: string;
  /** Branded logo asset (require'd PNG) — takes precedence over monogram tile */
  logo?: any;
  /** Cached card image from disk — takes precedence over remote imageUrl */
  card?: { uri: string } | null;
  slug?: string;

  // ── Runtime contract ───────────────────────────────────────────────
  /** Runtime identity (e.g. 'ludo', 'chess') — shared across versions. */
  runtime?: string;
  /** Runtime implementation version (e.g. 1, 2, 3). */
  runtimeVersion?: number;
  /** 'app' = native React Native, 'web' = HTML5 in WebView. */
  runtimeType?: string;
  /** Minimum app version required to run this game (semver). */
  minAppVersion?: string;

  // ── Versioning ─────────────────────────────────────────────────────
  /** Game logic version — bump when rules/rewards change. */
  gameVersion?: number;
  /** Config version — bump when config structure changes. */
  configVersion?: number;

  // ── Configuration ──────────────────────────────────────────────────
  /** Runtime configuration (board layout, pieces, dice, timers). */
  config?: Record<string, any>;
  /** Backend metadata (entryFee, prize, gradient overrides, etc.). */
  metadata?: Record<string, any>;

  // ── Assets ─────────────────────────────────────────────────────────
  /** Asset set identifier (e.g. 'ludo-classic-v3', 'ludo-neon-v1'). */
  assetSetId?: string;
  /** Asset manifest version — bump when S3/CDN assets change. */
  assetManifestVersion?: number;
  /** Asset manifest (CDN URLs, integrity hashes). */
  assets?: {
    version: number;
    baseUrl: string;
    items: Record<string, { path: string; type: string; sha256?: string; sizeBytes?: number }>;
  };

  // ── Game metadata ──────────────────────────────────────────────────
  maxXp: number;
  isHot: boolean;
  maxPlayers?: number;
  entryFee?: number;
  rounds?: RoundConfig;
  prize?: number;
  /** Human-friendly average playtime ("3 min") — from local assets or backend. */
  averageDurationLabel?: string;
}