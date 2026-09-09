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
};

const GAME_TIPS: Record<string, string[]> = {
  chess: [
    "Control the center — it's the key to winning!",
    "Don't bring your queen out too early in the opening.",
    "Every piece has a value — protect yours wisely.",
    "Castling keeps your king safe and activates your rook.",
    "Develop your minor pieces before pushing pawns.",
  ],
  ludo: [
    "Safe zones are your best friend — opponents can't capture you there!",
    "Sometimes blocking matters more than racing home.",
    "Rolling double sixes gives you an extra turn.",
    "Keep one piece on a safe square while the others move.",
    "Leading doesn't guarantee winning — every piece must finish.",
  ],
  "snake-ladder": [
    "Luck is everything — but every step counts!",
    "Snakes pull you down, ladders push you up.",
    "A hot streak can change the entire game.",
    "Don't give up — anything can happen in Snakes & Ladders.",
    "Enjoy the ride — surprises are around every corner.",
  ],
  scribble: [
    "Keep it simple but recognizable — others need to guess!",
    "Time is limited — draw the most important features first.",
    "Watch every stroke — the clues are in the drawing.",
    "A good drawer knows when to stop adding detail.",
    "Think like a guesser — what's the one thing that stands out?",
  ],
  "word-rush": [
    "Look for long words first — they score more points!",
    "Check corners and edges — good words hide there.",
    "When time is tight, go for quick 3-letter words.",
    "The letter S and plurals are your best allies.",
    "Remember: both speed and quality matter.",
  ],
  "tap-rush": [
    "Speed matters — but accuracy matters more!",
    "Consecutive taps trigger combo bonuses.",
    "Find your rhythm — don't just tap randomly.",
    "Watch your opponent's pace — adjust yours accordingly.",
    "The final sprint can decide the winner.",
  ],
  "memory-grid": [
    "Use patterns to help remember — group cards mentally.",
    "Flip easy-to-remember positions first.",
    "Keep track of cards you've already seen.",
    "Focus beats speed — take your time.",
    "Mentally mark positions as you flip.",
  ],
};

const GENERAL_TIPS = [
  "A great start is half the battle — stay focused!",
  "Relax and enjoy the game — that's when you play best.",
  "Observe your opponent's strategy — information is power.",
  "Every game is a chance to learn something new.",
  "Take a deep breath, stay calm, and play your best.",
];

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
}: {
  player: StartPlayer;
  index: number;
  phase: string;
  colors: ColorPalette;
  styles: ReturnType<typeof makeStyles>;
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
      <PlayerAvatar player={player} colors={colors} isReady={isReady} />

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

// ─── Rotating tips ────────────────────────────────────────────────────────────

function RotatingTip({ game, colors, styles }: { game: Game; colors: ColorPalette; styles: ReturnType<typeof makeStyles> }) {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const tips = useMemo(() => {
    const gameTips = GAME_TIPS[game.slug || ""] || [];
    return [...gameTips, ...GENERAL_TIPS];
  }, [game.slug]);

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
    <Animated.View style={[styles.tipCard, { opacity: fadeAnim }]}>
      <View style={styles.tipIconWrap}>
        <Ionicons name="bulb" size={13} color={colors.xpGold} />
      </View>
      <Text style={styles.tipText} numberOfLines={2}>
        {tips[index]}
      </Text>
    </Animated.View>
  );
}

// ─── Staged loading progress ──────────────────────────────────────────────────

function LoadingStages({
  ready,
  colors,
  styles,
}: {
  ready: boolean;
  colors: ColorPalette;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [currentStage, setCurrentStage] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (ready) {
      setCurrentStage(3);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }).start();
      return;
    }
    const timers = [
      setTimeout(() => setCurrentStage(0), 200),
      setTimeout(() => setCurrentStage(1), 1500),
      setTimeout(() => setCurrentStage(2), 3000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [ready]);

  useEffect(() => {
    if (!ready) {
      Animated.timing(progressAnim, {
        toValue: (currentStage + 1) / STAGES.length,
        duration: 800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    }
  }, [currentStage, ready]);

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
          const isActive = i <= currentStage;
          const isCurrent = i === currentStage;
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
                {isCurrent && !ready && (
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
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const [phase, setPhase] = useState<"waiting" | "ready">("waiting");
  const [showMatchStarting, setShowMatchStarting] = useState(false);

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
    <View style={[styles.root, { paddingTop: (insets.top || 16) + spacing.sm }]}>
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
        <GameLogo game={game as any} size={52} radius={14} />
        <Text style={styles.gameName}>{game.name}</Text>
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
                <PlayerSlot key={p.id || i} player={p} index={i} phase={phase} colors={colors} styles={styles} />
              ))}
            </View>
            <VsEmblem colors={colors} styles={styles} />
            <View style={styles.teamColumn}>
              <Text style={styles.teamLabel}>TEAM 2</Text>
              {team2.map((p, i) => (
                <PlayerSlot key={p.id || i} player={p} index={i} phase={phase} colors={colors} styles={styles} />
              ))}
            </View>
          </View>
        ) : isDuel ? (
          <View style={styles.duelLayout}>
            <PlayerSlot player={team1[0]} index={0} phase={phase} colors={colors} styles={styles} />
            <VsEmblem colors={colors} styles={styles} />
            <PlayerSlot player={team1[1]} index={1} phase={phase} colors={colors} styles={styles} />
          </View>
        ) : (
          <View style={styles.gridWrap}>
            {team1.map((p, i) => (
              <PlayerSlot key={p.id || i} player={p} index={i} phase={phase} colors={colors} styles={styles} />
            ))}
          </View>
        )}
      </View>

      {/* ── Bottom: stages / match-starting + tips ── */}
      <View style={styles.bottomSection}>
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
                        outputRange: [0.5, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={[colors.success + "00", colors.success + "33", colors.success + "00"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="flash" size={22} color={colors.success} />
              <Text style={[styles.matchStartingText, { textShadowColor: colors.success + "CC" }]}>
                MATCH STARTING
              </Text>
              <Ionicons name="flash" size={22} color={colors.success} />
            </Animated.View>
          </View>
        ) : (
          <LoadingStages ready={phase === "ready"} colors={colors} styles={styles} />
        )}
        {phase === "waiting" && <RotatingTip game={game} colors={colors} styles={styles} />}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.bg.base,
      overflow: "hidden",
      paddingBottom: spacing.xl,
    },

    // header
    header: { alignItems: "center", zIndex: 10, gap: 8 },
    gameName: { color: c.text.primary, fontSize: fontSizes.lg, fontWeight: "800", letterSpacing: 0.3 },
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
    },
    teamVsLayout: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      width: "100%",
      maxWidth: 460,
    },
    teamColumn: { alignItems: "center", gap: spacing.md },
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
      gap: spacing.md,
      maxWidth: 480,
    },

    // VS emblem
    vsWrap: { width: 56, height: 56, alignItems: "center", justifyContent: "center", marginHorizontal: spacing.md },
    vsDiamond: {
      width: 44,
      height: 44,
      borderRadius: 12,
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
      fontSize: 13,
      fontWeight: "900",
      fontStyle: "italic",
      transform: [{ rotate: "-45deg" }],
    },

    // player slot card
    slot: {
      alignItems: "center",
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
      borderRadius: radii.xl,
      backgroundColor: c.glass,
      borderWidth: 1,
      borderColor: c.glassBorder,
      gap: 10,
      width: 124,
    },
    slotName: { color: c.text.primary, fontSize: fontSizes.sm, fontWeight: "700" },
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
    bottomSection: { width: "100%", zIndex: 10, gap: spacing.md },

    // match starting banner
    matchStartingWrap: { alignItems: "center" },
    matchStartingBanner: {
      width: "100%",
      paddingVertical: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: c.success + "40",
      backgroundColor: c.success + "0D",
    },
    matchStartingText: {
      color: "#fff",
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: 4,
      textShadowRadius: 14,
      textShadowOffset: { width: 0, height: 0 },
    },

    // staged progress
    stagesWrap: { width: "100%" },
    progressTrack: {
      flexDirection: "row",
      marginBottom: spacing.md,
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
      width: 24,
      height: 24,
      borderRadius: 12,
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
      borderRadius: 14,
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

    // tip card
    tipCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.glass,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.glassBorder,
      width: "100%",
    },
    tipIconWrap: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.xpGold + "1A",
      alignItems: "center",
      justifyContent: "center",
    },
    tipText: {
      color: c.text.secondary,
      fontSize: fontSizes.sm,
      fontWeight: "600",
      flex: 1,
      lineHeight: 18,
    },
  });
}
