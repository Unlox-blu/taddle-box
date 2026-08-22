/**
 * gameSound — centralized sound effects + haptic feedback for the game flow.
 *
 * - Sounds: expo-audio (SDK 54 successor to expo-av). The WAVs are NOT
 *   bundled in the APK anymore — they download to the app cache the first
 *   time a game is played (gameAssets.ensureGameAssets) and initGameSound
 *   creates players from the cached files. Sounds that aren't cached yet
 *   simply play nothing (best-effort, never a crash).
 * - Haptics: expo-haptics (light/medium impacts + success/error/warning).
 * - Preferences: persisted in SecureStore (same pattern as ThemeContext) and
 *   exposed through a live subscription + `useGameSoundPrefs` hook so the
 *   Settings screen and all game screens stay in sync.
 */
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import { GAME_SOUND_NAMES } from "../games/assets";
import { warn } from '../utils/logger';
import { getCachedSoundUri } from "../games/gameAssets";

export type SoundName = (typeof GAME_SOUND_NAMES)[number];

const SOUND_KEY = "game_soundEnabled";
const HAPTICS_KEY = "game_hapticsEnabled";

let soundEnabled = true;
let hapticsEnabled = true;
let prefsLoaded = false;
// In-flight guard so concurrent initGameSound calls don't double-build.
let building = false;
const soundCache = new Map<SoundName, AudioPlayer>();
// Sounds whose players were already created — prevents leaking a native
// player when initGameSound re-runs after new files get cached.
const loadedSounds = new Set<SoundName>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* subscriber error must not break the audio pipeline */
    }
  });
}

/**
 * Load preferences + build players for every sound currently cached on disk.
 * Safe to call many times. NEVER downloads — after a PLAY tap caches the WAVs
 * (gameAssets.ensureGameAssets), call initGameSound again to pick them up.
 */
export async function initGameSound(): Promise<void> {
  if (building) return;
  building = true;
  try {
    // Game sounds should play even when the device is on silent.
    await setAudioModeAsync({ playsInSilentMode: true });
    if (!prefsLoaded) {
      const [s, h] = await Promise.all([
        SecureStore.getItemAsync(SOUND_KEY),
        SecureStore.getItemAsync(HAPTICS_KEY),
      ]);
      soundEnabled = s !== "false";
      hapticsEnabled = h !== "false";
      prefsLoaded = true;
    }
    await Promise.all(
      GAME_SOUND_NAMES.map(async (name) => {
        if (loadedSounds.has(name)) return;
        const uri = await getCachedSoundUri(name);
        if (uri) {
          soundCache.set(name, createAudioPlayer(uri));
          loadedSounds.add(name);
        }
      }),
    );
  } catch (e) {
    warn("[gameSound] init failed", e);
  } finally {
    building = false;
  }
  notify();
}

/**
 * Releases all native AudioPlayer instances and clears the cache.
 * Call this when the game session ends or on logout to free native memory.
 * initGameSound() will recreate players on next use.
 */
export async function destroyGameSound(): Promise<void> {
  for (const [, player] of soundCache) {
    try { player.remove(); } catch { /* best-effort */ }
  }
  soundCache.clear();
  loadedSounds.clear();
  building = false;
}

function play(name: SoundName) {
  if (!soundEnabled) return;
  const player = soundCache.get(name);
  if (!player) {
    // Not cached (or not loaded yet) — trigger init; playback for this call
    // is best-effort. init only ever reads the cache, it never downloads.
    initGameSound();
    return;
  }
  // Restart from the beginning (expo-audio has no replayAsync).
  player.seekTo(0);
  player.play();
}

function haptic(kind: "light" | "medium" | "success" | "error" | "warning") {
  if (!hapticsEnabled) return;
  const p =
    kind === "light"
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : kind === "medium"
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        : kind === "success"
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          : kind === "error"
            ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
            : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  p.catch(() => {
    /* haptics unavailable (e.g. web) — ignore */
  });
}

/** Public sound+haptic API used across the game flow. */
export const gameSound = {
  /** Countdown number tick (3, 2, 1) */
  playTick: () => {
    play("tick");
    haptic("light");
  },
  /** Bouncy hop — a coin starting its walk (synced with the walk ticks) */
  playHop: () => {
    play("hop");
    haptic("light");
  },
  /** GO! launch */
  playGo: () => {
    play("go");
    haptic("medium");
  },
  /** Your turn cue */
  playTurn: () => {
    play("turn");
    haptic("light");
  },
  /** Victory fanfare */
  playWin: () => {
    play("win");
    haptic("success");
  },
  /** Defeat tone */
  playLoss: () => {
    play("loss");
    haptic("error");
  },
  /** Quick interaction (tap, dice roll, token move) */
  playTap: () => {
    play("tap");
    haptic("light");
  },
  /** Correct word / pattern */
  playCorrect: () => {
    play("correct");
    haptic("light");
  },
  /** Invalid move / wrong word */
  playError: () => {
    play("error");
    haptic("warning");
  },
  /** Snake bite — slithery descending buzz */
  playSnake: () => {
    play("snake");
    haptic("error");
  },
  /** Ladder climb — bright ascending chime */
  playLadder: () => {
    play("ladder");
    haptic("success");
  },
};

// ── Preferences ──────────────────────────────────────────────────────────────

export function subscribeGameSound(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export async function setSoundEnabled(v: boolean) {
  soundEnabled = v;
  try {
    await SecureStore.setItemAsync(SOUND_KEY, v ? "true" : "false");
  } catch {
    /* persistence failure is non-fatal */
  }
  notify();
}

export async function setHapticsEnabled(v: boolean) {
  hapticsEnabled = v;
  try {
    await SecureStore.setItemAsync(HAPTICS_KEY, v ? "true" : "false");
  } catch {
    /* persistence failure is non-fatal */
  }
  notify();
}

/** Reactive prefs hook for the Settings screen. */
export function useGameSoundPrefs() {
  const [state, setState] = useState({ soundEnabled, hapticsEnabled });

  useEffect(() => {
    // Re-sync after init resolves so a Settings screen that mounts after the
    // app-startup init has already finished never shows stale defaults.
    initGameSound().then(() => {
      setState({ soundEnabled, hapticsEnabled });
    });
    return subscribeGameSound(() =>
      setState({ soundEnabled, hapticsEnabled }),
    );
  }, []);

  return {
    ...state,
    setSoundEnabled,
    setHapticsEnabled,
  };
}

/**
 * Plays the "your turn" cue when `isMyTurn` transitions false → true.
 * `active` gates the cue (e.g. only while the match status is "active").
 */
export function useTurnSound(isMyTurn: boolean, active = true) {
  const prev = useRef(false);

  useEffect(() => {
    if (active && isMyTurn && !prev.current) {
      gameSound.playTurn();
    }
    prev.current = isMyTurn;
  }, [isMyTurn, active]);
}
