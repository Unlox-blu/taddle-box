/**
 * ScribbleRuntime — game-specific state for scribble (draw & guess).
 * Uses shared useGameSocket for all socket lifecycle.
 * Custom chat + drawing use raw socket listeners.
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Animated } from "react-native";
import { useGameSocket, GAME_EVENTS, type ExternalPhase } from "../../../../hooks/useGameSocket";
import { gameSound } from "../../../../services/gameSound";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
import { themedAlert } from "../../../common/ThemedAlert";
import ScribbleGame from "./ScribbleGame";

type Stroke = { points: { x: number; y: number }[]; color: string; width: number };
type ChatMsg = { userId: string; text: string; correct?: boolean; ts: number };

interface ScribbleRuntimeProps {
  matchId: string;
  userId: string;
  wsToken: string;
  players?: PlayerContext[];
  externalPhase?: ExternalPhase;
  onComplete: (result: HtmlGameResult) => void;
  /** Resolved game assets from the asset manifest system (key → local URI). */
  assets?: Record<string, string>;
}

const PLAYER_COLORS = ["#E32636", "#009E60", "#FFC000", "#007FFF"];

export default function ScribbleRuntime({
  matchId, userId, wsToken, players, externalPhase = "waiting", onComplete,
}: ScribbleRuntimeProps) {
  const [status, setStatus] = useState<"connecting" | "waiting" | "drawing" | "guessing" | "finished">("connecting");
  const [isDrawer, setIsDrawer] = useState(false);
  const [word, setWord] = useState<string | null>(null);
  const [wordMask, setWordMask] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const [penColor, setPenColor] = useState("#FFFFFF");
  const [penWidth, setPenWidth] = useState(6);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [guess, setGuess] = useState("");
  const [timeLeft, setTimeLeft] = useState(90);
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [showRoleCard, setShowRoleCard] = useState(false);

  const externalPhaseRef = useRef(externalPhase);
  useEffect(() => { externalPhaseRef.current = externalPhase; }, [externalPhase]);
  const lastPsRef = useRef<any>(null);
  const timerRoundRef = useRef<number>(0);
  const roleAnim = useRef(new Animated.Value(0)).current;
  const timerBarAnim = useRef(new Animated.Value(1)).current;
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const isDrawerRef = useRef(false);
  isDrawerRef.current = isDrawer;
  const socketRef = useRef<any>(null);
  const penColorRef = useRef(penColor);
  penColorRef.current = penColor;
  const penWidthRef = useRef(penWidth);
  penWidthRef.current = penWidth;
  const guessRef = useRef("");
  guessRef.current = guess;
  const timerRef = useRef<any>(null);

  const announceRole = useCallback((drawing: boolean) => {
    gameSound.playTurn();
    setShowRoleCard(true);
    roleAnim.setValue(0);
    Animated.sequence([
      Animated.spring(roleAnim, { toValue: 1, useNativeDriver: true, speed: 12 }),
      Animated.delay(2000),
      Animated.timing(roleAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowRoleCard(false));
  }, [roleAnim]);

  const startTimer = useCallback((total: number) => {
    clearInterval(timerRef.current);
    setTimeLeft(total);
    timerBarAnim.setValue(1);
    Animated.timing(timerBarAnim, { toValue: 0, duration: total * 1000, useNativeDriver: false }).start();
    let t = total;
    timerRef.current = setInterval(() => { t -= 1; setTimeLeft(t); if (t <= 0) clearInterval(timerRef.current); }, 1000);
  }, [timerBarAnim]);

  const startTimerFromState = useCallback((ps: any) => {
    if (ps?.roundStartedAt) {
      const elapsed = Math.floor((Date.now() - ps.roundStartedAt) / 1000);
      const roundDurationSec = ps.roundDurationMs ? Math.floor(ps.roundDurationMs / 1000) : 80;
      startTimer(Math.max(0, roundDurationSec - elapsed));
    } else {
      startTimer(80);
    }
  }, [startTimer]);

  const applyState = useCallback((ps: any, announce: boolean) => {
    lastPsRef.current = ps;
    const drawing = ps.drawerId === userId;
    setIsDrawer(drawing);
    if (announce) { announceRole(drawing); }
    setStatus(drawing ? "drawing" : "guessing");
    if (drawing && ps.word) setWord(ps.word);
    if (!drawing && ps.wordMask !== undefined) setWordMask(ps.wordMask);
    if (ps.strokes) setStrokes(ps.strokes);
    if (ps.currentRound) setRound(ps.currentRound);
    if (ps.scores) setScores(ps.scores);
    if (ps.guesses) {
      setChat(ps.guesses.map((g: any) => ({
        userId: g.userId, text: g.text, correct: g.correct, ts: g.ts || Date.now(),
      })));
    }
    if (externalPhaseRef.current === "playing") {
      const curRound = ps.currentRound ?? 0;
      if (!timerRef.current || curRound !== timerRoundRef.current) {
        timerRoundRef.current = curRound;
        startTimerFromState(ps);
      }
    }
  }, [userId, announceRole, startTimerFromState]);

  const { socket, sendCommand } = useGameSocket({
    matchId, userId, wsToken, externalPhase, onComplete,
    onConnectAck: (data) => {
      const ps = data.state?.pluginState;
      if (ps) applyState(ps, false);
      if (data.state?.status !== "ACTIVE") setStatus("waiting");
      return {};
    },
    onStart: (data) => {
      const ps = data.state?.pluginState ?? data.state;
      if (ps) applyState(ps, true);
    },
    onSync: (pluginState, _rev) => {
      // SYNC is handled by raw listener below (needs raw data for STROKE_CHUNK/END/CLEAR)
    },
  });

  // Raw socket listeners for SYNC sub-types + drawing + chat + errors
  useEffect(() => {
    if (!socket) return;
    socketRef.current = socket;

    const handleSync = (data: any) => {
      if (data.type === "STROKE_CHUNK") {
        if (data.userId !== userId) setCurrentStroke((prev) => [...prev, ...(data.points || [])]);
        return;
      }
      if (data.type === "STROKE_END") {
        if (data.userId !== userId && data.stroke) {
          setStrokes((prev) => [...prev, data.stroke]);
          setCurrentStroke([]);
        }
        return;
      }
      if (data.type === "CLEAR") {
        if (data.userId !== userId) { setStrokes([]); setCurrentStroke([]); }
        return;
      }
      if (data.state) applyState(data.state, false);
    };

    const handleChat = (data: any) => {
      const text = String(data?.text || "").trim();
      if (!text) return;
      const uid = String(data?.userId || "");
      const order = lastPsRef.current?.turnOrder || players?.map((p) => p.id) || [];
      const idx = order.indexOf(uid);
      const color = PLAYER_COLORS[(idx >= 0 ? idx : 0) % PLAYER_COLORS.length];
      const name = data?.name || players?.find((p) => p.id === uid)?.name || "Player";
      setChat((prev) => [...prev.slice(-50), {
        userId: uid, text, ts: data?.ts || Date.now(),
      }]);
    };

    const handleError = (e: any) => {
      const msg = e.message || "";
      if (msg.includes("Incorrect") || msg.includes("wrong") || msg.includes("not correct")) {
        // silently ignore — chat will reflect
      } else {
        themedAlert("Error", msg);
      }
    };

    const handlePause = () => {
      clearInterval(timerRef.current);
      timerBarAnim.stopAnimation();
    };

    socket.on("SYNC", handleSync);
    socket.on("CHAT", handleChat);
    socket.on("ERROR", handleError);
    socket.on("PAUSE", handlePause);

    return () => {
      socket.off("SYNC", handleSync);
      socket.off("CHAT", handleChat);
      socket.off("ERROR", handleError);
      socket.off("PAUSE", handlePause);
    };
  }, [socket, userId, players, applyState, timerBarAnim]);

  // Start clock when board becomes visible
  useEffect(() => {
    if (externalPhase !== "playing") return;
    if (status === "connecting" || status === "waiting" || status === "finished") return;
    if (!timerRef.current) startTimerFromState(lastPsRef.current);
  }, [externalPhase, status, startTimerFromState]);

  const submitGuess = useCallback(() => {
    if (isDrawer) return;
    const draft = guessRef.current.trim();
    if (!draft || !socket) return;
    socket.emit(GAME_EVENTS.MOVE, { type: "GUESS", text: draft });
    setChat((prev) => [...prev, { userId, text: draft, correct: false, ts: Date.now() }]);
    setGuess("");
    guessRef.current = "";
    gameSound.playTap();
  }, [isDrawer, socket, userId]);

  const finishStroke = useCallback(() => {
    const pts = currentStrokeRef.current;
    if (pts.length > 1) {
      const newStroke: Stroke = { points: pts, color: penColorRef.current, width: penWidthRef.current };
      socketRef.current?.emit(GAME_EVENTS.MOVE, { type: "STROKE_END", stroke: newStroke });
      setStrokes((prev) => [...prev, newStroke]);
    }
    currentStrokeRef.current = [];
    setCurrentStroke([]);
  }, []);

  const sendStrokeChunk = useCallback(() => {
    if (currentStrokeRef.current.length % 6 === 0) {
      socketRef.current?.emit(GAME_EVENTS.MOVE, {
        type: "STROKE_CHUNK", points: currentStrokeRef.current.slice(-6),
        color: penColorRef.current, width: penWidthRef.current,
      });
    }
  }, []);

  const clearCanvas = useCallback(() => {
    if (!isDrawerRef.current) return;
    setStrokes([]);
    currentStrokeRef.current = [];
    setCurrentStroke([]);
    socketRef.current?.emit(GAME_EVENTS.MOVE, { type: "CLEAR" });
  }, []);

  const myScore = scores[userId] || 0;

  return (
    <ScribbleGame
      matchId={matchId} userId={userId} players={players}
      externalPhase={externalPhase} onComplete={onComplete} status={status}
      isDrawer={isDrawer} word={word} wordMask={wordMask}
      strokes={strokes} currentStroke={currentStroke}
      setCurrentStroke={setCurrentStroke} currentStrokeRef={currentStrokeRef}
      penColor={penColor} setPenColor={setPenColor}
      penWidth={penWidth} setPenWidth={setPenWidth}
      chat={chat} guess={guess} setGuess={setGuess} guessRef={guessRef}
      timeLeft={timeLeft} round={round} scores={scores} myScore={myScore}
      showRoleCard={showRoleCard} roleAnim={roleAnim}
      timerBarAnim={timerBarAnim} isDrawerRef={isDrawerRef} socketRef={socketRef}
      penColorRef={penColorRef} penWidthRef={penWidthRef}
      finishStroke={finishStroke} sendStrokeChunk={sendStrokeChunk}
      clearCanvas={clearCanvas} submitGuess={submitGuess}
    />
  );
}
