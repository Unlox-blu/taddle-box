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
import { gameSound } from "../../../services/gameSound";
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

function AvatarCircle({ player, size, isMe, isReady }: { player: StartPlayer & { filled?: boolean }; size: number; isMe?: boolean; isReady?: boolean }) {
  const inner = size * 0.85;
  const borderColor = isReady ? "#22C55E" : isMe ? "#22D3EE" : "rgba(255,255,255,0.2)";
  
  const content = player.avatar ? (
    <Image source={{ uri: player.avatar }} style={{ width: inner, height: inner, borderRadius: inner / 2, borderWidth: 2, borderColor }} />
  ) : (
    <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: isMe ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor }}>
      <Text style={{ color: "#fff", fontSize: inner * 0.45, fontWeight: "900" }}>
        {(player.name || "?")[0].toUpperCase()}
      </Text>
    </View>
  );

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, padding: (size - inner) / 2, backgroundColor: "rgba(255,255,255,0.05)" }}>
      {content}
    </View>
  );
}

function PlayerSlot({ player, index, phase }: { player: StartPlayer & { filled: boolean }; index: number; phase: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(30)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideIn, { toValue: 0, friction: 8, tension: 100, delay: index * 100, useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 400, delay: index * 100, useNativeDriver: true }),
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

  useEffect(() => {
    if (phase === "ready") {
      Animated.spring(scale, {
        toValue: 1.1,
        friction: 5,
        useNativeDriver: true,
      }).start();
    }
  }, [phase]);

  const isReady = player.filled && phase === "ready";

  return (
    <Animated.View style={[ss.slot, { opacity: fadeIn, transform: [{ translateY: slideIn }, { scale }] }]}>
      <Animated.View style={{ opacity: player.filled ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }) }}>
        <AvatarCircle player={player} size={68} isMe={player.isMe} isReady={isReady} />
      </Animated.View>
      <Text style={ss.slotName} numberOfLines={1}>{player.filled ? player.name : "Waiting..."}</Text>
      
      <View style={[ss.slotBadge, player.isMe && ss.slotBadgeMe, isReady && ss.slotBadgeReady]}>
        <Text style={[ss.slotBadgeText, player.isMe && ss.slotBadgeTextMe, isReady && ss.slotBadgeTextReady]}>
          {isReady ? "READY" : player.isMe ? "YOU" : "..."}
        </Text>
      </View>
    </Animated.View>
  );
}

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
    game.gradient?.length === 2 ? (game.gradient as [string, string]) : ["#7C3AED", "#0891B2"];

  const bgGlowOpacity = bgGlow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] });

  const allSlots = useMemo(() => {
    const me = { id: "me", name: myName, avatar: myAvatar, isMe: true, filled: true, team: myTeam };
    const opp = (opponents || []).map((p) => ({ ...p, filled: true }));
    return [me, ...opp] as Array<StartPlayer & { filled: boolean }>;
  }, [myName, myAvatar, myTeam, opponents]);

  const team1 = useMemo(() => allSlots.filter(p => !teamsLocked || p.team === 1), [allSlots, teamsLocked]);
  const team2 = useMemo(() => allSlots.filter(p => teamsLocked && p.team === 2), [allSlots, teamsLocked]);

  return (
    <View style={[ss.root, { paddingTop: insets.top || 16 }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: bgGlowOpacity }]}>
        <LinearGradient colors={[gradient[0], "#05050F", gradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View style={ss.topHeader}>
        <View style={ss.modePill}>
          <Ionicons name="flash" size={11} color="#A5F3FC" />
          <Text style={ss.modePillText}>{modeLabel || "MATCHMAKING"}</Text>
        </View>
        {roundNumber != null && roundTotal != null && roundTotal > 1 && (
          <View style={[ss.modePill, { backgroundColor: 'rgba(124,58,237,0.25)', marginTop: 8 }]}>
            <Ionicons name="repeat" size={11} color="#A78BFA" />
            <Text style={[ss.modePillText, { color: '#C4B5FD' }]}>Round {roundNumber} of {roundTotal}</Text>
          </View>
        )}
      </View>

      <View style={ss.slotsSection}>

        {teamsLocked && team2.length > 0 ? (
          <View style={ss.teamVsLayout}>
            <View style={ss.teamColumn}>
              <Text style={ss.teamLabel}>TEAM 1</Text>
              {team1.map((p, i) => <PlayerSlot key={p.id || i} player={p} index={i} phase={phase} />)}
            </View>
            <View style={ss.vsCenterBadge}><Text style={ss.vsCenterText}>VS</Text></View>
            <View style={ss.teamColumn}>
              <Text style={ss.teamLabel}>TEAM 2</Text>
              {team2.map((p, i) => <PlayerSlot key={p.id || i} player={p} index={i} phase={phase} />)}
            </View>
          </View>
        ) : team1.length === 2 ? (
          <View style={ss.teamVsLayout}>
            <PlayerSlot player={team1[0]} index={0} phase={phase} />
            <View style={ss.vsCenterBadge}><Text style={ss.vsCenterText}>VS</Text></View>
            <PlayerSlot player={team1[1]} index={1} phase={phase} />
          </View>
        ) : (
          <View style={ss.gridWrap}>
            {team1.map((p, i) => <PlayerSlot key={p.id || i} player={p} index={i} phase={phase} />)}
          </View>
        )}
      </View>

      <View style={ss.bottomSection}>
        {showMatchStarting ? (
          <Animated.View style={[ss.matchStartingBanner, {
            opacity: readyPulse,
            transform: [{ scale: readyPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }]
          }]}>
            <LinearGradient colors={["rgba(34,197,94,0)", "rgba(34,197,94,0.4)", "rgba(34,197,94,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="flash" size={24} color="#4ADE80" />
            <Text style={ss.matchStartingText}>MATCH STARTING</Text>
            <Ionicons name="flash" size={24} color="#4ADE80" />
          </Animated.View>
        ) : (
          <LoadingStages ready={phase === "ready"} />
        )}
        <View style={{ height: 16 }} />
        {phase === "waiting" && <RotatingTip game={game} />}
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 32,
    overflow: "hidden",
    backgroundColor: "#05050F",
  },
  topHeader: {
    alignItems: "center",
    marginTop: 10,
    zIndex: 10,
  },
  modePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  modePillText: { color: "#A5F3FC", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  
  slotsSection: { 
    width: "100%", 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center",
    zIndex: 5,
  },
  matchStartingBanner: {
    width: "120%",
    alignSelf: "center",
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    zIndex: 20,
    marginBottom: 16,
  },
  matchStartingText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 4,
    textShadowColor: "rgba(34,197,94,0.8)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  teamVsLayout: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-around",
    width: "100%", 
    maxWidth: 420,
  },
  teamColumn: {
    alignItems: "center",
    gap: 12,
  },
  teamLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 4,
  },
  gridWrap: { 
    flexDirection: "row", 
    flexWrap: "wrap", 
    justifyContent: "center", 
    gap: 16, 
    maxWidth: 420,
  },
  vsCenterBadge: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    alignItems: "center", 
    justifyContent: "center", 
    backgroundColor: "rgba(255,255,255,0.1)", 
    borderWidth: 1.5, 
    borderColor: "rgba(255,255,255,0.3)",
    marginHorizontal: 12,
  },
  vsCenterText: { color: "#fff", fontSize: 16, fontWeight: "900", fontStyle: "italic" },
  
  slot: { 
    alignItems: "center", 
    paddingVertical: 16, 
    paddingHorizontal: 12,
    borderRadius: 20, 
    backgroundColor: "rgba(255,255,255,0.03)", 
    borderWidth: 1, 
    borderColor: "rgba(255,255,255,0.1)", 
    gap: 8, 
    width: 110,
  },
  slotName: { color: "#F8FAFC", fontSize: 13, fontWeight: "800" },
  slotBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" },
  slotBadgeMe: { backgroundColor: "rgba(34,211,238,0.12)" },
  slotBadgeReady: { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.4)", borderWidth: 1 },
  slotBadgeText: { color: "#64748B", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  slotBadgeTextMe: { color: "#22D3EE" },
  slotBadgeTextReady: { color: "#4ADE80" },

  bottomSection: {
    width: "100%",
    zIndex: 10,
  },
  stagesWrap: { width: "100%" },
  progressBarBg: { height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", marginBottom: 12 },
  progressBarFill: { height: "100%", backgroundColor: "#7C3AED", borderRadius: 2 },
  stagesRow: { flexDirection: "row", justifyContent: "space-between" },
  stageItem: { alignItems: "center", gap: 6, flex: 1 },
  stageDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  stageDotActive: { backgroundColor: "rgba(124,58,237,0.4)" },
  stageDotCurrent: { backgroundColor: "#7C3AED", shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8 },
  stageLabel: { color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textAlign: "center" },
  stageLabelActive: { color: "rgba(255,255,255,0.8)" },
  
  tipCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(251,191,36,0.08)", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(251,191,36,0.15)",
    width: "100%",
  },
  tipText: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600", flex: 1, lineHeight: 18 },
});
