/**
 * GameStageShell — shared layout for every game host.
 *
 * Structure (top-down):
 *
 *   ┌─────────────────────────────┐
 *   │ playHeader (slot)           │ ← host renders its own controls
 *   ├─────────────────────────────┤
 *   │ playStage (children)        │ ← the game + overlays; flex sibling
 *   ├─────────────────────────────┤
 *   │ chat wrapper (animated)     │ ← height 0 ⇄ panelH; stage reflows above
 *   └─────────────────────────────┘
 *
 * The shell OWNS the question "how much room does the game have?" — the chat
 * panel, its animation, the keyboard tracking, and the stage/prestart layout
 * relationship. The host OWNS "what renders in that room" (children) and
 * "what the header shows" (playHeader slot).
 *
 * The shell knows NOTHING about specific games (no gameSlug conditionals).
 * Chat mechanics are handled by useGameChat; the shell just wires it to
 * GameChatPanel.
 *
 * During "prestart" (start screen showing) the chat panel still renders so
 * the header chat button works, matching the original GamePlayModal behavior.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Animated, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../../design-system/theme/ThemeProvider";
import GameChatPanel from "../components/GameChatPanel";
import { useGameChat, type ChatPlayerRef } from "./useGameChat";
import { useGameKeyboard } from "./useGameKeyboard";

type Props = {
  matchId: string;
  /** Roster for resolving chat sender names. */
  players: ChatPlayerRef[];
  /** Chat available during the "prestart" (start screen) phase too. Default true. */
  chatAvailable?: boolean;
  /** Local player's display name for the chat panel. */
  playerName?: string;
  /** Header row (leave button, title, chat toggle, score…) — NOT styled by the shell.
   *  May be a render-prop receiving GameStageContext (for the chat toggle button). */
  playHeader?: React.ReactNode | ((ctx: GameStageContext) => React.ReactNode);
  /**
   * Game + overlays rendered inside the stage (flex: 1, black background).
   * May be a render-prop receiving GameStageContext — its `viewportWidth` /
   * `viewportHeight` are the measured available dimensions (reflow with chat
   * and keyboard automatically).
   */
  children: React.ReactNode | ((ctx: GameStageContext) => React.ReactNode);
};

export default function GameStageShell({
  matchId,
  players,
  chatAvailable = true,
  playerName,
  playHeader,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  // Rendered under ForcedDarkThemeProvider → always resolves to the dark palette.
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const chat = useGameChat({ matchId, players, enabled: chatAvailable });
  const kbHeight = useGameKeyboard();

  // Stage measurement — THE viewport contract. The shell answers "how much
  // room does the game have?" (already accounting for chat + keyboard via
  // flex reflow); the game answers "how do I render inside that room?".
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStageSize((prev) =>
      Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
        ? prev
        : { w: width, h: height },
    );
  }, []);

  const ctx: GameStageContext = {
    viewportWidth: stageSize.w,
    viewportHeight: stageSize.h,
    kbHeight,
    chat,
  };

  const headerNode =
    typeof playHeader === "function"
      ? (playHeader as Function)(ctx)
      : playHeader;

  const stageChildren =
    typeof children === "function" ? (children as Function)(ctx) : children;

  return (
    <View
      style={[
        styles.playModal,
        { paddingTop: insets.top || 16 },
        // Keyboard lift — the shell lives inside a fullscreen Modal, whose
        // window does NOT resize when the keyboard opens (it OVERLAYS, on iOS
        // always and on Android in most softInputMode configs). Without this
        // padding the keyboard covers the chat panel's input row and the
        // bottom of the stage. Lifting the whole container reflows the stage
        // (smaller viewport) AND keeps the chat input above the keyboard.
        // Uses keyboardWillShow on iOS for smooth pre-emptive reflow.
        kbHeight > 0 && { paddingBottom: kbHeight },
      ]}
    >
      {headerNode ? <View style={styles.playHeader}>{headerNode}</View> : null}

      {/* playStage: flex sibling of the chat wrapper — when chat opens the
          wrapper's height animates 0 → panelHeight, the stage reflows above
          it, and the game scales its own canvas to the remaining rectangle. */}
      <View style={styles.playStage} onLayout={onStageLayout}>
        {stageChildren}
      </View>

      {/* In-game chat — animated wrapper below the stage. Rendered while chat
          is available (including prestart) so the header button always works. */}
      {chatAvailable && (
        <Animated.View style={{ height: chat.chatWrapAnim }}>
          {chat.chatOpen && (
            <GameChatPanel
              open
              playerName={playerName}
              onClose={chat.closeChat}
              onPanelLayout={chat.onPanelLayout}
              incoming={chat.chatIncoming}
              onUnread={chat.onUnread}
              onSend={chat.onSend}
            />
          )}
        </Animated.View>
      )}
    </View>
  );
}

export type GameStageContext = {
  /** Available stage width (px) — the room the game renders in. */
  viewportWidth: number;
  /** Available stage height (px) — reflows with the chat panel automatically. */
  viewportHeight: number;
  /**
   * Keyboard height (0 when closed). The keyboard OVERLAYS the fullscreen
   * Modal on both platforms — the shell lifts its content by this amount
   * (paddingBottom), so the stage viewport and chat panel stay above it.
   * Absolute-positioned overlays inside the stage do NOT need an extra lift
   * (the stage already shrinks); they only need the chat-panel offset.
   */
  kbHeight: number;
  /** Full chat controller — header buttons need toggleChat/unread state. */
  chat: ReturnType<typeof useGameChat>;
};

const makeStyles = (c: any) =>
  StyleSheet.create({
    playModal: {
      flex: 1,
      backgroundColor: c.bg.base,
    },
    playHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    playStage: {
      flex: 1,
      backgroundColor: "#000",
    },
  });
