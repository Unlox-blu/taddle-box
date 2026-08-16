'use strict';
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import StateBlock from "../common/StateBlock";
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
  onExit?: () => void;
};

const TICK_MS = 950;
const TOTAL_TICKS = 3;

// ─── Avatar ───────────────────────────────────────────────────────────────────

function AvatarCircle({ player, size, isMe }: { player: StartPlayer; size: number; isMe?: boolean }) {
  const inner = size * 0.82;
  const borderColor = isMe ? "#22D3EE" : "rgba(255,255,255,0.35)";
  if (player.avatar) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, padding: size * 0.06, backgroundColor: "rgba(255,255,255,0.1)" }}>
        <Image source={{ uri: player.avatar }} style={{ width: inner, height: inner, borderRadius: inner / 2, borderWidth: 2, borderColor }} />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: isMe ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor }}>
      <Text style={{ color: "#fff", fontSize: size * 0.42, fontWeight: "900" }}>
        {(player.name || "?")[0].toUpperCase()}
      </Text>
    </View>
  );
}

// ─── Player row (waiting state) ───────────────────────────────────────────────

function PlayerSlot({ player, isWaiting }: { player: StartPlayer & { filled: boolean }; isWaiting: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!player.filled) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
      ).start();
    }
  }, [player.filled]);

  return (
    <View style={ss.slot}>
      <Animated.View style={{ opacity: player.filled ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }) }}>
        <AvatarCircle player={player} size={52} isMe={player.isMe} />
      </Animated.View>
      <Text style={ss.slotName} numberOfLines={1}>{player.filled ? player.name : "Waiting…"}</Text>
      <View style={[ss.slotBadge, player.isMe && ss.slotBadgeMe]}>
        <Text style={[ss.slotBadgeText, player.isMe && ss.slotBadgeTextMe]}>
          {player.isMe ? "YOU" : player.filled ? "READY" : "…"}
        </Text>
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GameStartScreen({
  game,
  myName,
  myAvatar,
  myTeam,
  opponents,
  modeLabel,
  teamsLocked,
  onDone,
  onExit,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // "counting" runs client-side on mount — the engine only fires START after
  // every player's board is visible (each game sends READY once its 3-2-1
  // finishes), so gating the countdown on the engine's START would deadlock.
  const [counting, setCounting] = useState(false);
  const [tick, setTick] = useState(TOTAL_TICKS);

  useEffect(() => {
    if (counting) return;
    // Small beat so the roster flashes before the countdown begins.
    const t = setTimeout(() => setCounting(true), 500);
    return () => clearTimeout(t);
  }, [counting]);

  // Sound per tick
  useEffect(() => {
    if (!counting) return;
    if (tick === 0) gameSound.playGo();
    else gameSound.playTick();
  }, [tick, counting]);

  // Countdown ticking
  const scaleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!counting) return;
    scaleAnim.setValue(0);
    Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    if (tick === 0) {
      const t = setTimeout(() => onDoneRef.current(), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTick((v) => v - 1), TICK_MS);
    return () => clearTimeout(t);
  }, [tick, counting]);

  // Ring progress (runs when counting starts)
  const ringProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!counting) return;
    ringProgress.setValue(0);
    Animated.timing(ringProgress, {
      toValue: 1,
      duration: (TOTAL_TICKS + 1) * TICK_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [counting]);

  // GO pulse
  const goPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!counting || tick !== 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(goPulse, { toValue: 1.18, duration: 420, useNativeDriver: true }),
        Animated.timing(goPulse, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [tick, counting]);

  // Ambient glow
  const bgGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgGlow, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(bgGlow, { toValue: 0, duration: 1400, useNativeDriver: false }),
      ]),
    ).start();
  }, []);

  // Waiting pulse (before counting)
  const waitPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (counting) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(waitPulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(waitPulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [counting]);

  const gradient: [string, string] =
    game.gradient?.length === 2 ? (game.gradient as [string, string]) : ["#7C3AED", "#0891B2"];

  const ringSize = Math.min(width * 0.42, 200);
  const ringR = ringSize / 2 - 8;
  const ringCirc = 2 * Math.PI * ringR;

  const ringDashOffset = ringProgress.interpolate({ inputRange: [0, 1], outputRange: [ringCirc, 0] });
  const bgGlowOpacity = bgGlow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.55] });

  // Build player slots: me first, then opponents
  const allSlots = useMemo(() => {
    const me = { id: "me", name: myName, avatar: myAvatar, isMe: true, filled: true };
    const opp = (opponents || []).map((p) => ({ ...p, filled: true }));
    return [me, ...opp] as Array<StartPlayer & { filled: boolean }>;
  }, [myName, myAvatar, opponents]);

  const display = tick === 0 ? "GO!" : String(tick);

  return (
    <View style={[ss.root, { paddingTop: insets.top + 12 }]}>
      {/* Ambient gradient */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: bgGlowOpacity }]}>
        <LinearGradient colors={[gradient[0], "rgba(5,5,15,0)", gradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Mode pill */}
      <View style={ss.modePill}>
        <Ionicons name="flash" size={11} color="#A5F3FC" />
        <Text style={ss.modePillText}>{modeLabel || "AUTO MATCH"}</Text>
      </View>

      {/* Game identity */}
      <View style={ss.gameRow}>
        <View style={ss.logoHalo}>
          <GameLogo game={game} size={56} radius={16} />
        </View>
        <View>
          <Text style={ss.gameName}>{game.name}</Text>
          <Text style={ss.gameSubtitle}>{counting ? "GET READY" : "FINDING MATCH"}</Text>
        </View>
      </View>

      {/* Center: ring (counting) or waiting indicator */}
      <View style={ss.centerWrap}>
        {counting ? (
          <View style={[ss.ringWrap, { width: ringSize, height: ringSize }]}>
            <Svg width={ringSize} height={ringSize}>
              <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} stroke="rgba(255,255,255,0.1)" strokeWidth={7} fill="none" />
              <AnimatedCircle
                cx={ringSize / 2} cy={ringSize / 2} r={ringR}
                stroke={gradient[0]} strokeWidth={7} strokeLinecap="round"
                strokeDasharray={`${ringCirc} ${ringCirc}`}
                strokeDashoffset={ringDashOffset}
                fill="none"
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
              />
            </Svg>
            <Animated.View style={[ss.countWrap, { transform: [{ scale: tick === 0 ? goPulse : scaleAnim }] }]}>
              <Text style={[ss.countNum, tick === 0 && ss.goNum, { color: tick === 0 ? gradient[0] : "#fff" }]}>
                {display}
              </Text>
            </Animated.View>
          </View>
        ) : (
          <Animated.View style={[ss.waitingPill, {
            opacity: waitPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
            transform: [{ scale: waitPulse.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }) }],
          }]}>
            <StateBlock inline loading loaderSize={20} />
            <Text style={ss.waitingText}>Waiting for players…</Text>
          </Animated.View>
        )}
      </View>

      {/* Player slots */}
      <View style={ss.slots}>
        {allSlots.length <= 2 ? (
          // 1v1: YOU vs OPPONENT side by side
          <View style={ss.vsRow}>
            <PlayerSlot player={allSlots[0]} isWaiting={!counting} />
            <View style={ss.vsBadge}><Text style={ss.vsText}>VS</Text></View>
            <PlayerSlot player={allSlots[1] ?? { id: "opp", name: "Opponent", filled: false, isMe: false }} isWaiting={!counting} />
          </View>
        ) : (
          // Multiplayer: wrap grid
          <View style={ss.grid}>
            {allSlots.map((p, i) => (
              <PlayerSlot key={p.id || i} player={p} isWaiting={!counting} />
            ))}
          </View>
        )}
      </View>

      {/* Exit button — only shown while waiting */}
      {!counting && onExit && (
        <TouchableOpacity style={ss.exitBtn} onPress={onExit}>
          <Ionicons name="close" size={13} color="#64748B" />
          <Text style={ss.exitText}>EXIT LOBBY</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const ss = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 40,
    overflow: "hidden",
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  modePillText: { color: "#A5F3FC", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  gameRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 4 },
  logoHalo: {
    borderRadius: 20, padding: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  gameName: { color: "#F8FAFC", fontSize: 22, fontWeight: "900" },
  gameSubtitle: { color: "#64748B", fontSize: 11, fontWeight: "800", letterSpacing: 3, marginTop: 2 },
  centerWrap: { alignItems: "center", justifyContent: "center", minHeight: 180 },
  ringWrap: { alignItems: "center", justifyContent: "center" },
  countWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  countNum: { fontSize: 90, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8 },
  goNum: { fontSize: 72, letterSpacing: 2 },
  waitingPill: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(124,58,237,0.12)", borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(124,58,237,0.3)" },
  waitingText: { color: "#A78BFA", fontSize: 14, fontWeight: "700" },
  // slots
  slots: { width: "100%" },
  vsRow: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 },
  vsBadge: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(124,58,237,0.2)", borderWidth: 1.5, borderColor: "rgba(124,58,237,0.5)" },
  vsText: { color: "#C4B5FD", fontSize: 15, fontWeight: "900" },
  // slot
  slot: { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 20, backgroundColor: "rgba(15,23,42,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", gap: 6 },
  slotName: { color: "#F8FAFC", fontSize: 13, fontWeight: "800", maxWidth: "90%" },
  slotBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  slotBadgeMe: { backgroundColor: "rgba(34,211,238,0.12)" },
  slotBadgeText: { color: "#64748B", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  slotBadgeTextMe: { color: "#22D3EE" },
  // exit
  exitBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 16 },
  exitText: { color: "#64748B", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
});
