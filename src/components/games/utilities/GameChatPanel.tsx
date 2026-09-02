/**
 * GameChatPanel — shared local-only chat panel for all game runtimes.
 *
 * Keyboard-aware bottom sheet that lifts above the keyboard on iOS
 * (overlay keyboard) and lets Android's adjustResize handle the resize.
 * Reports its measured height so the parent can shrink the game content.
 *
 * Follows the same pattern as Ludo's ChatSheet.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const { height: SCREEN_H } = Dimensions.get("window");
const CHAT_MAX_H = Math.max(196, Math.floor(SCREEN_H * 0.26));

type ChatMessage = {
  id: number;
  name: string;
  text: string;
  time: string;
};

const QUICK_EMOJIS = ["👍", "😂", "🔥", "❤️", "😮", "😢"];

type Props = {
  open: boolean;
  onClose: () => void;
  onPanelLayout?: (height: number) => void;
  playerName?: string;
  /** Incoming message from another player (via socket). */
  incoming?: { name: string; text: string } | null;
  /** Called when a message arrives while the panel is closed (for unread badge). */
  onUnread?: () => void;
  /** Called when the local player sends a message. */
  onSend?: (text: string) => void;
};

export default function GameChatPanel({
  open,
  onClose,
  onPanelLayout,
  playerName = "You",
  incoming,
  onUnread,
  onSend,
}: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [kbH, setKbH] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const idRef = useRef(0);

  // ── Keyboard tracking (iOS overlay / Android adjustResize) ───────────
  useEffect(() => {
    if (!open) return;

    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: any) => setKbH(e.endCoordinates?.height || 0);
    const onHide = () => setKbH(0);

    const sub1 = Keyboard.addListener(showEvt, onShow);
    const sub2 = Keyboard.addListener(hideEvt, onHide);

    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, [open]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  // Dismiss keyboard when panel closes
  useEffect(() => {
    if (!open) Keyboard.dismiss();
  }, [open]);

  // Handle incoming messages from socket
  useEffect(() => {
    if (!incoming) return;
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, "0")}:${now
      .getMinutes().toString().padStart(2, "0")}`;
    setMessages((prev) => [
      ...prev,
      { id: ++idRef.current, name: incoming.name, text: incoming.text, time },
    ]);
    // If panel is closed, signal unread
    if (!open) onUnread?.();
  }, [incoming]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      onSend?.(trimmed);
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
      setMessages((prev) => [
        ...prev,
        { id: ++idRef.current, name: playerName, text: trimmed, time },
      ]);
      setDraft("");
    },
    [playerName],
  );

  const sendEmoji = useCallback(
    (emoji: string) => {
      onSend?.(emoji);
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
      setMessages((prev) => [
        ...prev,
        { id: ++idRef.current, name: playerName, text: emoji, time },
      ]);
    },
    [playerName],
  );


  // iOS: keyboard overlays → lift the sheet by kbH
  // Android: window resizes → no manual lift needed
  const kbLift = Platform.OS === "ios" ? kbH : 0;
  const sheetMaxH = kbH > 0 ? 96 : CHAT_MAX_H;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
      style={[styles.chatWrap, { paddingBottom: insets.bottom || 6 }, !open && { display: "none" }]}
    >
      <View
        style={[styles.chatSheet, { maxHeight: sheetMaxH }]}
        onLayout={(e) => onPanelLayout?.(e.nativeEvent.layout.height)}
      >
        {/* Header */}
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle}>💬 Chat</Text>
          <View style={styles.chatLiveTag}>
            <View style={styles.chatLiveDot} />
            <Text style={styles.chatLiveText}>local</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              onClose();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={22} color="#C4B5FD" />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <Text style={styles.chatEmpty}>
              No messages yet — say hi! 👋
            </Text>
          )}
          {messages.map((m) => (
            <View key={m.id} style={styles.chatRow}>
              <Text style={styles.chatTime}>{m.time}</Text>
              <Text style={styles.chatName}>{m.name}:</Text>
              <Text style={styles.chatMsg}>{m.text}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Quick emojis — hidden when keyboard is open to save space */}
        {kbH === 0 && (
          <View style={styles.emojiRow}>
            {QUICK_EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                onPress={() => sendEmoji(e)}
                style={styles.emojiBtn}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Input */}
        <View style={styles.chatInputRow}>
          <TextInput
            ref={inputRef}
            style={styles.chatInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor="#64748B"
            maxLength={200}
            returnKeyType="send"
            onSubmitEditing={() => {
              sendMessage(draft);
              inputRef.current?.focus();
            }}
          />
          <TouchableOpacity
            onPress={() => {
              sendMessage(draft);
              inputRef.current?.focus();
            }}
            style={styles.sendBtn}
            disabled={!draft.trim()}
          >
            <Ionicons
              name="send"
              size={18}
              color={draft.trim() ? "#A78BFA" : "#475569"}
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chatWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 10,
  },
  chatSheet: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderRadius: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.3)",
    overflow: "hidden",
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(139, 92, 246, 0.15)",
  },
  chatTitle: { color: "#E2E8F0", fontSize: 15, fontWeight: "700", flex: 1 },
  chatLiveTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 10,
  },
  chatLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
    marginRight: 4,
  },
  chatLiveText: { color: "#22C55E", fontSize: 11, fontWeight: "600" },
  chatList: { flex: 1, maxHeight: 120 },
  chatListContent: { paddingHorizontal: 14, paddingVertical: 8 },
  chatEmpty: {
    color: "#64748B",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 12,
    fontStyle: "italic",
  },
  chatRow: { flexDirection: "row", marginBottom: 6, alignItems: "flex-start" },
  chatTime: { color: "#64748B", fontSize: 11, marginRight: 6, marginTop: 1 },
  chatName: {
    color: "#A78BFA",
    fontSize: 13,
    fontWeight: "700",
    marginRight: 4,
  },
  chatMsg: { color: "#E2E8F0", fontSize: 13, flex: 1 },
  emojiRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(139, 92, 246, 0.1)",
  },
  emojiBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  emojiText: { fontSize: 16 },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: Platform.OS === "ios" ? 20 : 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(139, 92, 246, 0.15)",
  },
  chatInput: {
    flex: 1,
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: "#E2E8F0",
    fontSize: 14,
    marginRight: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
});
