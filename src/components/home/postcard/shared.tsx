import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View, AppState } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEvent } from "expo";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { fontSizes, spacing, type ColorPalette } from "../../../theme";

// ── Video player count tracker (debug instrumentation) ─────────────────────
// Temporary: logs active/preloaded player count to help verify ≤2 players.
let _activePlayerCount = 0;
let _preloadPlayerCount = 0;
const _playerLog = (label: string, url: string) => {
  if (__DEV__) {
    console.log(
      `[VideoPlayer] ${label} | active=${_activePlayerCount} preload=${_preloadPlayerCount} total=${_activePlayerCount + _preloadPlayerCount} | ${url.slice(0, 60)}`,
    );
  }
};

// ── formatInstagramTime ─────────────────────────────────────────────────────
export const formatInstagramTime = (dateString: string | undefined | null): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSecs = Math.floor(diffInMs / 1000);
  const diffInMins = Math.floor(diffInSecs / 60);
  const diffInHrs = Math.floor(diffInMins / 60);
  const diffInDays = Math.floor(diffInHrs / 24);
  if (diffInSecs < 60) return "Just now";
  if (diffInMins < 60) return `${diffInMins} minute${diffInMins > 1 ? "s" : ""} ago`;
  if (diffInHrs < 24) return `${diffInHrs} hour${diffInHrs > 1 ? "s" : ""} ago`;
  if (diffInDays === 1) return "Yesterday";
  if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (now.getFullYear() !== date.getFullYear()) options.year = "numeric";
  return date.toLocaleDateString("en-US", options);
};

// ── RollingText: cycles through items one-by-one ────────────────────────────
export const RollingText = ({
  items,
  isActive = true,
}: {
  items: React.ReactNode[];
  isActive?: boolean;
}) => {
  const [current, setCurrent] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isActive || items.length <= 1) return;
    const timer = setInterval(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setCurrent((prev) => (prev + 1) % items.length);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [isActive, items.length]);

  return <Animated.View style={{ opacity }}>{items[current]}</Animated.View>;
};

// ── FeedVideo: expo-video player with imperative mute/play/release ──────────
// Legacy component — used only for background audio playback.
// For feed video, prefer ActiveVideo + VideoPoster.
export const FeedVideo = ({
  url,
  width,
  height,
  active,
  muted,
  loop = true,
  onDuration,
}: {
  url: string;
  width: number;
  height: number;
  active: boolean;
  muted: boolean;
  loop?: boolean;
  onDuration?: (durationMillis: number) => void;
}) => {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = loop;
  });

  // Track player count
  useEffect(() => {
    _activePlayerCount++;
    _playerLog('+active(legacy)', url);
    return () => {
      _activePlayerCount = Math.max(0, _activePlayerCount - 1);
      _playerLog('-active(legacy)', url);
    };
  }, [url]);

  useEffect(() => {
    return () => {
      try { player.release(); } catch {}
    };
  }, [player]);

  // Release on background (not just pause)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        try { player.release(); } catch {}
      }
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    if (active) {
      player.play();
    } else {
      player.pause();
    }
  }, [active, player]);

  const reported = useRef(false);
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => {
    if (status === "readyToPlay" && !reported.current) {
      reported.current = true;
      onDuration?.(Math.round(player.duration * 1000));
    }
  }, [status, player]);

  return <VideoView style={{ width, height }} player={player} nativeControls={false} allowsFullscreen={false} contentFit="cover" useExoShutter={false} />;
};

// ── ActiveVideo: player-owning component, mounts ONLY when active ──────────
// When this unmounts, the player is released. No player exists in memory
// while this component is not in the tree.
export const ActiveVideo = ({
  url,
  width,
  height,
  muted,
  loop = true,
  preloadOnly = false,
  onDuration,
}: {
  url: string;
  width: number;
  height: number;
  muted: boolean;
  loop?: boolean;
  preloadOnly?: boolean;
  onDuration?: (durationMillis: number) => void;
}) => {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = loop;
  });

  // Track player count
  useEffect(() => {
    if (preloadOnly) {
      _preloadPlayerCount++;
      _playerLog('+preload', url);
    } else {
      _activePlayerCount++;
      _playerLog('+active', url);
    }
    return () => {
      if (preloadOnly) {
        _preloadPlayerCount = Math.max(0, _preloadPlayerCount - 1);
        _playerLog('-preload', url);
      } else {
        _activePlayerCount = Math.max(0, _activePlayerCount - 1);
        _playerLog('-active', url);
      }
    };
  }, [preloadOnly, url]);

  // Release on unmount
  useEffect(() => {
    return () => {
      try { player.release(); } catch {}
    };
  }, [player]);

  // Strong background handling: release player entirely (not just pause)
  // This frees native decoder/surface resources, not just stopping playback.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        try { player.release(); } catch {}
      }
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  // Auto-play on mount (skip if preloadOnly — just buffer)
  useEffect(() => {
    if (!preloadOnly) {
      player.play();
    }
  }, [player, preloadOnly]);

  const reported = useRef(false);
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => {
    if (status === "readyToPlay" && !reported.current) {
      reported.current = true;
      onDuration?.(Math.round(player.duration * 1000));
    }
  }, [status, player]);

  return <VideoView style={{ width, height }} player={player} nativeControls={false} allowsFullscreen={false} contentFit="cover" useExoShutter={false} />;
};

// ── VideoPoster: static thumbnail, NO player in memory ──────────────────────
// Shows a poster/placeholder while the video is not active.
// The URL here is the video URL — expo-image can display the first frame
// as a static image (it will show a black frame for videos, but the
// important thing is: zero player memory).
export const VideoPoster = ({
  url,
  previewUrl,
  width,
  height,
}: {
  url: string;
  previewUrl?: string;
  width: number;
  height: number;
}) => {
  return (
    <View style={{ width, height, backgroundColor: "#000" }}>
      {previewUrl ? (
        <Image
          source={{ uri: previewUrl }}
          style={{ width, height }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : null}
    </View>
  );
};

// ── FeedAudio: lightweight audio player using expo-audio ────────────────────
// Replaces the old FeedVideo(1×1) hack. Uses the proper audio API.
export const FeedAudio = ({
  url,
  active,
  muted,
  loop = false,
  onDuration,
}: {
  url: string;
  active: boolean;
  muted: boolean;
  loop?: boolean;
  onDuration?: (durationMillis: number) => void;
}) => {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = loop;
  });

  // Release on unmount
  useEffect(() => {
    return () => {
      try { player.release(); } catch {}
    };
  }, [player]);

  // Pause when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        try { player.release(); } catch {}
      }
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    if (active) {
      player.play();
    } else {
      player.pause();
    }
  }, [active, player]);

  const reported = useRef(false);
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => {
    if (status === "readyToPlay" && !reported.current) {
      reported.current = true;
      onDuration?.(Math.round(player.duration * 1000));
    }
  }, [status, player]);

  // Renders nothing visible — purely for audio playback
  return null;
};

// ── Styles shared across sub-components ─────────────────────────────────────
export type PostCardStyles = ReturnType<typeof makePostCardStyles>;

export function makePostCardStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardFullBleed: {
      marginHorizontal: 0,
      marginBottom: 0,
      backgroundColor: "transparent",
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md,
      gap: 10,
    },
    authorRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 10,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarEmoji: { fontSize: 18 },
    meta: { flex: 1 },
    author: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: c.text.primary,
    },
    sub: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 1 },
    xpPill: {
      backgroundColor: "rgba(251,191,36,0.11)",
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.24)",
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 999,
    },
    xpText: { fontSize: fontSizes.xs, fontWeight: "800", color: c.xpGold },
    body: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    title: {
      fontSize: fontSizes.lg,
      fontWeight: "700",
      color: c.text.primary,
      marginBottom: 6,
    },
    content: {
      fontSize: fontSizes.md,
      color: c.text.primary,
      lineHeight: 21,
      marginBottom: 8,
    },
    imageBanner: {
      height: 180,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    imageBannerEmoji: { fontSize: 52 },
    imageBannerLabel: {
      position: "absolute",
      bottom: 10,
      left: 10,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 8,
    },
    imageBannerLabelText: { fontSize: fontSizes.xs, color: c.text.secondary },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 14,
    },
    action: { flexDirection: "row", alignItems: "center", gap: 5 },
    actionText: { fontSize: fontSizes.sm, color: c.text.muted },
    spacer: { flex: 1 },
    toastOverlay: {
      flex: 1,
      alignItems: "center",
      paddingTop: 64,
    },
    toastPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    toastText: {
      fontSize: fontSizes.sm,
      fontWeight: "600",
    },
  });
}
