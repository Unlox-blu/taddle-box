/**
 * GameResultOverlay — premium match result / celebration overlay.
 *
 * Rendered full-screen inside GamePlayModal once a match is over:
 * - Win  : golden trophy emblem with pulsing halo + rotating ray burst,
 *          confetti rain, staggered per-game stat cards, and an animated
 *          "+N XP" count-up.
 * - Loss : muted defeat emblem + stat breakdown (no confetti).
 * - Pending: waiting state shown until MATCH_RESOLVED flips the outcome.
 *
 * A "Rematch" button re-queues matchmaking for the same game/mode instantly
 * (parent wires it straight into the AUTO/tournament queue).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useThemeColors } from "../../context/ThemeContext";
import { fontSizes, radii, spacing } from "../../theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const CONFETTI_COLORS = [
  "#FBBF24",
  "#9F67F7",
  "#22D3EE",
  "#EC4899",
  "#34D399",
  "#F97316",
];

export type GameResultOverlayProps = {
  result: "win" | "loss" | "draw" | "pending";
  score: number;
  xpEarned: number;
  accuracy?: number;
  longestStreak?: number;
  gameName: string;
  modeLabel: string;
  opponentName?: string;
  /** Practice matches award no XP — show a "no rewards" note instead of a +0 count-up. */
  isPractice?: boolean;
  onRematch?: () => void;
  onClose: () => void;
};

export default function GameResultOverlay({
  result,
  score,
  xpEarned,
  accuracy,
  longestStreak,
  gameName,
  modeLabel,
  opponentName,
  isPractice,
  onRematch,
  onClose,
}: GameResultOverlayProps) {
  const colors = useThemeColors();
  const win = result === "win";
  const draw = result === "draw";
  const pending = result === "pending";

  // Panel entrance
  const panelScale = useRef(new Animated.Value(0)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(panelScale, {
        toValue: 1,
        friction: 6,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.timing(panelOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
    return () => {
      panelScale.stopAnimation();
      panelOpacity.stopAnimation();
    };
  }, [panelScale, panelOpacity]);

  const title = win
    ? "VICTORY"
    : draw
      ? "DRAW"
      : pending
        ? "Waiting for Opponent"
        : "DEFEAT";
  const subtitle = pending
    ? isPractice
      ? "Your score is saved. Practice matches award no XP."
      : "Your score is saved. XP will be awarded when your opponent finishes."
    : win
      ? `You beat ${opponentName || "your opponent"} in ${gameName}`
      : draw
        ? `You tied with ${opponentName || "your opponent"} in ${gameName}`
        : `${opponentName || "Your opponent"} takes this one in ${gameName}`;

  return (
    <View style={styles.root}>
      {/* Ambient glow */}
      <LinearGradient
        colors={
          win
            ? ["rgba(251,191,36,0.16)", "rgba(124,58,237,0.10)", "transparent"]
            : ["rgba(96,165,250,0.10)", "transparent"]
        }
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {win && <ConfettiBurst />}

      <Animated.View
        style={[
          styles.panel,
          {
            opacity: panelOpacity,
            transform: [
              {
                scale: panelScale.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.9, 1],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.modePill}>
          <Text style={styles.modePillText}>{modeLabel}</Text>
        </View>

        {pending ? <WaitingEmblem /> : <VictoryEmblem win={win} draw={draw} />}

        <Text
          style={[
            styles.title,
            { color: win ? "#FBBF24" : draw ? "#60A5FA" : "#F87171" },
          ]}
        >
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {/* Per-game stats breakdown */}
        <View style={styles.statsRow}>
          <StatCard
            icon="stats-chart"
            label="Score"
            value={String(score)}
            color={colors.cyanLight}
            delay={120}
          />
          <StatCard
            icon="crosshair"
            label="Accuracy"
            value={accuracy != null ? `${accuracy}%` : "—"}
            color={colors.primaryLight}
            delay={240}
          />
          <StatCard
            icon="flame"
            label="Longest Streak"
            value={longestStreak != null ? String(longestStreak) : "—"}
            color="#F97316"
            delay={360}
          />
        </View>

        {/* XP gain animation — practice matches award no XP, so show a clear note */}
        {!pending &&
          (isPractice ? (
            <View style={styles.practiceNote}>
              <Ionicons name="information-circle-outline" size={16} color={colors.text.secondary} />
              <Text style={styles.practiceNoteText}>
                Practice match — entry fee deducted, no XP rewards
              </Text>
            </View>
          ) : draw ? (
            <XpCounter xp={xpEarned} showZero={false} />
          ) : (
            <XpCounter xp={xpEarned} showZero={!win} />
          ))}

        <View style={styles.buttonRow}>
          {!pending && onRematch && (
            <TouchableOpacity
              style={styles.rematchBtn}
              onPress={onRematch}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[colors.primary, colors.cyanDark]}
                style={styles.rematchGradient}
              >
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.rematchText}>REMATCH</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.doneBtn, !onRematch && { flex: 1 }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.doneText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Victory / defeat emblem ─────────────────────────────────────────────────

const VictoryEmblem = React.memo(function VictoryEmblem({ win, draw }: { win: boolean; draw?: boolean }) {
  const pop = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const rays = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, {
      toValue: 1,
      friction: 4,
      tension: 90,
      useNativeDriver: true,
    }).start();
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const raysLoop = Animated.loop(
      Animated.timing(rays, {
        toValue: 1,
        duration: 14000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    pulseLoop.start();
    raysLoop.start();
    if (!win && !draw) {
      Animated.sequence([
        Animated.timing(wobble, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: -1, duration: 90, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0, duration: 90, useNativeDriver: true }),
      ]).start();
    }
    return () => {
      pulseLoop.stop();
      raysLoop.stop();
      pop.stopAnimation();
      pulse.stopAnimation();
      rays.stopAnimation();
      wobble.stopAnimation();
    };
  }, [win, draw, pop, pulse, rays, wobble]);

  const RAY_COUNT = 12;
  const emblem = useMemo(
    () =>
      Array.from({ length: RAY_COUNT }, (_, i) => ({
        deg: i * (360 / RAY_COUNT),
      })),
    [],
  );

  return (
    <View style={styles.emblemWrap}>
      {/* Pulsing halo */}
      <Animated.View
        style={[
          styles.halo,
          win && styles.haloGold,
          {
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.45, 0.15],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.82, 1.18],
                }),
              },
            ],
          },
        ]}
      />
      {/* Rotating ray burst */}
      <Animated.View
        style={[
          styles.rayField,
          {
            transform: [
              {
                rotate: rays.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "360deg"],
                }),
              },
            ],
          },
        ]}
      >
        {emblem.map((r) => (
          <View
            key={r.deg}
            style={[
              styles.ray,
              win ? styles.rayGold : styles.rayMuted,
              {
                transform: [{ rotate: `${r.deg}deg` }, { translateY: -30 }],
              },
            ]}
          />
        ))}
      </Animated.View>
      {/* Emblem badge */}
      <Animated.View
        style={[
          styles.emblemBadge,
          win && styles.emblemBadgeWin,
          draw && styles.emblemBadgeDraw,
          {
            transform: [
              { scale: pop },
              { rotate: `${wobble}deg` },
            ],
          },
        ]}
      >
        <Ionicons
          name={win ? "trophy" : draw ? "hand-left-outline" : "shield-half"}
          size={54}
          color={win ? "#FBBF24" : draw ? "#60A5FA" : "#94A3B8"}
        />
      </Animated.View>
    </View>
  );
})

const WaitingEmblem = React.memo(function WaitingEmblem() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.stopAnimation();
    };
  }, [pulse]);

  return (
    <View style={styles.emblemWrap}>
      <Animated.View
        style={[
          styles.halo,
          {
            opacity: 0.3,
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.9, 1.1],
                }),
              },
            ],
          },
        ]}
      />
      <View style={[styles.emblemBadge, styles.emblemBadgeWait]}>
        <Ionicons name="hourglass-outline" size={48} color="#94A3B8" />
      </View>
    </View>
  );
})

// ─── Confetti rain (win only) ────────────────────────────────────────────────

const ConfettiBurst = React.memo(function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        x: Math.random() * SCREEN_W,
        delay: Math.random() * 900,
        duration: 2400 + Math.random() * 1600,
        size: 7 + Math.random() * 6,
        height: 12 + Math.random() * 10,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotation: Math.random() * 720,
        drift: (Math.random() - 0.5) * 140,
      })),
    [],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p) => (
        <ConfettiPiece key={p.id} {...p} />
      ))}
    </View>
  );
})

const ConfettiPiece = React.memo(function ConfettiPiece({
  x,
  delay,
  duration,
  size,
  height,
  color,
  rotation,
  drift,
}: {
  x: number;
  delay: number;
  duration: number;
  size: number;
  height: number;
  color: string;
  rotation: number;
  drift: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    }, delay);
    return () => {
      clearTimeout(t);
      anim.stopAnimation();
    };
  }, [anim, delay, duration]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-50, SCREEN_H + 60],
  });
  const translateX = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, drift, drift],
  });
  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${rotation}deg`],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 0.08, 0.9, 1],
    outputRange: [0, 1, 1, 0.7],
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x,
        top: 0,
        width: size,
        height,
        borderRadius: 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
})

// ─── Animated stat card ──────────────────────────────────────────────────────

const StatCard = React.memo(function StatCard({
  icon,
  label,
  value,
  color,
  delay,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  delay: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      delay,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();
    return () => anim.stopAnimation();
  }, [anim, delay]);

  return (
    <Animated.View
      style={[
        styles.statCard,
        {
          opacity: anim,
          transform: [
            {
              scale: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[styles.statIconWrap, { backgroundColor: `${color}26` }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
})

// ─── XP count-up ─────────────────────────────────────────────────────────────

function XpCounter({ xp, showZero }: { xp: number; showZero: boolean }) {
  const [value, setValue] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    anim.setValue(0);
    const id = anim.addListener(({ value: v }) => setValue(Math.round(v)));
    const popSprings = Animated.sequence([
      Animated.spring(pop, { toValue: 1.3, friction: 3, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]);
    Animated.timing(anim, {
      toValue: xp,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      popSprings.start();
    });
    return () => {
      anim.removeListener(id);
      anim.stopAnimation();
      pop.stopAnimation();
    };
  }, [anim, pop, xp]);

  if (xp <= 0 && !showZero) return null;

  return (
    <Animated.View style={[styles.xpBadge, { transform: [{ scale: pop }] }]}>
      <Ionicons name="flash" size={18} color="#FBBF24" />
      <Text style={styles.xpPlus}>+{value}</Text>
      <Text style={styles.xpLabel}>XP</Text>
    </Animated.View>
  );
}

// ─── Styles (module-level — the overlay always renders on the dark playModal) ─

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    padding: spacing.xl,
    borderRadius: radii.xl,
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.96)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
  },
  modePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.full,
    backgroundColor: "rgba(124,58,237,0.16)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.4)",
    marginBottom: spacing.md,
  },
  modePillText: {
    color: "#9F67F7",
    fontSize: fontSizes.xs,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    fontSize: fontSizes.h2,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: spacing.md,
  },
  subtitle: {
    marginTop: spacing.sm,
    color: "#94A3B8",
    textAlign: "center",
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  statsRow: {
    width: "100%",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  statCard: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    color: "#fff",
    fontSize: fontSizes.xl,
    fontWeight: "900",
  },
  statLabel: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  xpBadge: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: radii.full,
    backgroundColor: "rgba(251,191,36,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.35)",
  },
  xpPlus: {
    color: "#FBBF24",
    fontSize: fontSizes.xl,
    fontWeight: "900",
  },
  xpLabel: {
    color: "#FBBF24",
    fontSize: fontSizes.sm,
    fontWeight: "800",
    letterSpacing: 1,
  },
  practiceNote: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.full,
    backgroundColor: "rgba(148,163,184,0.12)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
  },
  practiceNoteText: {
    color: "#94A3B8",
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
  buttonRow: {
    width: "100%",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  rematchBtn: {
    flex: 1,
    borderRadius: radii.full,
    overflow: "hidden",
  },
  rematchGradient: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  rematchText: {
    color: "#fff",
    fontSize: fontSizes.sm,
    fontWeight: "900",
    letterSpacing: 1,
  },
  doneBtn: {
    flex: 1,
    height: 48,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: {
    color: "#E2E8F0",
    fontSize: fontSizes.sm,
    fontWeight: "800",
    letterSpacing: 1,
  },
  emblemWrap: {
    width: 150,
    height: 150,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(148,163,184,0.10)",
  },
  haloGold: {
    backgroundColor: "rgba(251,191,36,0.10)",
  },
  rayField: {
    position: "absolute",
    width: 150,
    height: 150,
    alignItems: "center",
    justifyContent: "center",
  },
  ray: {
    position: "absolute",
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  rayGold: {
    backgroundColor: "rgba(251,191,36,0.5)",
  },
  rayMuted: {
    backgroundColor: "rgba(148,163,184,0.25)",
  },
  emblemBadge: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E293B",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#FBBF24",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
  },
  emblemBadgeWin: {
    backgroundColor: "rgba(251,191,36,0.12)",
    borderColor: "rgba(251,191,36,0.45)",
  },
  emblemBadgeDraw: {
    backgroundColor: "rgba(96,165,250,0.12)",
    borderColor: "rgba(96,165,250,0.45)",
  },
  emblemBadgeWait: {
    backgroundColor: "#1E293B",
  },
});
