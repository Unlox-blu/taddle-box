/**
 * GameChatPanel — compact in-game chat overlay.
 *
 * Design goals:
 * - Minimal height: header + 2-message scrollable history + input row
 * - No "local" indicator pill
 * - Keyboard-aware on both platforms (inside Modal, no adjustResize)
 * - Reports height via onPanelLayout so playStage can shrink the board
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
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

type ChatMessage = {
  id: number;
  name: string;
  text: string;
  isMe: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPanelLayout?: (height: number) => void;
  playerName?: string;
  incoming?: { name: string; text: string } | null;
  onUnread?: () => void;
  onSend?: (text: string) => void;
  /** Keyboard height from GamesScreen — used to lift the panel above the keyboard. */
  kbHeight?: number;
};

export default function GameChatPanel({
  open,
  onClose,
  onPanelLayout,
  playerName = "You",
  incoming,
  onUnread,
  onSend,
  kbHeight = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const idRef = useRef(0);

  // Dismiss keyboard when panel closes
  useEffect(() => {
    if (!open) Keyboard.dismiss();
  }, [open]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  }, [messages.length]);

  // Handle incoming socket messages
  useEffect(() => {
    if (!incoming) return;
    setMessages((prev) => [
      ...prev,
      { id: ++idRef.current, name: incoming.name, text: incoming.text, isMe: false },
    ]);
    if (!open) onUnread?.();
  }, [incoming]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      onSend?.(trimmed);
      setMessages((prev) => [
        ...prev,
        { id: ++idRef.current, name: playerName, text: trimmed, isMe: true },
      ]);
      setDraft("");
    },
    [playerName, onSend],
  );

  if (!open) return null;

  // Lift the panel above the keyboard. When keyboard is up, ignore safeArea
  // bottom inset (keyboard already sits above the home indicator).
  const bottomOffset = kbHeight > 0 ? kbHeight : Math.max(insets.bottom, 6);

  return (
    <View
      style={[styles.wrap, { bottom: bottomOffset }]}
      onLayout={(e) => onPanelLayout?.(e.nativeEvent.layout.height + bottomOffset)}
    >
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="chatbubble-ellipses" size={15} color="#A78BFA" />
        <Text style={styles.headerTitle}>Chat</Text>
        <TouchableOpacity
          onPress={() => { Keyboard.dismiss(); onClose(); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={18} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Message history — fixed height showing ~2 rows, scrollable */}
      <ScrollView
        ref={scrollRef}
        style={styles.msgList}
        contentContainerStyle={styles.msgListContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <Text style={styles.emptyHint}>No messages yet — say hi! 👋</Text>
        ) : (
          messages.map((m) => (
            <View key={m.id} style={[styles.msgRow, m.isMe && styles.msgRowMe]}>
              {!m.isMe && (
                <Text style={styles.msgName}>{m.name}: </Text>
              )}
              <Text style={[styles.msgText, m.isMe && styles.msgTextMe]} numberOfLines={2}>
                {m.isMe ? `You: ${m.text}` : m.text}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          placeholderTextColor="#475569"
          maxLength={200}
          returnKeyType="send"
          onSubmitEditing={() => { sendMessage(draft); inputRef.current?.focus(); }}
        />
        <TouchableOpacity
          onPress={() => { sendMessage(draft); inputRef.current?.focus(); }}
          style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
          disabled={!draft.trim()}
          activeOpacity={0.7}
        >
          <Ionicons name="send" size={16} color={draft.trim() ? "#fff" : "#475569"} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: "rgba(10, 14, 26, 0.97)",
    borderTopWidth: 1,
    borderTopColor: "rgba(139, 92, 246, 0.25)",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 6,
  },
  headerTitle: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  closeBtn: {
    padding: 2,
  },
  // ~2 messages tall (each row ~20px + padding)
  msgList: {
    height: 52,
  },
  msgListContent: {
    paddingBottom: 2,
  },
  emptyHint: {
    color: "#475569",
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 20,
  },
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 3,
    flexWrap: "wrap",
  },
  msgRowMe: {},
  msgName: {
    color: "#A78BFA",
    fontSize: 12,
    fontWeight: "700",
  },
  msgText: {
    color: "#CBD5E1",
    fontSize: 12,
    flex: 1,
  },
  msgTextMe: {
    color: "#E2E8F0",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  input: {
    flex: 1,
    height: 36,
    backgroundColor: "rgba(30, 41, 59, 0.9)",
    borderRadius: 18,
    paddingHorizontal: 14,
    color: "#F1F5F9",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.2)",
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#7C3AED",
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "rgba(30, 41, 59, 0.9)",
  },
});
