/**
 * gameAssets — on-demand download of game logos + sound effects.
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
import { GAME_ASSETS, GAME_SOUND_NAMES, gameSoundUrl } from "./assets";

export const GAME_ASSET_VERSION = 1;

const ROOT = FileSystem.documentDirectory + "game_assets/";
const VERSION_DIR = `${ROOT}v${GAME_ASSET_VERSION}/`;
export const LOGO_DIR = VERSION_DIR + "logos/";
export const SOUND_DIR = VERSION_DIR + "sounds/";

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
    console.warn(`[gameAssets] download failed: ${url}`, e);
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
 * Downloads ALL game logos (no sounds) — fired when the player enters the
 * Games tab and by the post-login prewarm. Idempotent + disk-checked, so
 * repeat visits are just a few stat calls.
 */
export async function ensureGameLogos(): Promise<void> {
  if (logosFetching) return logosFetching;
  logosFetching = (async () => {
    try {
      await init();
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
  const logoUri = await downloadIfMissing(
    manifest.logoUrl,
    LOGO_DIR + manifest.logoFile,
  );
  await ensureSoundFiles();
  notify();
  return logoUri;
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
