'use strict';
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Game } from "../../../types";

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
  /** Round number when multi-round match (shown above player slots). */
  roundNumber?: number;
  /** Total rounds configured for the match. */
  roundTotal?: number;
};

// ─── Tips (single rotating tip, not two cards) ──────────────────────────────

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

// ─── Loading stages ──────────────────────────────────────────────────────────

const STAGES = [
  { icon: "wifi" as const, label: "Connecting" },
  { icon: "download" as const, label: "Loading assets" },
  { icon: "people" as const, label: "Players ready" },
  { icon: "checkmark-circle" as const, label: "All set" },
];

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

// ─── Player slot ───────────────────────────────────────────────────────────────

function PlayerSlot({ player, index }: { player: StartPlayer & { filled: boolean }; index: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(30)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideIn, { toValue: 0, friction: 8, tension: 100, delay: index * 120, useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 400, delay: index * 120, useNativeDriver: true }),
    ]).start();
  }, []);

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
    <Animated.View style={[ss.slot, { opacity: fadeIn, transform: [{ translateY: slideIn }] }]}>
      <Animated.View style={{ opacity: player.filled ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }) }}>
        <AvatarCircle player={player} size={52} isMe={player.isMe} />
      </Animated.View>
      <Text style={ss.slotName} numberOfLines={1}>{player.filled ? player.name : "Waiting..."}</Text>
      <View style={[ss.slotBadge, player.isMe && ss.slotBadgeMe, player.filled && !player.isMe && ss.slotBadgeReady]}>
        <Text style={[ss.slotBadgeText, player.isMe && ss.slotBadgeTextMe, player.filled && !player.isMe && ss.slotBadgeTextReady]}>
          {player.isMe ? "YOU" : player.filled ? "READY" : "..."}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Single rotating tip ───────────────────────────────────────────────────────

function RotatingTip({ game }: { game: Game }) {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const tips = useMemo(() => {
    const gameTips = GAME_TIPS[game.slug || ""] || [];
    return [...gameTips, ...GENERAL_TIPS];
  }, [game.slug]);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setIndex((prev) => (prev + 1) % tips.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [tips.length]);

  return (
    <Animated.View style={[ss.tipCard, { opacity: fadeAnim }]}>
      <Ionicons name="bulb" size={14} color="#FBBF24" />
      <Text style={ss.tipText} numberOfLines={2}>{tips[index]}</Text>
    </Animated.View>
  );
}

// ─── Loading progress stages ─────────────────────────────────────────────────

function LoadingStages({ ready }: { ready: boolean }) {
  const [currentStage, setCurrentStage] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (ready) {
      setCurrentStage(3);
      Animated.timing(progressAnim, { toValue: 1, duration: 400, useNativeDriver: false }).start();
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
    <View style={ss.stagesWrap}>
      <View style={ss.progressBarBg}>
        <Animated.View style={[ss.progressBarFill, {
          width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }]} />
      </View>
      <View style={ss.stagesRow}>
        {STAGES.map((stage, i) => {
          const isActive = i <= currentStage;
          const isCurrent = i === currentStage;
          return (
            <View key={i} style={ss.stageItem}>
              <View style={[ss.stageDot, isActive && ss.stageDotActive, isCurrent && ss.stageDotCurrent]}>
                <Ionicons name={isActive ? "checkmark" : stage.icon} size={10} color={isActive ? "#fff" : "rgba(255,255,255,0.3)"} />
              </View>
              <Text style={[ss.stageLabel, isActive && ss.stageLabelActive]} numberOfLines={1}>{stage.label}</Text>
            </View>
          );
        })}
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
  ready,
  onDone,
  onExit,
  roundNumber,
  roundTotal,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  const [phase, setPhase] = useState<"waiting" | "ready">("waiting");

  useEffect(() => {
    if (ready && phase === "waiting") setPhase("ready");
  }, [ready, phase]);

  useEffect(() => {
    if (phase !== "ready") return;
    const t = setTimeout(() => onDoneRef.current(), 1200);
    return () => clearTimeout(t);
  }, [phase]);

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

  // Ready pulse
  const readyPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== "ready") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(readyPulse, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(readyPulse, { toValue: 0.85, duration: 350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  const gradient: [string, string] =
    game.gradient?.length === 2 ? (game.gradient as [string, string]) : ["#7C3AED", "#0891B2"];

  const bgGlowOpacity = bgGlow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  const allSlots = useMemo(() => {
    const me = { id: "me", name: myName, avatar: myAvatar, isMe: true, filled: true };
    const opp = (opponents || []).map((p) => ({ ...p, filled: true }));
    return [me, ...opp] as Array<StartPlayer & { filled: boolean }>;
  }, [myName, myAvatar, opponents]);

  return (
    <View style={[ss.root, { paddingTop: 8 }]}>
      {/* Ambient gradient */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: bgGlowOpacity }]}>
        <LinearGradient colors={[gradient[0], "rgba(5,5,15,0)", gradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Mode pill — top center */}
      <View style={ss.modePill}>
        <Ionicons name="flash" size={11} color="#A5F3FC" />
        <Text style={ss.modePillText}>{modeLabel || "AUTO MATCH"}</Text>
      </View>

      {/* Round label — only shown for multi-round matches */}
      {roundNumber != null && roundTotal != null && roundTotal > 1 && (
        <View style={[ss.modePill, { backgroundColor: 'rgba(124,58,237,0.25)', marginTop: 8 }]}>
          <Ionicons name="repeat" size={11} color="#A78BFA" />
          <Text style={[ss.modePillText, { color: '#C4B5FD' }]}>Round {roundNumber} of {roundTotal}</Text>
        </View>
      )}

      {/* Loading progress stages */}
      <LoadingStages ready={phase === "ready"} />

      {/* Center: ready badge or player slots */}
      {phase === "ready" ? (
        <Animated.View style={[ss.readyBadge, {
          opacity: readyPulse,
          transform: [{ scale: readyPulse.interpolate({ inputRange: [0.85, 1], outputRange: [0.9, 1.05] }) }],
        }]}>
          <Ionicons name="checkmark-circle" size={32} color="#22C55E" />
          <Text style={ss.readyText}>ALL READY!</Text>
          <Text style={ss.readySubtext}>Starting game...</Text>
        </Animated.View>
      ) : (
        <View style={ss.slotsSection}>
          {allSlots.length <= 2 ? (
            <View style={ss.vsRow}>
              <PlayerSlot player={allSlots[0]} index={0} />
              <View style={ss.vsBadge}>
                <Text style={ss.vsText}>VS</Text>
              </View>
              <PlayerSlot player={allSlots[1] ?? { id: "opp", name: "Opponent", filled: false, isMe: false }} index={1} />
            </View>
          ) : (
            <View style={ss.grid}>
              {allSlots.map((p, i) => (
                <PlayerSlot key={p.id || i} player={p} index={i} />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Single rotating tip — bottom */}
      {phase === "waiting" && <RotatingTip game={game} />}
    </View>
  );
}

const ss = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    overflow: "hidden",
    backgroundColor: "#0A0F1E",
  },
  modePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  modePillText: { color: "#A5F3FC", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  stagesWrap: { width: "100%", marginTop: 8 },
  progressBarBg: { height: 3, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", marginBottom: 8 },
  progressBarFill: { height: "100%", backgroundColor: "#7C3AED", borderRadius: 2 },
  stagesRow: { flexDirection: "row", justifyContent: "space-between" },
  stageItem: { alignItems: "center", gap: 4, flex: 1 },
  stageDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  stageDotActive: { backgroundColor: "rgba(124,58,237,0.4)" },
  stageDotCurrent: { backgroundColor: "#7C3AED" },
  stageLabel: { color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: "700", letterSpacing: 0.5, textAlign: "center" },
  stageLabelActive: { color: "rgba(255,255,255,0.6)" },
  readyBadge: { alignItems: "center", gap: 8, backgroundColor: "rgba(34,197,94,0.1)", borderRadius: 24, paddingHorizontal: 28, paddingVertical: 20, borderWidth: 1.5, borderColor: "rgba(34,197,94,0.3)" },
  readyText: { color: "#22C55E", fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  readySubtext: { color: "rgba(34,197,94,0.6)", fontSize: 11, fontWeight: "600" },
  slotsSection: { width: "100%", flex: 1, justifyContent: "center", alignItems: "center" },
  vsRow: { flexDirection: "row", alignItems: "center", gap: 10, width: "100%", maxWidth: 380 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, maxWidth: 380 },
  vsBadge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(124,58,237,0.2)", borderWidth: 1.5, borderColor: "rgba(124,58,237,0.5)" },
  vsText: { color: "#C4B5FD", fontSize: 14, fontWeight: "900" },
  slot: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(15,23,42,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", gap: 4, maxWidth: 120 },
  slotName: { color: "#F8FAFC", fontSize: 12, fontWeight: "800", maxWidth: "90%" },
  slotBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" },
  slotBadgeMe: { backgroundColor: "rgba(34,211,238,0.12)" },
  slotBadgeReady: { backgroundColor: "rgba(34,197,94,0.12)" },
  slotBadgeText: { color: "#64748B", fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  slotBadgeTextMe: { color: "#22D3EE" },
  slotBadgeTextReady: { color: "#22C55E" },
  tipCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(251,191,36,0.08)", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(251,191,36,0.15)",
    width: "100%",
  },
  tipText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600", flex: 1, lineHeight: 17 },
});
