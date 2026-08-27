/**
 * Standalone sub-components used by LudoGame.
 * Each is a pure presentational component — no game state, no socket.
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  ScrollView,
  TextInput,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "./ludoStyles";
import { CORNER_POS, CHAT_MAX_H } from "./shared";
import type { ChatMsg } from "./shared";

// ── Glow around the ACTIVE player's corner card ──────────────────────────────
export function ActiveCardGlow({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(a, {
          toValue: 0,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ position: "relative" }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          borderRadius: 20,
          borderWidth: 2.5,
          borderColor: color,
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          shadowColor: color,
          shadowOpacity: 0.9,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        }}
      />
      {children}
    </View>
  );
}

// ── Die turn-glow ────────────────────────────────────────────────────────────
export function DieGlow({ color, size = 56 }: { color: string; size?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(a, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const inset = size * 0.035;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -inset,
        left: -inset,
        right: -inset,
        bottom: -inset,
        borderRadius: size * 0.36,
        borderWidth: 1.5,
        borderColor: color,
        opacity: a.interpolate({
          inputRange: [0, 1],
          outputRange: [0.12, 0.4],
        }),
        shadowColor: color,
        shadowOpacity: 0.3,
        shadowRadius: size * 0.1,
        shadowOffset: { width: 0, height: 0 },
        elevation: 3,
      }}
    />
  );
}

// ── Capture impact burst ─────────────────────────────────────────────────────
export function CaptureBurst({
  burst,
  cell,
  onDone,
}: {
  burst: { id: number; x: number; y: number; color: string };
  cell: number;
  onDone: (id: number) => void;
}) {
  const ring = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(1)).current;
  const size = Math.max(34, cell * 1.7);
  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(ring, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(flash, {
        toValue: 0,
        duration: 340,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) onDone(burst.id);
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: burst.x - size / 2,
        top: burst.y - size / 2,
        width: size,
        height: size,
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: burst.color,
          opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
          transform: [
            { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.25] }) },
          ],
        }}
      />
      <Animated.View
        style={{
          position: "absolute",
          left: size * 0.22,
          right: size * 0.22,
          top: size * 0.22,
          bottom: size * 0.22,
          borderRadius: size / 2,
          backgroundColor: burst.color,
          opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] }),
          transform: [
            { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.35] }) },
          ],
        }}
      />
    </View>
  );
}

// ── Loading dots ─────────────────────────────────────────────────────────────
export function LoadingDots() {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 200} />
      ))}
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(a, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(a, {
          toValue: 0.3,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#7C3AED",
        opacity: a,
      }}
    />
  );
}

// ── Chat bubble floating over a player's corner card ─────────────────────────
export function CornerBubble({
  pop,
  cornerIdx,
  chatInset = 0,
  kbH = 0,
  onDone,
}: {
  pop: { id: number; uid: string; name: string; text: string; color: string };
  cornerIdx: number;
  chatInset?: number;
  kbH?: number;
  onDone: (id: number) => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.delay(2200),
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDone(pop.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pos = CORNER_POS[cornerIdx % 4];
  const vertKey = pos?.vert === "bottom" ? "bottom" : "top";
  const vertVal = pos?.vert === "bottom" ? 118 + chatInset + kbH : 88;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        [pos?.align ?? "left"]: 12,
        [vertKey]: vertVal,
        maxWidth: 190,
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
        ],
        zIndex: 60,
      }}
    >
      <View style={[styles.bubble, { borderLeftColor: pop.color }]}>
        <Text style={styles.bubbleText} numberOfLines={2}>
          {pop.text}
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Chat panel (inline bottom sheet) ─────────────────────────────────────────
export function ChatSheet({
  messages,
  draft,
  onDraftChange,
  onSend,
  onClose,
  onPanelLayout,
  scrollRef,
  inputRef,
  kbH = 0,
}: {
  messages: ChatMsg[];
  draft: string;
  onDraftChange: (t: string) => void;
  onSend: (t: string) => void;
  onClose: () => void;
  onPanelLayout: (h: number) => void;
  scrollRef: React.RefObject<ScrollView | null>;
  inputRef: React.RefObject<TextInput | null>;
  kbH?: number;
}) {
  const submit = () => {
    onSend(draft);
    inputRef.current?.focus();
  };

  const QUICK_EMOJIS = ["😄", "😂", "🔥", "👍", "🎉", "😮", "💪", "❤️"];
  const sheetMaxH = kbH > 0 ? 96 : CHAT_MAX_H;

  return (
    <View style={styles.chatWrap}>
      <View
        style={[styles.chatSheet, { maxHeight: sheetMaxH }]}
        onLayout={(e) => onPanelLayout(e.nativeEvent.layout.height)}
      >
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle}>💬 Match Chat</Text>
          <View style={styles.chatLiveTag}>
            <View style={styles.chatLiveDot} />
            <Text style={styles.chatLiveText}>live</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={22} color="#C4B5FD" />
          </TouchableOpacity>
        </View>

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
            <Text style={styles.chatEmpty}>No messages yet — say hi! 👋</Text>
          )}
          {messages.map((m) => (
            <View key={m.id} style={styles.chatMsg}>
              <View style={styles.chatMsgMeta}>
                <Text style={[styles.chatMsgName, { color: m.color }]}>
                  {m.name}
                </Text>
                <Text style={styles.chatMsgTime}>{m.time}</Text>
              </View>
              <View
                style={[styles.chatBubbleRow, { borderLeftColor: m.color }]}
              >
                <Text style={styles.chatMsgText}>{m.text}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {kbH > 0 ? null : (
          <View style={styles.chatEmojiRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.chatEmojiRowInner}
            >
              {QUICK_EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={styles.chatEmojiBtn}
                  onPress={() => onSend(e)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chatEmojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.chatInputRow}>
          <TextInput
            ref={inputRef}
            style={styles.chatInput}
            value={draft}
            onChangeText={onDraftChange}
            placeholder="Type a message…"
            placeholderTextColor="#6B7280"
            multiline
            maxLength={140}
            onSubmitEditing={submit}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.chatSend, !draft.trim() && { opacity: 0.45 }]}
            onPress={submit}
            disabled={!draft.trim()}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
