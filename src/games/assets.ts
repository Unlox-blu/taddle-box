/**
 * Game asset manifest — everything the games need that is NOT bundled in the
 * APK. The logos and sounds are the games' whole storage footprint (~20 MB),
 * so they ship to a static host and download to the app cache: ALL logos
 * when the player enters the Games tab, sounds on the first PLAY tap (see
 * gameAssets.ts). `imageUrl` stays a remote card image so the games grid
 * never shows an empty tile before the branded logo is cached.
 *
 * Hosting: taddle-box/scripts/upload-game-assets.js syncs build/game-assets/
 * to S3 (the origin). The app fetches from the BACKEND route /game-assets/
 * (https://server.prepfree.in/game-assets/), which streams from S3 — the
 * client never touches the bucket directly. Bump the file names (or
 * GAME_ASSET_VERSION in gameAssets.ts) when artwork changes so old caches
 * are busted.
 */
export type GameAssetManifest = {
  emoji: string;
  /** Remote branded logo — downloaded to cache on first play. */
  logoUrl: string;
  /** Local cache file name (must match what build/game-assets/logos ships). */
  logoFile: string;
  /** Remote card image — rendered from the network while the logo is uncached. */
  imageUrl: string;
  gradient: [string, string];
  averageDurationLabel: string;
};

// The app NEVER talks to S3 directly: the backend serves /game-assets/ by
// streaming from S3 (the origin, pushed by scripts/upload-game-assets.js), so
// the bucket name stays server-side. Override per-build with
// EXPO_PUBLIC_GAME_ASSETS_URL (e.g. a CDN in front of the API) when needed.
export const GAME_ASSETS_BASE_URL =
  process.env.EXPO_PUBLIC_GAME_ASSETS_URL ||
  "https://server.prepfree.in/game-assets/";

const logoUrl = (file: string) => `${GAME_ASSETS_BASE_URL}logos/${file}`;

export const GAME_ASSETS: Record<string, GameAssetManifest> = {
  "tap-rush": {
    emoji: "TR",
    logoUrl: logoUrl("tap-rush.webp"),
    logoFile: "tap-rush.webp",
    imageUrl:
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop",
    gradient: ["#7C3AED", "#0891B2"],
    averageDurationLabel: "20 sec",
  },
  "memory-grid": {
    emoji: "MG",
    logoUrl: logoUrl("memory-grid.webp"),
    logoFile: "memory-grid.webp",
    imageUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600&auto=format&fit=crop",
    gradient: ["#0F766E", "#4F46E5"],
    averageDurationLabel: "1 min",
  },
  scribble: {
    emoji: "✏️",
    logoUrl: logoUrl("scribble.webp"),
    logoFile: "scribble.webp",
    imageUrl:
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?q=80&w=600&auto=format&fit=crop",
    gradient: ["#F59E0B", "#EF4444"],
    averageDurationLabel: "3 min",
  },
  ludo: {
    emoji: "🎲",
    logoUrl: logoUrl("ludo.webp"),
    logoFile: "ludo.webp",
    imageUrl:
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop",
    gradient: ["#10B981", "#3B82F6"],
    averageDurationLabel: "10 min",
  },
  "snake-ladder": {
    emoji: "🐍",
    logoUrl: logoUrl("snake-ladder.webp"),
    logoFile: "snake-ladder.webp",
    imageUrl:
      "https://images.unsplash.com/photo-1570303363992-7f95ee20ebdb?q=80&w=600&auto=format&fit=crop",
    gradient: ["#8B5CF6", "#EC4899"],
    averageDurationLabel: "8 min",
  },
  chess: {
    emoji: "♟️",
    logoUrl: logoUrl("chess.webp"),
    logoFile: "chess.webp",
    imageUrl:
      "https://images.unsplash.com/photo-1586165368502-1bad197a6461?q=80&w=600&auto=format&fit=crop",
    gradient: ["#374151", "#111827"],
    averageDurationLabel: "15 min",
  },
  "word-rush": {
    emoji: "📝",
    logoUrl: logoUrl("word-rush.webp"),
    logoFile: "word-rush.webp",
    imageUrl:
      "https://images.unsplash.com/photo-1555448248-2571daf6344b?q=80&w=600&auto=format&fit=crop",
    gradient: ["#F43F5E", "#8B5CF6"],
    averageDurationLabel: "2 min",
  },
};

/** Remote URL for one shared sound effect (see gameSound.ts). */
export const gameSoundUrl = (name: string) =>
  `${GAME_ASSETS_BASE_URL}sounds/${name}.wav`;

/** The 11 shared sound effects — single source of truth for gameSound.ts + gameAssets.ts. */
export const GAME_SOUND_NAMES = [
  "tick",
  "go",
  "turn",
  "win",
  "loss",
  "tap",
  "correct",
  "error",
  "snake",
  "ladder",
  "hop",
] as const;
