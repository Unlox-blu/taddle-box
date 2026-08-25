/**
 * assetManifest — backend-driven asset manifest with integrity verification.
 *
 * Architecture:
 *   GameDefinition.assetSetId → backend → AssetManifest → download → verify → cache
 *
 * Each asset has:
 *   - url: immutable CDN/S3 path (versioned: /v3/board.webp)
 *   - type: image | audio | video | font | lottie | sprite
 *   - sha256: integrity hash (verified after download)
 *   - sizeBytes: expected size (used for progress, actual size enforced separately)
 *   - priority: 'critical' | 'optional' (critical blocks game start, optional loads in background)
 *
 * Security:
 *   - baseUrl must match an approved CDN domain (hardcoded allowlist)
 *   - All URLs must be HTTPS
 *   - SHA-256 mandatory for every remotely downloaded asset
 *   - Atomic download: download to .tmp → verify → rename (never expose partial files)
 *   - Bounded concurrency (max 5 parallel downloads)
 *   - Retry with exponential backoff (max 3 retries)
 *   - Manifest validated before any download begins
 *   - Cache keyed by assetSetId + version (immutable)
 *
 * Flow:
 *   1. GameDefinition arrives with assetSetId + assetManifestVersion
 *   2. Client fetches manifest from GET /api/v1/game/assets/{assetSetId}
 *   3. Manifest is validated (limits, CDN, types, sizes)
 *   4. Critical assets downloaded first (blocks game start)
 *   5. Optional assets downloaded in background after game starts
 *   6. SHA-256 verified after each download (atomic: .tmp → rename)
 *   7. On mismatch → delete + warn (never serve corrupted asset)
 */

import * as FileSystem from "expo-file-system/legacy";
import { warn } from "../utils/logger";

// ─── Constants ─────────────────────────────────────────────────────────────

/** Maximum number of concurrent downloads. */
const MAX_CONCURRENT_DOWNLOADS = 5;

/** Maximum number of retries per asset. */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms). */
const RETRY_BASE_DELAY_MS = 1000;

/** Maximum retries before giving up on manifest fetch. */
const MANIFEST_MAX_RETRIES = 2;

/** Timeout for individual asset downloads (ms). */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Maximum number of assets per manifest. */
const MAX_ASSETS_PER_MANIFEST = 100;

/** Maximum individual asset size (50 MB). */
const MAX_SINGLE_ASSET_BYTES = 50 * 1024 * 1024;

/** Maximum total manifest size (500 MB). */
const MAX_TOTAL_MANIFEST_BYTES = 500 * 1024 * 1024;

// ─── Trusted CDN enforcement ───────────────────────────────────────────────

/**
 * Approved CDN origins. Only assets from these domains will be downloaded.
 * The backend manifest `baseUrl` must start with one of these prefixes.
 *
 * When adding a new CDN, add the origin here + publish a new app version.
 * This prevents a compromised backend from redirecting the app to arbitrary domains.
 */
const APPROVED_CDN_ORIGINS = [
  "https://cdn.taddlebox.com",
  "https://d3c7o1v5k6l4z2.cloudfront.net",
  // Add additional approved CDN origins here as needed.
];

/**
 * Validate that a URL points to an approved CDN.
 * Returns true if the URL uses HTTPS and matches an approved origin.
 */
function isTrustedUrl(url: string, baseUrl: string): boolean {
  // Relative URLs are resolved against baseUrl — validate baseUrl itself
  if (!url.startsWith("http")) {
    return isTrustedBaseUrl(baseUrl);
  }
  // Absolute URLs must be HTTPS + approved origin
  if (!url.startsWith("https://")) return false;
  return APPROVED_CDN_ORIGINS.some((origin) => url.startsWith(origin));
}

function isTrustedBaseUrl(baseUrl: string): boolean {
  if (!baseUrl.startsWith("https://")) return false;
  return APPROVED_CDN_ORIGINS.some((origin) => baseUrl.startsWith(origin));
}

// ─── Types ─────────────────────────────────────────────────────────────────

export type AssetType = "image" | "audio" | "video" | "font" | "lottie" | "sprite";

/** Whether an asset must be loaded before the game can start. */
export type AssetPriority = "critical" | "optional";

export interface AssetItem {
  /** Immutable CDN/S3 path (e.g. /v3/board.webp). */
  url: string;
  /** Asset category — determines cache subdirectory and loading strategy. */
  type: AssetType;
  /** SHA-256 hex digest for integrity verification. Required for all remote assets. */
  sha256: string;
  /** Expected file size in bytes (used for progress reporting). */
  sizeBytes: number;
  /** MIME type (e.g. image/webp, audio/wav). */
  mime: string;
  /** Whether the asset must be loaded before game start. Default: 'critical'. */
  priority?: AssetPriority;
  /** Width in pixels (for images). */
  width?: number;
  /** Height in pixels (for images). */
  height?: number;
}

export interface AssetManifest {
  /** Asset set identifier (e.g. 'ludo-classic-v3'). */
  assetSetId: string;
  /** Manifest version — immutable (bump = new manifest). */
  version: number;
  /** Base URL for all asset paths (CDN origin). Must be an approved CDN. */
  baseUrl: string;
  /** Map of asset keys to their metadata. */
  items: Record<string, AssetItem>;
}

export interface AssetManifestValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalSizeBytes: number;
  criticalCount: number;
  optionalCount: number;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  /** Bytes downloaded so far (for fine-grained progress). */
  bytesDownloaded: number;
  /** Total bytes expected (sum of critical assets' sizeBytes). */
  totalBytes: number;
}

// ─── Cache layout ──────────────────────────────────────────────────────────

const ROOT = FileSystem.documentDirectory + "asset_manifests/";

function assetCacheDir(assetSetId: string, version: number): string {
  return `${ROOT}${assetSetId}/v${version}/`;
}

function assetTypeDir(baseDir: string, type: AssetType): string {
  return `${baseDir}${type}/`;
}

function localPath(baseDir: string, item: AssetItem): string {
  const filename = item.url.split("/").pop() || "unknown";
  return `${assetTypeDir(baseDir, item.type)}${filename}`;
}

// ─── In-memory cache index ─────────────────────────────────────────────────

/** Map of "assetSetId:v" → Set<localUri> for fast sync lookups. */
const cacheIndex = new Map<string, Set<string>>();

/** Map of "assetSetId:v" → AssetManifest for resolved manifests. */
const manifestCache = new Map<string, AssetManifest>();

/** Set of assetSetIds that are currently referenced by an active match. */
const activeAssetSets = new Set<string>();

// ─── Manifest validation ───────────────────────────────────────────────────

/**
 * Validate a manifest before downloading anything.
 * Checks: assetSetId match, version match, CDN trust, item limits, URL validity,
 * type validity, size limits, SHA-256 presence.
 */
export function validateManifest(
  manifest: any,
  requestedAssetSetId: string,
  requestedVersion: number,
): AssetManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalSizeBytes = 0;
  let criticalCount = 0;
  let optionalCount = 0;

  // Top-level structure
  if (!manifest || typeof manifest !== "object") {
    return { valid: false, errors: ["Manifest is not an object"], warnings: [], totalSizeBytes: 0, criticalCount: 0, optionalCount: 0 };
  }

  // assetSetId match
  if (manifest.assetSetId !== requestedAssetSetId) {
    errors.push(`assetSetId mismatch: requested '${requestedAssetSetId}', got '${manifest.assetSetId}'`);
  }

  // version match
  if (manifest.version !== requestedVersion) {
    errors.push(`version mismatch: requested ${requestedVersion}, got ${manifest.version}`);
  }

  // baseUrl trust
  if (typeof manifest.baseUrl !== "string" || !isTrustedBaseUrl(manifest.baseUrl)) {
    errors.push(`baseUrl is not an approved CDN: '${manifest.baseUrl}'`);
  }

  // items validation
  if (!manifest.items || typeof manifest.items !== "object") {
    errors.push("manifest.items is not an object");
    return { valid: false, errors, warnings, totalSizeBytes: 0, criticalCount: 0, optionalCount: 0 };
  }

  const itemEntries = Object.entries(manifest.items);
  if (itemEntries.length === 0) {
    warnings.push("manifest has no items");
  }
  if (itemEntries.length > MAX_ASSETS_PER_MANIFEST) {
    errors.push(`manifest has ${itemEntries.length} items (max: ${MAX_ASSETS_PER_MANIFEST})`);
  }

  const validTypes = new Set<AssetType>(["image", "audio", "video", "font", "lottie", "sprite"]);

  for (const [key, item] of itemEntries) {
    const asset = item as AssetItem;

    // URL validity
    if (!asset.url || typeof asset.url !== "string") {
      errors.push(`[${key}] missing url`);
      continue;
    }
    if (!isTrustedUrl(asset.url, manifest.baseUrl)) {
      errors.push(`[${key}] url is not from an approved CDN: '${asset.url}'`);
    }

    // HTTPS enforcement
    if (!asset.url.startsWith("http") && !isTrustedBaseUrl(manifest.baseUrl)) {
      errors.push(`[${key}] url is not absolute and baseUrl is not trusted`);
    }

    // Type validity
    if (!validTypes.has(asset.type)) {
      errors.push(`[${key}] unsupported type '${asset.type}'`);
    }

    // SHA-256 mandatory
    if (!asset.sha256 || typeof asset.sha256 !== "string") {
      errors.push(`[${key}] sha256 is required for remote assets`);
    } else if (!/^[a-fA-F0-9]{64}$/.test(asset.sha256)) {
      errors.push(`[${key}] sha256 is not a valid 64-char hex digest`);
    }

    // sizeBytes validation
    if (typeof asset.sizeBytes !== "number" || asset.sizeBytes <= 0) {
      errors.push(`[${key}] sizeBytes must be a positive number`);
    } else if (asset.sizeBytes > MAX_SINGLE_ASSET_BYTES) {
      errors.push(`[${key}] sizeBytes ${asset.sizeBytes} exceeds max ${MAX_SINGLE_ASSET_BYTES}`);
    } else {
      totalSizeBytes += asset.sizeBytes;
    }

    // MIME validation
    if (!asset.mime || typeof asset.mime !== "string") {
      warnings.push(`[${key}] mime is missing (recommended)`);
    }

    // Priority
    if (asset.priority === "optional") {
      optionalCount++;
    } else {
      criticalCount++;
    }
  }

  // Total size limit
  if (totalSizeBytes > MAX_TOTAL_MANIFEST_BYTES) {
    errors.push(`total manifest size ${totalSizeBytes} exceeds max ${MAX_TOTAL_MANIFEST_BYTES}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalSizeBytes,
    criticalCount,
    optionalCount,
  };
}

// ─── SHA-256 verification ──────────────────────────────────────────────────

async function computeSHA256(uri: string): Promise<string | null> {
  try {
    const Crypto = require("expo-crypto");
    const hash = await Crypto.digestFileAsync(uri, Crypto.CryptoDigestAlgorithm.SHA256);
    return hash;
  } catch {
    warn("[assetManifest] expo-crypto unavailable — cannot verify SHA-256");
    return null;
  }
}

/**
 * Verify a downloaded asset's integrity.
 * SHA-256 is mandatory for remote assets.
 * Returns true if valid, false + deletes file if mismatch or unverifiable.
 */
async function verifyIntegrity(localUri: string, item: AssetItem): Promise<boolean> {
  const actual = await computeSHA256(localUri);
  if (!actual) {
    // Cannot verify — delete to be safe (mandatory integrity)
    warn(`[assetManifest] Cannot compute SHA-256 for ${item.url} — deleting unverifiable asset`);
    await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
    return false;
  }

  if (actual.toLowerCase() !== item.sha256.toLowerCase()) {
    warn(`[assetManifest] Integrity mismatch: ${item.url} — expected ${item.sha256}, got ${actual}`);
    await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
    return false;
  }
  return true;
}

// ─── Retry with exponential backoff ────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  label: string,
): Promise<T | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxRetries) {
        warn(`[assetManifest] ${label} failed after ${maxRetries + 1} attempts`, e);
        return null;
      }
      const backoffMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      warn(`[assetManifest] ${label} attempt ${attempt + 1} failed, retrying in ${Math.round(backoffMs)}ms`);
      await delay(backoffMs);
    }
  }
  return null;
}

// ─── Bounded concurrency download queue ────────────────────────────────────

/**
 * Download assets with bounded concurrency.
 * Downloads max CONCURRENT assets at a time, with retry + timeout + atomic cache.
 *
 * Atomic download flow:
 *   1. Download to .tmp file
 *   2. Verify SHA-256
 *   3. If valid: rename .tmp → final path
 *   4. If invalid: delete .tmp
 *   → The final cache path is never exposed with partial/corrupt data
 */
async function downloadWithBoundedConcurrency(
  entries: [string, AssetItem][],
  baseDir: string,
  baseUrl: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let completed = 0;
  const total = entries.length;
  let bytesDownloaded = 0;

  // Process in batches of MAX_CONCURRENT_DOWNLOADS
  for (let i = 0; i < entries.length; i += MAX_CONCURRENT_DOWNLOADS) {
    const batch = entries.slice(i, i + MAX_CONCURRENT_DOWNLOADS);

    const batchResults = await Promise.all(
      batch.map(async ([key, item]) => {
        const fullUrl = item.url.startsWith("http") ? item.url : `${baseUrl}${item.url}`;
        const finalPath = localPath(baseDir, item);
        const tmpPath = finalPath + ".tmp";

        // Check if already cached and verified
        const info = await FileSystem.getInfoAsync(finalPath);
        if (info.exists) {
          const valid = await verifyIntegrity(finalPath, item);
          if (valid) {
            completed += 1;
            bytesDownloaded += item.sizeBytes;
            onProgress?.({ downloaded: completed, total, bytesDownloaded, totalBytes: entries.reduce((s, [, it]) => s + it.sizeBytes, 0) });
            return { key, uri: finalPath };
          }
          // Integrity failed — delete and re-download
          await FileSystem.deleteAsync(finalPath, { idempotent: true }).catch(() => {});
        }

        // Ensure parent directory exists
        const dir = finalPath.substring(0, finalPath.lastIndexOf("/") + 1);
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

        // Download with retry + timeout
        const downloaded = await withRetry(async () => {
          // Delete any stale .tmp from a previous failed attempt
          await FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});

          // Race download against timeout
          const downloadPromise = FileSystem.downloadAsync(fullUrl, tmpPath);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Download timeout: ${fullUrl}`)), DOWNLOAD_TIMEOUT_MS),
          );

          const res = await Promise.race([downloadPromise, timeoutPromise]);
          if (res.status !== 200) {
            await FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
            throw new Error(`HTTP ${res.status} for ${fullUrl}`);
          }

          // Verify integrity BEFORE exposing the file at its final path
          const valid = await verifyIntegrity(tmpPath, item);
          if (!valid) {
            throw new Error(`Integrity check failed: ${fullUrl}`);
          }

          // Atomic rename: .tmp → final path
          await FileSystem.moveAsync({ from: tmpPath, to: finalPath });
          return finalPath;
        }, MAX_RETRIES, `download:${key}`);

        completed += 1;
        bytesDownloaded += item.sizeBytes;
        onProgress?.({ downloaded: completed, total, bytesDownloaded, totalBytes: entries.reduce((s, [, it]) => s + it.sizeBytes, 0) });

        if (downloaded) {
          return { key, uri: downloaded };
        }
        return { key, uri: null };
      }),
    );

    for (const r of batchResults) {
      if (r.uri) result[r.key] = r.uri;
    }
  }

  return result;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch an asset manifest from the backend.
 * Validates the manifest before returning it.
 * Caches the result in memory — repeat calls are free.
 */
export async function fetchAssetManifest(
  assetSetId: string,
  manifestVersion: number,
): Promise<{ manifest: AssetManifest | null; validation: AssetManifestValidation | null }> {
  const cacheKey = `${assetSetId}:${manifestVersion}`;

  // Memory cache hit
  const cached = manifestCache.get(cacheKey);
  if (cached) {
    return {
      manifest: cached,
      validation: { valid: true, errors: [], warnings: [], totalSizeBytes: 0, criticalCount: 0, optionalCount: 0 },
    };
  }

  const rawManifest = await withRetry(async () => {
    const { getBackendOrigin } = require("../services/backendUrl");
    const origin = getBackendOrigin();
    const url = `${origin}/api/v1/game/assets/${assetSetId}?v=${manifestVersion}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Manifest fetch failed: ${res.status}`);
    }
    return res.json();
  }, MANIFEST_MAX_RETRIES, `fetchManifest:${assetSetId}`);

  if (!rawManifest) {
    return { manifest: null, validation: null };
  }

  // Validate before returning
  const validation = validateManifest(rawManifest, assetSetId, manifestVersion);
  if (!validation.valid) {
    warn(`[assetManifest] Manifest validation failed for ${assetSetId}:`, validation.errors);
    return { manifest: null, validation };
  }

  if (validation.warnings.length > 0) {
    warn(`[assetManifest] Manifest warnings for ${assetSetId}:`, validation.warnings);
  }

  const manifest = rawManifest as AssetManifest;
  manifestCache.set(cacheKey, manifest);
  return { manifest, validation };
}

/**
 * Download all assets in a manifest to the versioned cache directory.
 * Critical assets are downloaded first, then optional ones.
 * Returns a map of asset keys to local file URIs.
 * Uses bounded concurrency, retry with backoff, and atomic cache writes.
 */
export async function downloadManifestAssets(
  manifest: AssetManifest,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<Record<string, string>> {
  const baseDir = assetCacheDir(manifest.assetSetId, manifest.version);
  const entries = Object.entries(manifest.items);

  // Separate critical and optional assets
  const criticalEntries = entries.filter(([, item]) => item.priority !== "optional");
  const optionalEntries = entries.filter(([, item]) => item.priority === "optional");

  // Download critical assets first (blocks game start)
  const result = await downloadWithBoundedConcurrency(criticalEntries, baseDir, manifest.baseUrl, onProgress);

  // Download optional assets (can run after game starts)
  if (optionalEntries.length > 0) {
    // Best-effort: don't block game launch
    downloadWithBoundedConcurrency(optionalEntries, baseDir, manifest.baseUrl).then((optResult) => {
      Object.assign(result, optResult);
      // Update cache index with optional assets
      const indexKey = `${manifest.assetSetId}:${manifest.version}`;
      const existing = cacheIndex.get(indexKey) || new Set();
      Object.values(optResult).forEach((uri) => existing.add(uri));
      cacheIndex.set(indexKey, existing);
    }).catch(() => {});
  }

  // Update cache index with critical assets
  const indexKey = `${manifest.assetSetId}:${manifest.version}`;
  cacheIndex.set(indexKey, new Set(Object.values(result)));

  return result;
}

/**
 * Preload assets for a game before match start.
 * Called during matchmaking or game setup — downloads critical assets
 * so the game launches instantly when the match begins.
 *
 * Returns the resolved critical asset map, or null if the manifest is unavailable.
 * Optional assets continue downloading in the background.
 */
export async function preloadGameAssets(
  assetSetId: string,
  manifestVersion: number,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<Record<string, string> | null> {
  const { manifest, validation } = await fetchAssetManifest(assetSetId, manifestVersion);
  if (!manifest || !validation?.valid) return null;

  // Mark this asset set as active (prevents pruning during matches)
  activeAssetSets.add(assetSetId);

  return downloadManifestAssets(manifest, onProgress);
}

/**
 * Release an asset set from the active set (call when match ends).
 */
export function releaseAssetSet(assetSetId: string): void {
  activeAssetSets.delete(assetSetId);
}

/**
 * Check if all critical assets for an asset set are already cached.
 * Fast sync check — no network, no downloads.
 */
export function isAssetSetCached(assetSetId: string, version: number): boolean {
  const key = `${assetSetId}:${version}`;
  const index = cacheIndex.get(key);
  const manifest = manifestCache.get(key);
  if (!index || !manifest) return false;

  // Check that all critical assets are cached
  const criticalKeys = Object.entries(manifest.items)
    .filter(([, item]) => item.priority !== "optional")
    .map(([k]) => k);

  return criticalKeys.every((k) => {
    const item = manifest.items[k];
    const path = localPath(assetCacheDir(assetSetId, version), item);
    return index.has(path);
  });
}

/**
 * Get a cached asset URI by key.
 * Returns null if not cached.
 */
export function getCachedAsset(
  assetSetId: string,
  version: number,
  assetKey: string,
): string | null {
  const key = `${assetSetId}:${version}`;
  const index = cacheIndex.get(key);
  if (!index) return null;

  const manifest = manifestCache.get(key);
  if (!manifest) return null;

  const item = manifest.items[assetKey];
  if (!item) return null;

  const baseDir = assetCacheDir(assetSetId, version);
  const localUri = localPath(baseDir, item);
  return index.has(localUri) ? localUri : null;
}

/**
 * Prune old asset set versions from disk.
 *
 * Active-version-aware: keeps:
 *   - The current asset set + version
 *   - The previous version of the current asset set
 *   - Any asset set marked as active (referenced by an in-progress match)
 *
 * Everything else is deleted to reclaim disk space.
 */
export async function pruneOldAssetVersions(
  currentAssetSetId: string,
  currentVersion: number,
): Promise<void> {
  try {
    const rootInfo = await FileSystem.getInfoAsync(ROOT);
    if (!rootInfo.exists) return;

    const dirs = await FileSystem.readDirectoryAsync(ROOT);
    for (const dir of dirs) {
      // Never prune active asset sets (in-use by a match)
      if (activeAssetSets.has(dir) && dir !== currentAssetSetId) {
        continue;
      }

      if (dir === currentAssetSetId) {
        // Within the current asset set, keep current + previous version
        const versionDirs = await FileSystem.readDirectoryAsync(`${ROOT}${dir}/`);
        // Sort versions numerically (v1, v2, v3, ...)
        const sorted = versionDirs
          .filter((v) => v.startsWith("v"))
          .sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)));

        // Keep first two: current and previous
        const toKeep = new Set(sorted.slice(0, 2));
        for (const vDir of sorted) {
          if (!toKeep.has(vDir)) {
            await FileSystem.deleteAsync(`${ROOT}${dir}/${vDir}/`, { idempotent: true }).catch(() => {});
          }
        }
      } else {
        // Different asset set — prune entirely (unless active)
        await FileSystem.deleteAsync(`${ROOT}${dir}/`, { idempotent: true }).catch(() => {});
      }
    }
  } catch (e) {
    warn("[assetManifest] Prune failed", e);
  }
}

/**
 * Get the list of active (in-use) asset set IDs.
 * Useful for diagnostics and cache management UI.
 */
export function getActiveAssetSets(): string[] {
  return Array.from(activeAssetSets);
}

// ─── Game grid thumbnails ──────────────────────────────────────────────────

/**
 * Pre-download game grid thumbnails from backend-provided URLs.
 * Called on Games tab focus — ensures the grid shows local artwork
 * instead of fetching remote URLs on every render.
 *
 * Thumbnails are cached in the manifest cache directory under a
 * special "_thumbnails" asset set so they benefit from the same
 * pruning and cache management as game-specific assets.
 *
 * Returns a map of slug → local file URI for instant sync lookups.
 */
const THUMBNAIL_CACHE_DIR = `${ROOT}_thumbnails/`;
const thumbnailCache = new Map<string, string>();

export async function preloadGameThumbnails(
  games: Array<{ slug?: string; thumbnail?: string }>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  const toDownload = games.filter((g) => g.slug && g.thumbnail);
  if (toDownload.length === 0) return result;

  await Promise.all(
    toDownload.map(async (game) => {
      const slug = game.slug!;
      const url = game.thumbnail!;
      const filename = `${slug}.jpg`;
      const localUri = `${THUMBNAIL_CACHE_DIR}${filename}`;

      // Already cached in memory — skip disk check
      if (thumbnailCache.has(slug)) {
        result[slug] = thumbnailCache.get(slug)!;
        return;
      }

      // Already cached on disk
      try {
        const info = await FileSystem.getInfoAsync(localUri);
        if (info.exists) {
          thumbnailCache.set(slug, localUri);
          result[slug] = localUri;
          return;
        }
      } catch {}

      // Download (best-effort — never block the tab)
      try {
        await FileSystem.makeDirectoryAsync(THUMBNAIL_CACHE_DIR, { intermediates: true });
        const downloaded = await FileSystem.downloadAsync(url, localUri);
        if (downloaded.status === 200) {
          thumbnailCache.set(slug, localUri);
          result[slug] = localUri;
        }
      } catch {
        // Download failure must never block the games grid
      }
    }),
  );

  return result;
}

/**
 * Get a cached thumbnail URI for a game slug.
 * Returns null if not cached — caller falls back to the remote URL.
 */
export function getCachedThumbnail(slug: string): string | null {
  return thumbnailCache.get(slug) || null;
}

/**
 * Warm the thumbnail cache from disk on app start.
 * Reads previously downloaded thumbnails so they appear instantly
 * without waiting for the next preloadGameThumbnails call.
 */
export async function warmThumbnailCache(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(THUMBNAIL_CACHE_DIR);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(THUMBNAIL_CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith('.jpg')) continue;
      const slug = file.replace('.jpg', '');
      thumbnailCache.set(slug, `${THUMBNAIL_CACHE_DIR}${file}`);
    }
  } catch {}
}
