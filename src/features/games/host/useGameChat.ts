/**
 * useGameChat — shared in-game chat controller.
 *
 * Owns ALL chat state and plumbing that every game host needs:
 * - open/closed + unread badge
 * - measured panel height (reported by GameChatPanel via onPanelLayout)
 * - incoming messages bridged from the engine socket via
 *   DeviceEventEmitter ("GAME_ENGINE_CHAT"), scoped to the active matchId
 * - "OPEN_GAME_CHAT" requests emitted by game runtimes (Ludo, SnakeLadder,
 *   Scribble use this to pop the chat open from in-game UI)
 * - outgoing messages re-emitted as "GAME_PANEL_OUTGOING_CHAT" so the
 *   runtime's socket layer sends them to the engine
 * - the animated wrapper height (0 → panelH, 260ms ease-out) that drives the
 *   stage reflow: the game stage is a flex sibling, so animating this height
 *   shrinks the stage and the game re-letterboxes continuously.
 *
 * Games never see chat mechanics — they render into the viewport the shell
 * measures (GameStageContext.viewportWidth/Height), which reflows with the
 * chat panel automatically.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, DeviceEventEmitter, Easing } from "react-native";

export type ChatPlayerRef = { id: string; name?: string } | undefined;

export type GameChatIncoming = { name: string; text: string };

type Opts = {
  matchId: string;
  /** Roster used to resolve sender names from userIds. */
  players: ChatPlayerRef[];
  /** Whether the chat panel is available at all (rendered during prestart + playing). */
  enabled?: boolean;
};

export function useGameChat({ matchId, players, enabled = true }: Opts) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPanelH, setChatPanelH] = useState(0);
  const [chatUnread, setChatUnread] = useState(false);
  const [chatIncoming, setChatIncoming] = useState<GameChatIncoming | null>(
    null,
  );

  // Animated chat wrapper height — the ONLY layout animation for chat. The
  // game stage is a flex sibling, so as this height animates 0 → panelH the
  // stage reflows smoothly and the game canvas re-letterboxes continuously.
  const chatWrapAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    Animated.timing(chatWrapAnim, {
      toValue: chatOpen ? chatPanelH || 280 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // layout height — must run on JS driver
    }).start();
  }, [chatOpen, chatPanelH, chatWrapAnim, enabled]);

  // Engine-socket chat events: incoming messages + open requests.
  useEffect(() => {
    if (!enabled) return;
    const subOpen = DeviceEventEmitter.addListener("OPEN_GAME_CHAT", () =>
      setChatOpen(true),
    );
    const subMsg = DeviceEventEmitter.addListener(
      "GAME_ENGINE_CHAT",
      (event: any) => {
        if (event.matchId !== matchId) return;
        const d = event.data;
        const info = (players || []).find(
          (p: any) => p.id === (d.userId || d.uid),
        );
        setChatIncoming({
          name: info?.name || d.name || "Player",
          text: d.text || "",
        });
      },
    );
    return () => {
      subOpen.remove();
      subMsg.remove();
    };
  }, [matchId, enabled]);

  // Clear the incoming message after it's been consumed by GameChatPanel.
  useEffect(() => {
    if (!chatIncoming) return;
    const t = setTimeout(() => setChatIncoming(null), 500);
    return () => clearTimeout(t);
  }, [chatIncoming]);

  const toggleChat = useCallback(() => {
    setChatOpen((p) => !p);
    setChatUnread(false);
  }, []);

  const closeChat = useCallback(() => setChatOpen(false), []);

  const clearUnread = useCallback(() => setChatUnread(false), []);

  const onPanelLayout = useCallback((h: number) => setChatPanelH(h), []);

  const onSend = useCallback((text: string) => {
    DeviceEventEmitter.emit("GAME_PANEL_OUTGOING_CHAT", text);
  }, []);

  const onUnread = useCallback(() => {
    setChatUnread(true);
  }, []);

  return {
    chatOpen,
    chatPanelH,
    chatUnread,
    chatIncoming,
    chatWrapAnim,
    toggleChat,
    closeChat,
    clearUnread,
    onPanelLayout,
    onSend,
    onUnread,
  };
}
