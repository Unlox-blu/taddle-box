/**
 * gameSound — centralized sound effects + haptic feedback for the game flow.
 *
 * - Sounds: expo-av (matches the project's existing audio approach, e.g.
 *   CreatePostModal) with all WAVs preloaded once and replayed on demand.
 * - Haptics: expo-haptics (light/medium impacts + success/error/warning).
 * - Preferences: persisted in SecureStore (same pattern as ThemeContext) and
 *   exposed through a live subscription + `useGameSoundPrefs` hook so the
 *   Settings screen and all game screens stay in sync.
 */
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";

export type SoundName =
  | "tick"
  | "go"
  | "turn"
  | "win"
  | "loss"
  | "tap"
  | "correct"
  | "error"
  | "snake"
  | "ladder"
  | "hop";

const SOUND_SOURCES: Record<SoundName, number> = {
  tick: require("../../assets/sounds/tick.wav"),
  go: require("../../assets/sounds/go.wav"),
  turn: require("../../assets/sounds/turn.wav"),
  win: require("../../assets/sounds/win.wav"),
  loss: require("../../assets/sounds/loss.wav"),
  tap: require("../../assets/sounds/tap.wav"),
  correct: require("../../assets/sounds/correct.wav"),
  error: require("../../assets/sounds/error.wav"),
  snake: require("../../assets/sounds/snake.wav"),
  ladder: require("../../assets/sounds/ladder.wav"),
  hop: require("../../assets/sounds/hop.wav"),
};

const SOUND_KEY = "game_soundEnabled";
const HAPTICS_KEY = "game_hapticsEnabled";

let soundEnabled = true;
let hapticsEnabled = true;
let initPromise: Promise<void> | null = null;
const soundCache = new Map<SoundName, Audio.Sound>();
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

/** Load preferences + preload all WAVs. Safe to call many times. */
export async function initGameSound(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      // Game sounds should play even when the device is on silent.
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const [s, h] = await Promise.all([
        SecureStore.getItemAsync(SOUND_KEY),
        SecureStore.getItemAsync(HAPTICS_KEY),
      ]);
      soundEnabled = s !== "false";
      hapticsEnabled = h !== "false";
      await Promise.all(
        (Object.keys(SOUND_SOURCES) as SoundName[]).map(async (name) => {
          const { sound } = await Audio.Sound.createAsync(SOUND_SOURCES[name]);
          soundCache.set(name, sound);
        }),
      );
    } catch (e) {
      console.warn("[gameSound] init failed", e);
    }
    notify();
  })();
  return initPromise;
}

function play(name: SoundName) {
  if (!soundEnabled) return;
  const sound = soundCache.get(name);
  if (!sound) {
    // Not loaded yet — trigger init; playback for this call is best-effort.
    initGameSound();
    return;
  }
  sound.replayAsync().catch(() => {
    /* ignore transient playback errors */
  });
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
