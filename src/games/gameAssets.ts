/**
 * gameAssets — single source of truth for all game asset metadata + on-demand
 * download of game logos + sound effects.
 *
 * The games' logos and sounds used to ship inside the APK (~20 MB — scribble
 * and chess artwork alone were 18 MB). Now they live on S3 (pushed by
 * taddle-box/scripts/upload-game-assets.js) and the backend's /game-assets
 * route streams them to the app — the client never talks to S3 directly.
 * They download to the app's document directory: ALL logos when the player
 * enters the Games tab (so the grid shows real artwork), sounds on the first
 * PLAY tap — never at app launch. While a logo is uncached the UI falls back
 * to the remote card image / monogram tile; sounds are best-effort (games
 * play silently until the WAVs are cached).
 *
 * Cache layout: documentDirectory/game_assets/v<N>/logos|sounds/<file>
 * Bump GAME_ASSET_VERSION when a release ships new artwork — old version
 * directories are pruned on the next download.
 */
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { getBackendOrigin } from "../services/backendUrl";
import { warn } from "../utils/logger";

// ─── Asset manifest ──────────────────────────────────────────────────────────

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

// The app NEVER talks to S3 (or a third-party image host) directly: the
// backend serves /app-assets/games/ by streaming from S3 (the origin, pushed
// by scripts/upload-game-assets.js + scripts/sync-third-party-images.js), so
// the bucket name stays server-side. The base URL derives from
// EXPO_PUBLIC_BACKEND_URL via the shared resolver (see backendUrl.ts) — never
// a hardcoded domain. Override per-build with EXPO_PUBLIC_GAME_ASSETS_URL
// (e.g. a CDN in front of the API) when needed.
export const GAME_ASSETS_BASE_URL =
  process.env.EXPO_PUBLIC_GAME_ASSETS_URL ||
  `${getBackendOrigin()}/app-assets/games/`;

const logoUrl = (file: string) => `${GAME_ASSETS_BASE_URL}logos/${file}`;

/** Mirrored card art served through the backend (/app-assets/games/cards). */
const cardUrl = (file: string) => `${GAME_ASSETS_BASE_URL}cards/${file}`;

export const GAME_ASSETS: Record<string, GameAssetManifest> = {
  "tap-rush": {
    emoji: "TR",
    logoUrl: logoUrl("tap-rush.webp"),
    logoFile: "tap-rush.webp",
    imageUrl: cardUrl("tap-rush.jpg"),
    gradient: ["#7C3AED", "#0891B2"],
    averageDurationLabel: "20 sec",
  },
  "memory-grid": {
    emoji: "MG",
    logoUrl: logoUrl("memory-grid.webp"),
    logoFile: "memory-grid.webp",
    imageUrl: cardUrl("memory-grid.jpg"),
    gradient: ["#0F766E", "#4F46E5"],
    averageDurationLabel: "1 min",
  },
  scribble: {
    emoji: "✏️",
    logoUrl: logoUrl("scribble.webp"),
    logoFile: "scribble.webp",
    imageUrl: cardUrl("scribble.jpg"),
    gradient: ["#F59E0B", "#EF4444"],
    averageDurationLabel: "3 min",
  },
  ludo: {
    emoji: "🎲",
    logoUrl: logoUrl("ludo.webp"),
    logoFile: "ludo.webp",
    imageUrl: cardUrl("ludo.jpg"),
    gradient: ["#10B981", "#3B82F6"],
    averageDurationLabel: "10 min",
  },
  "snake-ladder": {
    emoji: "🐍",
    logoUrl: logoUrl("snake-ladder.webp"),
    logoFile: "snake-ladder.webp",
    imageUrl: cardUrl("snake-ladder.jpg"),
    gradient: ["#8B5CF6", "#EC4899"],
    averageDurationLabel: "8 min",
  },
  chess: {
    emoji: "♟️",
    logoUrl: logoUrl("chess.webp"),
    logoFile: "chess.webp",
    imageUrl: cardUrl("chess.jpg"),
    gradient: ["#374151", "#111827"],
    averageDurationLabel: "15 min",
  },
  "word-rush": {
    emoji: "📝",
    logoUrl: logoUrl("word-rush.webp"),
    logoFile: "word-rush.webp",
    imageUrl: cardUrl("word-rush.jpg"),
    gradient: ["#F43F5E", "#8B5CF6"],
    averageDurationLabel: "2 min",
  },
};

/** Remote URL for one shared sound effect (see gameSound.ts). */
export const gameSoundUrl = (name: string) =>
  `${GAME_ASSETS_BASE_URL}sounds/${name}.wav`;

/** The 11 shared sound effects — single source of truth for gameSound.ts. */
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
  "match_start",
] as const;

// ─── On-demand download + cache layer ────────────────────────────────────────

export const GAME_ASSET_VERSION = 1;

const ROOT = FileSystem.documentDirectory + "game_assets/";
const VERSION_DIR = `${ROOT}v${GAME_ASSET_VERSION}/`;
export const LOGO_DIR = VERSION_DIR + "logos/";
export const SOUND_DIR = VERSION_DIR + "sounds/";
export const CARD_DIR = VERSION_DIR + "cards/";

// Files known to exist on disk for THIS process. Disk state is checked
// lazily (never at app launch); a warm entry means a cached file is usable.
const downloaded = new Set<string>();
let dirsReady = false;
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* subscriber error must not break the asset pipeline */
    }
  });
}

/** Subscribe to cache changes (a logo/sound finished downloading). */
export function subscribeGameAssets(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Re-renders consumers when cached assets change. */
export function useGameAssetsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeGameAssets(() => setVersion((v) => v + 1)), []);
  return version;
}

async function ensureDirs(): Promise<void> {
  if (dirsReady) return;
  // Prune caches from older asset versions so a version bump never leaks
  // stale downloads.
  const rootInfo = await FileSystem.getInfoAsync(ROOT);
  if (rootInfo.exists) {
    const files = await FileSystem.readDirectoryAsync(ROOT);
    await Promise.all(
      files
        .filter((f) => f !== `v${GAME_ASSET_VERSION}`)
        .map((f) =>
          FileSystem.deleteAsync(ROOT + f, { idempotent: true }).catch(() => {}),
        ),
    );
  }
  await FileSystem.makeDirectoryAsync(LOGO_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(SOUND_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(CARD_DIR, { intermediates: true });
  dirsReady = true;
}

function init(): Promise<void> {
  if (!initPromise) initPromise = ensureDirs();
  return initPromise;
}

async function downloadIfMissing(
  url: string,
  localUri: string,
): Promise<string | null> {
  if (downloaded.has(localUri)) return localUri;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) {
      downloaded.add(localUri);
      return localUri;
    }
    const res = await FileSystem.downloadAsync(url, localUri);
    if (res.status !== 200) {
      // Failed download must not be treated as cached — retry next time.
      await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(
        () => {},
      );
      return null;
    }
    downloaded.add(localUri);
    return localUri;
  } catch (e) {
    warn(`[gameAssets] download failed: ${url}`, e);
    return null;
  }
}

/** Disk-backed lookup WITHOUT downloading — null when not cached yet. */
async function resolveLocalUri(localUri: string): Promise<string | null> {
  if (downloaded.has(localUri)) return localUri;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) {
      downloaded.add(localUri);
      return localUri;
    }
  } catch {
    /* stat failure → treat as uncached */
  }
  return null;
}

// In-flight guard so concurrent callers (tab entry + post-login prewarm)
// never download the same logos twice.
let logosFetching: Promise<void> | null = null;

/**
 * Warms the in-memory cache from disk on cold start.
 * Checks all known asset paths (logos, sounds, cards) and populates
 * the `downloaded` Set so sync lookups (getCachedGameLogo, getCachedGameCard)
 * return immediately without a background disk stat.
 * Call once after app launch — idempotent, never downloads.
 */
export async function warmAssetCache(): Promise<void> {
  await init();
  const checks: Promise<void>[] = [];
  for (const manifest of Object.values(GAME_ASSETS)) {
    // Logo
    checks.push(resolveLocalUri(LOGO_DIR + manifest.logoFile).then(() => {}));
    // Card image
    const cardFile = manifest.logoFile.replace('.webp', '.jpg');
    checks.push(resolveLocalUri(CARD_DIR + cardFile).then(() => {}));
  }
  // Sound files
  for (const name of GAME_SOUND_NAMES) {
    checks.push(resolveLocalUri(SOUND_DIR + `${name}.wav`).then(() => {}));
  }
  await Promise.all(checks);
}

/**
 * Downloads ALL game logos (no sounds) — fired when the player enters the
 * Games tab and by the post-login prewarm. Idempotent + disk-checked, so
 * repeat visits are just a few stat calls.
 */
export async function ensureGameLogos(): Promise<void> {
  if (logosFetching) return logosFetching;
  logosFetching = (async () => {
    try {
      await init();
      // Download logos only — card images download per-game on PLAY tap
      // to avoid fetching all 7 cards upfront (~5 MB) on tab open.
      await Promise.all(
        Object.values(GAME_ASSETS).map((manifest) =>
          downloadIfMissing(manifest.logoUrl, LOGO_DIR + manifest.logoFile),
        ),
      );
      notify();
    } finally {
      logosFetching = null;
    }
  })();
  return logosFetching;
}

/**
 * Downloads one game's branded logo + the shared sound set. Called when the
 * player taps PLAY for that game. Logos are usually already cached from the
 * Games-tab entry; sounds download here. Returns the cached logo URI (null on
 * failure — the UI falls back to the monogram tile).
 */
export async function ensureGameAssets(slug: string): Promise<string | null> {
  const manifest = GAME_ASSETS[slug];
  if (!manifest) return null;
  await init();
  // Download this game's logo + card image + shared sounds in parallel
  const cardFile = manifest.logoFile.replace('.webp', '.jpg');
  await Promise.all([
    downloadIfMissing(manifest.logoUrl, LOGO_DIR + manifest.logoFile),
    downloadIfMissing(manifest.imageUrl, CARD_DIR + cardFile),
    ensureSoundFiles(),
  ]);
  notify();
  return LOGO_DIR + manifest.logoFile;
}

/** Downloads the shared sound effects if any are missing. */
export async function ensureSoundFiles(): Promise<void> {
  await init();
  await Promise.all(
    GAME_SOUND_NAMES.map((name) =>
      downloadIfMissing(gameSoundUrl(name), SOUND_DIR + `${name}.wav`),
    ),
  );
  notify();
}

/** Sync cache lookup for the game grid — never downloads. */
export function getCachedGameLogo(slug: string): { uri: string } | null {
  const manifest = GAME_ASSETS[slug];
  if (!manifest) return null;
  const localUri = LOGO_DIR + manifest.logoFile;
  if (downloaded.has(localUri)) return { uri: localUri };
  // Warm from disk in the background so a logo cached in a previous session
  // appears on the card without waiting for the next PLAY tap.
  resolveLocalUri(localUri).then((uri) => {
    if (uri) notify();
  });
  return null;
}

/** Async disk lookup for a sound file — never downloads. */
export async function getCachedSoundUri(name: string): Promise<string | null> {
  return resolveLocalUri(SOUND_DIR + `${name}.wav`);
}

/** Sync disk lookup for a game card image — returns { uri } if cached, null otherwise. */
export function getCachedGameCard(slug: string): { uri: string } | null {
  const manifest = GAME_ASSETS[slug];
  if (!manifest) return null;
  const cardFile = manifest.logoFile.replace('.webp', '.jpg');
  const localUri = CARD_DIR + cardFile;
  if (downloaded.has(localUri)) return { uri: localUri };
  // Warm from disk in background
  resolveLocalUri(localUri).then((uri) => {
    if (uri) notify();
  });
  return null;
}
