"use strict";
/**
 * GameStartScreen — pre-match lobby overlay (waiting → ready → match starting).
 *
 * UX flow (unchanged):
 *   1. Game identity + mode/round pills
 *   2. Player slots (VS layout for 2/teams, grid otherwise) with ready states
 *   3. Staged loading progress (Connecting → Loading assets → Players ready → All set)
 *   4. Rotating game tips while waiting
 *   5. MATCH STARTING banner when `ready` fires → onDone after 2.5s
 *
 * Visuals follow the app design system: bg.base canvas, glass surfaces,
 * primary→cyan gradients, radii/spacing/fontSizes tokens.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { gameSound } from "../media/game-sound";
import { useThemeColors } from "../../../design-system/theme/ThemeProvider";
import { fontSizes, radii, spacing, type ColorPalette } from "../../../design-system";
import GameLogo from "./GameLogo";
import type { Game } from "../../../shared/types";

export type StartPlayer = {
  id?: string;
  name: string;
  avatar?: string | null;
  isBot?: boolean;
  team?: number;
  seat?: number;
  isMe?: boolean;
};

type Props = {
  game: Game;
  myName: string;
  myAvatar?: string | null;
  myTeam?: number;
  opponents: StartPlayer[];
  modeLabel?: string;
  teamsLocked?: boolean;
  ready: boolean;
  onDone: () => void;
  onExit?: () => void;
  roundNumber?: number;
  roundTotal?: number;
  /** Backend-driven per-game tips (SSOT — no bundled fallback). */
  tips?: string[];
  /** Real start-stage signals — each stepper stage ticks only when genuine. */
  stageSignals?: {
    connected: boolean;
    assetsLoaded: boolean;
    playersReady: boolean;
  };
  /** Compact layout — used when the chat panel / keyboard shrinks the
   *  container so every piece reflows proportionally instead of clipping. */
  compact?: boolean;
};

const STAGES = [
  { icon: "wifi" as const, label: "Connecting" },
  { icon: "download" as const, label: "Loading assets" },
  { icon: "people" as const, label: "Players ready" },
  { icon: "checkmark-circle" as const, label: "All set" },
];

// ─── Player avatar with animated readiness ring ──────────────────────────────

function PlayerAvatar({
  player,
  colors,
  isReady,
  size = 72,
}: {
  player: StartPlayer;
  colors: ColorPalette;
  isReady: boolean;
  size?: number;
}) {
  const isBot = !!player.isBot;
  const ringColor = isReady
    ? colors.success
    : isBot
      ? colors.border
      : colors.primaryLight;

  // Waiting ring rotates continuously; freezes on ready with a green glow.
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isReady) {
      spin.stopAnimation();
      return;
    }
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [isReady, spin]);
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isReady) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0.35, duration: 900, useNativeDriver: false }),
      ]),
    ).start();
  }, [isReady, glow]);
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* Ready halo */}
      {isReady && (
        <Animated.View
          pointerEvents="none"
          style={[
            absoluteFill,
            { borderRadius: size / 2, backgroundColor: colors.success, opacity: glowOpacity },
          ]}
        />
      )}

      {/* Rotating arc ring while waiting / solid ring when ready */}
      {!isReady ? (
        <Animated.View
          pointerEvents="none"
          style={[
            absoluteFill,
            { borderRadius: size / 2, borderWidth: 2, borderColor: "transparent", borderTopColor: ringColor, borderRightColor: ringColor, transform: [{ rotate: spinDeg }] },
          ]}
        />
      ) : (
        <View
          pointerEvents="none"
          style={[
            absoluteFill,
            { borderRadius: size / 2, borderWidth: 2, borderColor: colors.success },
          ]}
        />
      )}

      {player.avatar ? (
        <Image
          source={{ uri: player.avatar }}
          style={{ width: size - 10, height: size - 10, borderRadius: (size - 10) / 2 }}
        />
      ) : (
        <LinearGradient
          colors={isBot ? [colors.bg.elevated, colors.bg.surface] : [colors.primary, colors.cyanDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: size - 10,
            height: size - 10,
            borderRadius: (size - 10) / 2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: isBot ? colors.text.muted : "#fff", fontSize: (size - 10) * 0.4, fontWeight: "900" }}>
            {isBot ? "🤖" : (player.name || "?")[0].toUpperCase()}
          </Text>
        </LinearGradient>
      )}

      {/* Ready checkmark */}
      {isReady && (
        <View style={[paStyles.readyCheck, { backgroundColor: colors.success }]}>
          <Ionicons name="checkmark" size={11} color="#fff" />
        </View>
      )}
    </View>
  );
}

const absoluteFill = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const paStyles = StyleSheet.create({
  readyCheck: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#070714",
  },
});

// ─── Player slot card ─────────────────────────────────────────────────────────

function PlayerSlot({
  player,
  index,
  phase,
  colors,
  styles,
  compact,
}: {
  player: StartPlayer;
  index: number;
  phase: string;
  colors: ColorPalette;
  styles: ReturnType<typeof makeStyles>;
  compact?: boolean;
}) {
  const slideIn = useRef(new Animated.Value(36)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideIn, {
        toValue: 0,
        friction: 8,
        tension: 100,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (phase === "ready") {
      Animated.spring(scale, {
        toValue: 1.06,
        friction: 5,
        useNativeDriver: true,
      }).start();
    }
  }, [phase]);

  const isReady = phase === "ready";
  const isMe = !!player.isMe;

  return (
    <Animated.View
      style={[styles.slot, { opacity: fadeIn, transform: [{ translateY: slideIn }, { scale }] }]}
    >
      <PlayerAvatar player={player} colors={colors} isReady={isReady} size={compact ? 44 : 72} />

      <Text style={styles.slotName} numberOfLines={1}>
        {player.isMe ? player.name : player.name || "Taddler"}
      </Text>

      <View
        style={[
          styles.slotBadge,
          isMe && styles.slotBadgeMe,
          isReady && styles.slotBadgeReady,
        ]}
      >
        <Ionicons
          name={isReady ? "checkmark-circle" : isMe ? "person" : "ellipsis-horizontal"}
          size={9}
          color={isReady ? colors.success : isMe ? colors.primaryLight : colors.text.muted}
        />
        <Text
          style={[
            styles.slotBadgeText,
            isMe && !isReady && { color: colors.primaryLight },
            isReady && { color: colors.success },
          ]}
        >
          {isReady ? "READY" : isMe ? "YOU" : "WAITING"}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── VS emblem ────────────────────────────────────────────────────────────────

function VsEmblem({ colors, styles }: { colors: ColorPalette; styles: ReturnType<typeof makeStyles> }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: false }),
      ]),
    ).start();
  }, []);
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });

  return (
    <View style={styles.vsWrap}>
      {/* Breathing halo behind the diamond */}
      <Animated.View
        pointerEvents="none"
        style={[
          absoluteFill,
          { borderRadius: radii.full, backgroundColor: colors.primary, opacity: haloOpacity, transform: [{ scale: haloScale }] },
        ]}
      />
      <LinearGradient
        colors={[colors.primary, colors.cyanDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.vsDiamond}
      >
        <Text style={styles.vsText}>VS</Text>
      </LinearGradient>
    </View>
  );
}

// ─── Rotating tips (backend SSOT only) ────────────────────────────────────

function RotatingTip({
  tips,
  colors,
  styles,
}: {
  tips: string[];
  colors: ColorPalette;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setIndex((prev) => (prev + 1) % tips.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [tips.length]);

  return (
    <Animated.View style={[styles.tipPill, { opacity: fadeAnim }]}>
      <Ionicons name="bulb" size={12} color={colors.xpGold} />
      <Text style={styles.tipPillText} numberOfLines={1} ellipsizeMode="tail">
        {tips[index]}
      </Text>
    </Animated.View>
  );
}

// ─── Staged loading progress ──────────────────────────────────────────────────

function LoadingStages({
  connected,
  assetsLoaded,
  playersReady,
  colors,
  styles,
}: {
  connected: boolean;
  assetsLoaded: boolean;
  playersReady: boolean;
  colors: ColorPalette;
  styles: ReturnType<typeof makeStyles>;
}) {
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Each stage ticks strictly from its real signal — no timers:
  //   Connecting     → runtime bundle resolved (module ready to mount)
  //   Loading assets → runtime preload promise resolved
  //   Players ready  → engine CONNECT_ACK (full roster acknowledged)
  //   All set        → everything above
  const stagesDone = [
    connected,
    connected && assetsLoaded,
    connected && assetsLoaded && playersReady,
    connected && assetsLoaded && playersReady,
  ];
  const currentStage = stagesDone.lastIndexOf(true);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (currentStage + 1) / STAGES.length,
      duration: 600,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [currentStage]);

  // Safety: never wedge the progress bar — if the engine hasn't acknowledged
  // within 12s, release the "Players ready" stage anyway (the start screen's
  // own timeout will surface a connection error instead of a fake green tick).
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    if (playersReady) return;
    const t = setTimeout(() => setGraceElapsed(true), 12000);
    return () => clearTimeout(t);
  }, [playersReady]);
  const effectiveStagesDone = stagesDone.map(
    (done, i) => done || (i <= 2 && graceElapsed),
  );
  const effCurrentStage = effectiveStagesDone.lastIndexOf(true);

  return (
    <View style={styles.stagesWrap}>
      {/* Segmented progress track */}
      <View style={styles.progressTrack}>
        {STAGES.map((_, i) => {
          const stageFraction = (i + 1) / STAGES.length;
          const prevFraction = i / STAGES.length;
          return (
            <View key={i} style={styles.progressSegment}>
              <Animated.View
                style={[
                  styles.progressSegmentFill,
                  i < STAGES.length - 1 && { marginRight: 4 },
                  {
                    width: progressAnim.interpolate({
                      inputRange: [prevFraction, stageFraction],
                      outputRange: ["0%", "100%"],
                      extrapolate: "clamp",
                    }),
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.stagesRow}>
        {STAGES.map((stage, i) => {
          const isActive = i <= effCurrentStage;
          const isCurrent = i === effCurrentStage && effCurrentStage < STAGES.length - 1;
          return (
            <View key={i} style={styles.stageItem}>
              <View
                style={[
                  styles.stageDot,
                  isActive && styles.stageDotActive,
                  isCurrent && { borderColor: colors.primaryLight },
                ]}
              >
                <Ionicons
                  name={isActive ? "checkmark" : stage.icon}
                  size={10}
                  color={isActive ? "#fff" : colors.text.muted}
                />
                {isCurrent && (
                  <View
                    pointerEvents="none"
                    style={[styles.stageDotPulse, { backgroundColor: colors.primaryLight }]}
                  />
                )}
              </View>
              <Text style={[styles.stageLabel, isActive && styles.stageLabelActive]} numberOfLines={1}>
                {stage.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function GameStartScreen({
  game,
  myName,
  myAvatar,
  myTeam,
  opponents,
  modeLabel,
  teamsLocked,
  ready,
  onDone,
  onExit,
  roundNumber,
  roundTotal,
  tips,
  stageSignals,
  compact: compactProp,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { height: winH, width: winW } = useWindowDimensions();

  // Compact layout: explicitly requested (chat panel / keyboard shrunk the
  // stage) OR the device itself is too short for the full layout. Small
  // tablets/landscape get the same proportional treatment.
  const compact = !!compactProp || winH < 620 || (winH < 500 && winW > winH);

  const styles = useMemo(
    () => makeStyles(colors, insets.bottom || 0, compact),
    [colors, insets.bottom, compact],
  );

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const [phase, setPhase] = useState<"waiting" | "ready">("waiting");
  const [showMatchStarting, setShowMatchStarting] = useState(false);

  // Backend tips are the only source — no bundled fallback. If none were
  // delivered, the pill simply doesn't render.
  const serverTips = tips?.length ? tips : null;

  // Real stage signals from GamesScreen: socket ack, runtime preload, and
  // engine CONNECT_ACK. Falls back to optimistic "connected" only while a
  // signal prop hasn't been provided at all (legacy callers).
  const effectiveStageSignals = {
    connected: stageSignals?.connected ?? true,
    assetsLoaded: stageSignals?.assetsLoaded ?? true,
    playersReady: stageSignals?.playersReady ?? false,
  };

  useEffect(() => {
    if (ready && phase === "waiting") {
      setPhase("ready");
      gameSound.playMatchStart();
      setTimeout(() => setShowMatchStarting(true), 600);
    }
  }, [ready, phase]);

  useEffect(() => {
    if (phase !== "ready") return;
    const t = setTimeout(() => onDoneRef.current(), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  const bgGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgGlow, { toValue: 1, duration: 2500, useNativeDriver: false }),
        Animated.timing(bgGlow, { toValue: 0, duration: 2500, useNativeDriver: false }),
      ]),
    ).start();
  }, []);

  const readyPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!showMatchStarting) return;
    Animated.spring(readyPulse, {
      toValue: 1,
      friction: 4,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [showMatchStarting]);

  const gradient: [string, string] =
    game.gradient?.length === 2
      ? (game.gradient as [string, string])
      : [colors.primary, colors.cyanDark];

  const bgGlowOpacity = bgGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.2],
  });

  const allSlots = useMemo(() => {
    const me: StartPlayer = {
      id: "me",
      name: myName,
      avatar: myAvatar,
      isMe: true,
      team: myTeam,
    };
    return [me, ...(opponents || [])];
  }, [myName, myAvatar, myTeam, opponents]);

  const team1 = useMemo(
    () => allSlots.filter((p) => !teamsLocked || p.team === 1),
    [allSlots, teamsLocked],
  );
  const team2 = useMemo(
    () => allSlots.filter((p) => teamsLocked && p.team === 2),
    [allSlots, teamsLocked],
  );

  const isDuel = !teamsLocked && team1.length === 2;

  return (
    <View
      style={[
        styles.root,
        { paddingTop: compact ? (insets.top || 16) * 0.5 + spacing.xs : (insets.top || 16) + spacing.sm },
      ]}
    >
      {/* Ambient game-tinted glow over the base canvas */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: bgGlowOpacity }]}
      >
        <LinearGradient
          colors={[gradient[0], "transparent", gradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["transparent", colors.bg.base]}
          start={{ x: 0.5, y: 0.35 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* ── Game identity + mode / round ── */}
      <View style={styles.header}>
        <GameLogo game={game as any} size={compact ? 34 : 52} radius={compact ? 10 : 14} />
        <Text style={styles.gameName} numberOfLines={1}>{game.name}</Text>
        <View style={styles.pillRow}>
          <View style={styles.modePill}>
            <Ionicons name="flash" size={10} color={colors.primaryLight} />
            <Text style={styles.modePillText}>{modeLabel || "MATCHMAKING"}</Text>
          </View>
          {roundNumber != null && roundTotal != null && roundTotal > 1 && (
            <View style={styles.modePill}>
              <Ionicons name="repeat" size={10} color={colors.cyanLight} />
              <Text style={[styles.modePillText, { color: colors.cyanLight }]}>
                ROUND {roundNumber}/{roundTotal}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Players ── */}
      <View style={styles.slotsSection}>
        {teamsLocked && team2.length > 0 ? (
          <View style={styles.teamVsLayout}>
            <View style={styles.teamColumn}>
              <Text style={styles.teamLabel}>TEAM 1</Text>
              {team1.map((p, i) => (
                <PlayerSlot key={p.id || i} player={p} index={i} phase={phase} colors={colors} styles={styles} compact={compact} />
              ))}
            </View>
            <VsEmblem colors={colors} styles={styles} />
            <View style={styles.teamColumn}>
              <Text style={styles.teamLabel}>TEAM 2</Text>
              {team2.map((p, i) => (
                <PlayerSlot key={p.id || i} player={p} index={i} phase={phase} colors={colors} styles={styles} compact={compact} />
              ))}
            </View>
          </View>
        ) : isDuel ? (
          <View style={styles.duelLayout}>
            <PlayerSlot player={team1[0]} index={0} phase={phase} colors={colors} styles={styles} compact={compact} />
            <VsEmblem colors={colors} styles={styles} />
            <PlayerSlot player={team1[1]} index={1} phase={phase} colors={colors} styles={styles} compact={compact} />
          </View>
        ) : (
          <View style={styles.gridWrap}>
            {team1.map((p, i) => (
              <PlayerSlot key={p.id || i} player={p} index={i} phase={phase} colors={colors} styles={styles} compact={compact} />
            ))}
          </View>
        )}
      </View>

      {/* ── Bottom: stages / match-starting ── */}
      <View style={styles.bottomSection}>
        {/* Tips pill sits in flow, directly above the stepper / banner */}
        {phase === "waiting" && serverTips && (
          <View style={styles.tipPillRow} pointerEvents="none">
            <RotatingTip tips={serverTips} colors={colors} styles={styles} />
          </View>
        )}
        {showMatchStarting ? (
          <View style={styles.matchStartingWrap}>
            <Animated.View
              style={[
                styles.matchStartingBanner,
                {
                  opacity: readyPulse,
                  transform: [
                    {
                      scale: readyPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1],
                      }),
                    },
                    {
                      translateY: readyPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={[colors.success + "26", colors.success + "0A"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              {/* Leading pulse dot — alive, replaces the icon pair */}
              <View style={styles.matchStartingPulseWrap}>
                <View style={[styles.matchStartingPulseDot, { backgroundColor: colors.success + "55" }]} />
                <View style={styles.matchStartingDot} />
              </View>
              <Text style={[styles.matchStartingText, { textShadowColor: colors.success + "AA" }]}>
                MATCH STARTING
              </Text>
            </Animated.View>
          </View>
        ) : (
          <LoadingStages
            connected={effectiveStageSignals.connected}
            assetsLoaded={effectiveStageSignals.assetsLoaded}
            playersReady={effectiveStageSignals.playersReady}
            colors={colors}
            styles={styles}
          />
        )}
      </View>

      {/* (tips pill moved into bottomSection — it overlaid the stepper) */}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette, bottomInset: number, compact: boolean) {
  // Compact mode: every fixed dimension scales proportionally so the whole
  // composition keeps its shape inside a shrunk container (chat open /
  // keyboard up / short screens) instead of clipping or overlapping.
  const k = compact ? 0.68 : 1; // linear scale for paddings/gaps
  const s = compact ? 0.6 : 1; // scale for component sizes (slots, VS, dots)

  return StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.bg.base,
      overflow: "hidden",
      paddingBottom: compact ? spacing.md : spacing.xl,
    },

    // header
    header: { alignItems: "center", zIndex: 10, gap: Math.round(8 * k) },
    gameName: {
      color: c.text.primary,
      fontSize: compact ? fontSizes.md : fontSizes.lg,
      fontWeight: "800",
      letterSpacing: 0.3,
    },
    pillRow: { flexDirection: "row", gap: spacing.sm },
    modePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: spacing.md,
      paddingVertical: 5,
      borderRadius: radii.full,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.glassBorder,
    },
    modePillText: {
      color: c.primaryLight,
      fontSize: fontSizes.xs,
      fontWeight: "800",
      letterSpacing: 1.2,
    },

    // slots
    slotsSection: {
      width: "100%",
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 5,
    },
    duelLayout: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      maxWidth: 460,
      gap: Math.round(spacing.md * k),
    },
    teamVsLayout: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      width: "100%",
      maxWidth: 460,
    },
    teamColumn: { alignItems: "center", gap: Math.round(spacing.md * k) },
    teamLabel: {
      color: c.text.muted,
      fontSize: fontSizes.xs,
      fontWeight: "800",
      letterSpacing: 2,
    },
    gridWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: Math.round(spacing.md * k),
      maxWidth: 480,
    },

    // VS emblem
    vsWrap: {
      width: Math.round(56 * s),
      height: Math.round(56 * s),
      alignItems: "center",
      justifyContent: "center",
      marginHorizontal: Math.round(spacing.md * k),
    },
    vsDiamond: {
      width: Math.round(44 * s),
      height: Math.round(44 * s),
      borderRadius: Math.round(12 * s),
      transform: [{ rotate: "45deg" }],
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.25)",
      shadowColor: c.primary,
      shadowOpacity: 0.6,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
    vsText: {
      color: "#fff",
      fontSize: Math.round(13 * s),
      fontWeight: "900",
      fontStyle: "italic",
      transform: [{ rotate: "-45deg" }],
    },

    // player slot card
    slot: {
      alignItems: "center",
      paddingVertical: Math.round(spacing.lg * k),
      paddingHorizontal: Math.round(spacing.md * k),
      borderRadius: Math.round(radii.xl * k),
      backgroundColor: c.glass,
      borderWidth: 1,
      borderColor: c.glassBorder,
      gap: Math.round(10 * k),
      width: Math.round(124 * s),
    },
    slotName: {
      color: c.text.primary,
      fontSize: fontSizes.sm,
      fontWeight: "700",
      maxWidth: "100%",
    },
    slotBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: radii.full,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    slotBadgeMe: { borderColor: c.primaryLight + "55" },
    slotBadgeReady: { borderColor: c.success + "66", backgroundColor: c.success + "14" },
    slotBadgeText: {
      color: c.text.muted,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.2,
    },

    // bottom section
    bottomSection: { width: "100%", zIndex: 10, gap: Math.round(spacing.md * k) },

    // match starting banner — compact gradient chip
    matchStartingWrap: { alignItems: "center" },
    matchStartingBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: Math.round(10 * k),
      paddingHorizontal: Math.round(spacing.lg * k),
      paddingVertical: Math.round(12 * k),
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: c.success + "4D",
      backgroundColor: c.bg.elevated,
      overflow: "hidden",
      shadowColor: c.success,
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
    matchStartingText: {
      color: "#fff",
      fontSize: Math.round(15 * s),
      fontWeight: "900",
      letterSpacing: 3,
      textShadowRadius: 8,
      textShadowOffset: { width: 0, height: 0 },
    },
    matchStartingPulseWrap: {
      width: 10,
      height: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    matchStartingPulseDot: {
      position: "absolute",
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    matchStartingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.success,
    },

    // staged progress
    stagesWrap: { width: "100%" },
    progressTrack: {
      flexDirection: "row",
      marginBottom: Math.round(spacing.md * k),
      borderRadius: radii.full,
      overflow: "hidden",
    },
    progressSegment: {
      flex: 1,
      height: 4,
      marginRight: 4,
      borderRadius: radii.full,
      backgroundColor: c.glass,
      overflow: "hidden",
    },
    progressSegmentFill: {
      height: "100%",
      borderRadius: radii.full,
      backgroundColor: c.primaryLight,
    },
    stagesRow: { flexDirection: "row", justifyContent: "space-between" },
    stageItem: { alignItems: "center", gap: 6, flex: 1 },
    stageDot: {
      width: Math.round(24 * s),
      height: Math.round(24 * s),
      borderRadius: Math.round(12 * s),
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      overflow: "visible",
    },
    stageDotActive: { backgroundColor: c.primary, borderColor: c.primary },
    stageDotPulse: {
      position: "absolute",
      top: -2,
      left: -2,
      right: -2,
      bottom: -2,
      borderRadius: Math.round(14 * s),
      opacity: 0.25,
    },
    stageLabel: {
      color: c.text.muted,
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 0.5,
      textAlign: "center",
    },
    stageLabelActive: { color: c.text.secondary },

    // tips pill — small, centered, in flow above the stepper
    tipPillRow: {
      width: "100%",
      alignItems: "center",
    },
    tipPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: c.glass,
      borderRadius: radii.full,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: c.glassBorder,
      maxWidth: "82%",
    },
    tipPillText: {
      color: c.text.secondary,
      fontSize: 11,
      fontWeight: "600",
      lineHeight: 14,
      flexShrink: 1,
    },
  });
}
