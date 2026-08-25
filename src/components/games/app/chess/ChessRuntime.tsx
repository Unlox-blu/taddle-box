/**
 * ChessRuntime — game-specific state + rendering for chess.
 *
 * Uses the shared useGameSocket hook for all socket lifecycle.
 * Owns only: chess.js instance, board state, move validation, captures, timers.
 *
 * Architecture:
 *   useGameSocket  → connection, auth, JOIN, READY, CONNECT_ACK, START, SYNC, GAME_OVER
 *   ChessRuntime   → chess.js state, local move validation, captures, timers
 *   ChessGame      → board renderer (pure pixels)
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import { useGameSocket, GAME_EVENTS, type ExternalPhase } from "../../../../hooks/useGameSocket";
import { gameSound, useTurnSound } from "../../../../services/gameSound";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
import ChessGame from "./ChessGame";

// ── Props ─────────────────────────────────────────────────────────────────

interface ChessRuntimeProps {
  matchId: string;
  userId: string;
  wsToken: string;
  players?: PlayerContext[];
  externalPhase?: ExternalPhase;
  onComplete: (result: HtmlGameResult) => void;
  /** Resolved game assets from the asset manifest system (key → local URI). */
  assets?: Record<string, string>;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ChessRuntime({
  matchId,
  userId,
  wsToken,
  players,
  externalPhase,
  onComplete,
}: ChessRuntimeProps) {
  // ── Chess-specific state ────────────────────────────────────────────
  const [chess] = useState(new Chess());
  const [playerColor, setPlayerColorState] = useState<"w" | "b">("w");
  const playerColorRef = useRef<"w" | "b">("w");
  const setPlayerColor = (color: "w" | "b") => {
    playerColorRef.current = color;
    setPlayerColorState(color);
  };
  const [opponentName, setOpponentName] = useState("Opponent");
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [moves, setMoves] = useState<{ w: string | null; b: string | null }>({ w: null, b: null });
  const [inCheck, setInCheck] = useState(false);
  const [captures, setCaptures] = useState<{ w: string[]; b: string[] }>({ w: [], b: [] });
  const [timers, setTimers] = useState<{ w: number; b: number }>({ w: 600000, b: 600000 });

  const statusRef = useRef<string>("connecting");

  // ── Helper: update turn state from chess instance ────────────────────
  const updateTurnState = useCallback((chessInstance: Chess, color: "w" | "b") => {
    setIsMyTurn(chessInstance.turn() === color);
  }, []);

  // ── Helper: extract captures from move history ──────────────────────
  const updateCaptures = useCallback((moveHistory: any[]) => {
    const wCaps: string[] = [];
    const bCaps: string[] = [];
    for (const move of moveHistory) {
      if (move.captured) {
        if (move.color === "w") wCaps.push(move.captured);
        else bCaps.push(move.captured);
      }
    }
    setCaptures({ w: wCaps, b: bCaps });
  }, []);

  // ── Shared socket hook ──────────────────────────────────────────────
  const { socket, status, players: enginePlayers, me, revision, sendCommand } = useGameSocket({
    matchId,
    userId,
    wsToken,
    externalPhase,
    onComplete,

    onConnectAck: (data) => {
      const pluginState = data?.state?.pluginState ?? data?.state;

      // Load chess position from FEN
      if (pluginState?.fen) {
        chess.load(pluginState.fen);
      }

      // Resolve player color and opponent name
      const myPlayer = enginePlayers?.find((p) => p.id === userId);
      const oppPlayer = enginePlayers?.find((p) => p.id !== userId);
      if (myPlayer) setPlayerColor((me as any)?.color || "w");
      if (oppPlayer) setOpponentName(oppPlayer.name);
      else setOpponentName("AI Bot");

      // Extract timers and captures
      if (pluginState?.timers) setTimers(pluginState.timers);
      if (pluginState?.moveHistory) updateCaptures(pluginState.moveHistory);

      return {};
    },

    onStart: (data) => {
      const ps = data?.state?.pluginState ?? data?.state;
      if (ps?.fen) chess.load(ps.fen);
      if (ps?.timers) setTimers(ps.timers);
      if (ps?.moveHistory) {
        updateCaptures(ps.moveHistory);
        if (ps.moveHistory.length > 0) {
          const last = ps.moveHistory[ps.moveHistory.length - 1];
          setMoves((prev) => ({ ...prev, [last.color]: last.san }));
        }
      }
    },

    onSync: (pluginState) => {
      if (pluginState?.fen) {
        chess.load(pluginState.fen);
        if (chess.inCheck()) setInCheck(true);
        else setInCheck(false);

        if (pluginState.timers) setTimers(pluginState.timers);

        const history = chess.history({ verbose: true });
        if (history.length > 0) {
          const last = history[history.length - 1];
          setMoves((prev) => ({ ...prev, [last.color]: last.san }));
        }

        if (pluginState.moveHistory) updateCaptures(pluginState.moveHistory);
        updateTurnState(chess, playerColorRef.current);
      }
    },
  });

  // ── Keep statusRef in sync for move handler ─────────────────────────
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // ── Resolve player color from engine players ────────────────────────
  useEffect(() => {
    if (me) {
      const color = (me as any).color;
      if (color) setPlayerColor(color);
    }
  }, [me]);

  // ── Chess-specific: resolve initial turn after status becomes active ─
  useEffect(() => {
    if (status === "active") {
      updateTurnState(chess, playerColorRef.current);
    }
  }, [status, chess, updateTurnState]);

  // ── Local timer countdown ──────────────────────────────────────────
  useEffect(() => {
    if (status !== "active" || externalPhase !== "playing") return;
    const interval = setInterval(() => {
      setTimers((prev) => {
        const activeColor = chess.turn();
        return {
          ...prev,
          [activeColor]: Math.max(0, prev[activeColor as "w" | "b"] - 1000),
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, externalPhase]);

  // ── Turn sound ─────────────────────────────────────────────────────
  useTurnSound(isMyTurn, status === "active");

  // ── Move handler ───────────────────────────────────────────────────
  const onMove = useCallback(
    (move: { from: string; to: string; promotion?: string }) => {
      if (statusRef.current !== "active" || chess.turn() !== playerColorRef.current) return;
      try {
        const moveObj: any = { from: move.from, to: move.to };
        if (move.promotion) moveObj.promotion = move.promotion;
        const result = chess.move(moveObj);
        if (!result) return;
        if (result.captured) {
          setCaptures((prev) => ({
            ...prev,
            [playerColorRef.current]: [...prev[playerColorRef.current as "w" | "b"], result.captured],
          }));
        }
        setMoves((prev) => ({ ...prev, [playerColorRef.current]: result.san }));
        setIsMyTurn(false);
        sendCommand(GAME_EVENTS.MOVE, moveObj);
        gameSound.playTap();
      } catch {
        // invalid move — ignore
      }
    },
    [chess, sendCommand],
  );

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <ChessGame
      matchId={matchId}
      userId={userId}
      players={players}
      externalPhase={externalPhase}
      onComplete={onComplete}
      status={status}
      chess={chess}
      playerColor={playerColor}
      opponentName={opponentName}
      isMyTurn={isMyTurn}
      moves={moves}
      inCheck={inCheck}
      captures={captures}
      timers={timers}
      onMove={onMove}
    />
  );
}
