import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Game } from "../../types";
import GameLogo from "./GameLogo";
import { gameSound } from "../../services/gameSound";

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
  onDone: () => void;
};

const TICK_MS = 950; // per countdown number
const TOTAL_TICKS = 3; // 3, 2, 1

function AvatarCircle({
  player,
  size,
  isMe,
}: {
  player: StartPlayer;
  size: number;
  isMe?: boolean;
}) {
  const inner = size * 0.82;
  if (player.avatar) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          padding: size * 0.06,
          backgroundColor: "rgba(255,255,255,0.14)",
        }}
      >
        <Image
          source={{ uri: player.avatar }}
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            borderWidth: 2,
            borderColor: isMe ? "#22D3EE" : "rgba(255,255,255,0.4)",
          }}
        />
      </View>
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: isMe ? "rgba(34,211,238,0.2)" : "rgba(255,255,255,0.08)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: isMe ? "#22D3EE" : "rgba(255,255,255,0.25)",
      }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.42, fontWeight: "900" }}>
        {(player.name || "?")[0].toUpperCase()}
      </Text>
    </View>
  );
}

// ─── Matchup board ────────────────────────────────────────────────────────────
// Replaces the old "me vs opponent +N MORE" row. Renders a clean, mode-aware
// lineup:
//   • 1v1            → classic YOU vs OPPONENT cards
//   • Multiplayer FFA → a wrap grid of every player, YOU highlighted
//   • Team PvP        → two team panels (TEAM 1 vs TEAM 2) with members

function MatchupBoard({
  me,
  opponents,
  teamsLocked,
  gradient,
}: {
  me: StartPlayer;
  opponents: StartPlayer[];
  teamsLocked?: boolean;
  gradient: [string, string];
}) {
  const all = [me, ...opponents];
  const total = all.length;
  // Team PvP needs the lobby to have locked teams and a 4+ player match. The
  // current user's own team may be absent on legacy flows, so fall back to seat
  // parity rather than gating the whole board on it.
  const hasTeamData = teamsLocked && total >= 4 && all.some((p) => typeof p.team === "number");
  const teamOf = (p: StartPlayer, i: number) =>
    typeof p.team === "number" ? p.team : i % 2;

  // ── Team PvP: two team panels (fall back to the FFA grid if either side
  // ends up empty, e.g. legacy data puts everyone on one team) ──
  if (hasTeamData) {
    const teamA = all.filter((p, i) => teamOf(p, i) === 0);
    const teamB = all.filter((p, i) => teamOf(p, i) === 1);
    if (teamA.length > 0 && teamB.length > 0) {
      return (
        <View style={styles.teamRow}>
          <TeamPanel label="TEAM 1" members={teamA} accent={gradient[0]} />
          <View style={styles.vsBadge}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <TeamPanel label="TEAM 2" members={teamB} accent={gradient[1]} />
        </View>
      );
    }
  }

  // ── 1v1 (or solo with a graceful fallback opponent): classic VS cards ──
  if (total <= 2) {
    const opp = opponents[0] || { name: "Opponent" };
    return (
      <View style={styles.vsRow}>
        <View style={styles.playerCard}>
          <AvatarCircle player={me} size={58} isMe />
          <Text style={styles.playerName} numberOfLines={1}>{me.name}</Text>
          <Text style={styles.playerTag}>YOU</Text>
        </View>
        <View style={styles.vsBadge}>
          <Text style={styles.vsText}>VS</Text>
        </View>
        <View style={styles.playerCard}>
          <AvatarCircle player={opp} size={58} />
          <Text style={styles.playerName} numberOfLines={1}>{opp.name}</Text>
          <Text style={styles.playerTag}>OPPONENT</Text>
        </View>
      </View>
    );
  }

  // ── Multiplayer FFA: wrap grid of everyone ──
  return (
    <View style={styles.ffaWrap}>
      <Text style={styles.ffaTitle}>{total} PLAYERS</Text>
      <View style={styles.ffaGrid}>
        {all.map((p, i) => (
          <View key={p.id || `${p.name}-${i}`} style={[styles.ffaCard, p.isMe && styles.ffaCardMe]}>
            <AvatarCircle player={p} size={44} isMe={p.isMe} />
            <Text style={styles.ffaName} numberOfLines={1}>{p.name}</Text>
            <Text style={[styles.ffaTag, p.isMe && styles.ffaTagMe]}>
              {p.isMe ? "YOU" : `PLAYER ${i}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TeamPanel({ label, members, accent }: {
  label: string;
  members: StartPlayer[];
  accent: string;
}) {
  return (
    <View style={styles.teamPanel}>
      <Text style={[styles.teamLabel, { color: accent }]}>{label}</Text>
      <View style={styles.teamMembers}>
        {members.map((p) => (
          <View key={p.id || p.name} style={styles.teamMember}>
            <AvatarCircle player={p} size={40} isMe={p.isMe} />
            <Text style={styles.teamMemberName} numberOfLines={1}>{p.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function GameStartScreen({
  game,
  myName,
  myAvatar,
  myTeam,
  opponents,
  modeLabel,
  teamsLocked,
  onDone,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Keep the latest onDone in a ref so the countdown effect never re-runs when
  // the parent re-renders with a fresh inline callback (which would restart the
  // tick timer mid-countdown). The component is keyed per session, so the
  // closure can never be stale.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  const [tick, setTick] = useState(TOTAL_TICKS); // 3 → 2 → 1 → 0 (GO)

  // Sound + haptic for each countdown beat (tick while counting, GO at launch)
  useEffect(() => {
    if (tick === 0) {
      gameSound.playGo();
    } else {
      gameSound.playTick();
    }
  }, [tick]);

  const scale = useRef(new Animated.Value(0)).current;
  const goPulse = useRef(new Animated.Value(1)).current;
  const ringProgress = useRef(new Animated.Value(0)).current;
  const bgGlow = useRef(new Animated.Value(0)).current;

  const ringSize = Math.min(width * 0.42, 200);
  const ringR = ringSize / 2 - 8;
  const ringCirc = 2 * Math.PI * ringR;

  const gradient =
    game.gradient?.length === 2
      ? (game.gradient as [string, string])
      : (["#7C3AED", "#0891B2"] as [string, string]);

  const allPlayers: StartPlayer[] = useMemo(
    () => [
      { name: myName, avatar: myAvatar, isMe: true, team: myTeam },
      ...(opponents || []),
    ],
    [myName, myAvatar, myTeam, opponents],
  );

  // Countdown ticking
  useEffect(() => {
    scale.setValue(0);
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 160,
      useNativeDriver: true,
    }).start();

    if (tick === 0) {
      const t = setTimeout(() => onDoneRef.current(), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTick((v) => v - 1), TICK_MS);
    return () => clearTimeout(t);
  }, [tick, scale]);

  // Progress ring 0 → 1 over the full countdown duration
  useEffect(() => {
    Animated.timing(ringProgress, {
      toValue: 1,
      duration: (TOTAL_TICKS + 1) * TICK_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, []);

  // Ambient glow pulse
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgGlow, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: false,
        }),
        Animated.timing(bgGlow, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, []);

  // "GO!" pulse
  useEffect(() => {
    if (tick !== 0) return;
    goPulse.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(goPulse, {
          toValue: 1.18,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(goPulse, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [tick, goPulse]);

  const ringDashOffset = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [ringCirc, 0],
  });
  const bgGlowInterp = bgGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.6],
  });

  const display = tick === 0 ? "GO!" : String(tick);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      {/* Ambient gradient glow backdrop */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { opacity: bgGlowInterp },
        ]}
      >
        <LinearGradient
          colors={[gradient[0], "rgba(5,5,15,0)", gradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Mode pill */}
      <View style={styles.modePill}>
        <Ionicons name="flash" size={12} color="#A5F3FC" />
        <Text style={styles.modePillText}>
          {modeLabel || "AUTO MATCH"}
        </Text>
      </View>

      {/* Game logo */}
      <Animated.View
        style={[
          styles.logoWrap,
          {
            transform: [
              {
                scale: scale.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 1],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.logoHalo}>
          <GameLogo game={game} size={104} radius={30} />
        </View>
        <Text style={styles.gameName}>{game.name}</Text>
        <Text style={styles.getReady}>GET READY</Text>
      </Animated.View>

      {/* Countdown ring */}
      <View style={styles.ringWrap}>
        <Svg width={ringSize} height={ringSize}>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringR}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={7}
            fill="none"
          />
          <AnimatedCircle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringR}
            stroke={gradient[0]}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={`${ringCirc} ${ringCirc}`}
            strokeDashoffset={ringDashOffset}
            fill="none"
            transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
          />
        </Svg>
        <Animated.View
          style={[
            styles.countNumberWrap,
            {
              transform: [
                { scale: tick === 0 ? goPulse : scale },
              ],
            },
          ]}
        >
          <Text
            style={[
              styles.countNumber,
              tick === 0 && styles.goNumber,
              { color: tick === 0 ? gradient[0] : "#FFFFFF" },
            ]}
          >
            {display}
          </Text>
        </Animated.View>
      </View>

      {/* Matchup board — adapts to 1v1, multiplayer FFA, and team PvP */}
      <MatchupBoard
        me={allPlayers[0]}
        opponents={allPlayers.slice(1)}
        teamsLocked={teamsLocked}
        gradient={gradient}
      />
    </View>
  );
}

// Animated SVG circle for the progress ring
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 48,
    overflow: "hidden",
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  modePillText: {
    color: "#A5F3FC",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  logoWrap: {
    alignItems: "center",
    marginTop: 8,
  },
  logoHalo: {
    borderRadius: 34,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  gameName: {
    marginTop: 14,
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  getReady: {
    marginTop: 4,
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 4,
  },
  ringWrap: {
    width: 210,
    height: 210,
    alignItems: "center",
    justifyContent: "center",
  },
  countNumberWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  countNumber: {
    fontSize: 92,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  goNumber: {
    fontSize: 74,
    letterSpacing: 2,
  },
  vsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    width: "100%",
  },
  // ── Multiplayer FFA board ──
  ffaWrap: {
    width: "100%",
    alignItems: "center",
  },
  ffaTitle: {
    color: "#C4B5FD",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 3,
    marginBottom: 12,
  },
  ffaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  ffaCard: {
    alignItems: "center",
    width: 96,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 18,
    backgroundColor: "rgba(15,23,42,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  ffaCardMe: {
    borderColor: "#22D3EE",
    backgroundColor: "rgba(34,211,238,0.08)",
  },
  ffaName: {
    marginTop: 8,
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
    maxWidth: "100%",
  },
  ffaTag: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  ffaTagMe: {
    color: "#22D3EE",
  },
  // ── Team PvP board ──
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  teamPanel: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: "rgba(15,23,42,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  teamLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 10,
  },
  teamMembers: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  teamMember: {
    alignItems: "center",
    width: 64,
  },
  teamMemberName: {
    marginTop: 6,
    color: "#F8FAFC",
    fontSize: 10,
    fontWeight: "700",
    maxWidth: "100%",
  },
  playerCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: "rgba(15,23,42,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  playerName: {
    marginTop: 8,
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    maxWidth: "100%",
  },
  playerTag: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  vsBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,58,237,0.22)",
    borderWidth: 1.5,
    borderColor: "rgba(124,58,237,0.55)",
  },
  vsText: {
    color: "#C4B5FD",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
