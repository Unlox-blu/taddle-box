import React, { useState, useCallback, useEffect, memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { notificationBus } from "../../../shared/state/notification-bus";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  useTheme,
  useThemeColors,
} from "../../../design-system/theme/ThemeProvider";
import { useAuth } from "../../auth/state/AuthProvider";
import { chatService, type Conversation } from "../api/chat.api";
import { accountSocket } from "../../../infrastructure/websocket/account-socket";
import type { ChatMessagePayload } from "../../../shared/types";
import { themedAlert } from "../../../design-system/components/ThemedAlert";
import StateBlock from "../../../shell/components/StateBlock";
import MainHeader from "../../../shell/components/MainHeader";
import { fontSizes, spacing, radii } from "../../../design-system";
import { warn } from "../../../infrastructure/logging/logger";
import { useActiveStatus } from "../../users/state/ActiveStatusProvider";
import { stageScreenParams } from "../../../shared/state/screen-params";

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getLastMessagePreview = (msg: string | null): string => {
  if (!msg) return "Tap to start chatting";
  if (msg === "__post__") return "📎 Shared a post";
  if (msg === "__game_invite__") return "🎮 Game Invite";
  return msg;
};

const ConversationRow = memo(
  ({
    item,
    openChat,
    onDelete,
  }: {
    item: Conversation;
    openChat: (id: string) => void;
    onDelete: (id: string) => void;
  }) => {
    const colors = useThemeColors();
    const activeStatus = useActiveStatus(item.other_user_id);
    const isOnline = activeStatus?.online ?? false;
    const isUnread = item.unread_count > 0;
    const preview = getLastMessagePreview(item.last_message);

    return (
      <TouchableOpacity
        style={[styles.convRow, { backgroundColor: colors.bg.base }]}
        onPress={() => openChat(item.other_user_id)}
        activeOpacity={0.7}
      >
        {/* Unread accent bar */}
        {isUnread && (
          <View
            style={[styles.unreadBar, { backgroundColor: colors.primaryLight }]}
          />
        )}

        {/* Avatar */}
        <View style={styles.avatarWrap}>
          {item.other_user_avatar ? (
            <Image
              source={{ uri: item.other_user_avatar }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.avatar,
                styles.avatarFallback,
                { backgroundColor: colors.bg.elevated },
              ]}
            >
              <Text style={{ fontSize: 24 }}>👾</Text>
            </View>
          )}
          {isOnline && (
            <View
              style={[
                styles.onlineDot,
                { borderColor: colors.bg.base, backgroundColor: "#10B981" },
              ]}
            />
          )}
        </View>

        {/* Content */}
        <View style={styles.convContent}>
          <View style={styles.convNameRow}>
            <Text
              style={[
                styles.convName,
                {
                  color: colors.text.primary,
                  fontWeight: isUnread ? "800" : "600",
                },
              ]}
              numberOfLines={1}
            >
              {item.other_user_name}
            </Text>
          </View>

          <Text
            style={[styles.convUsername, { color: colors.primaryLight }]}
            numberOfLines={1}
          >
            @{item.other_user_username}
          </Text>

          <View style={styles.convPreviewRow}>
            <Text
              style={[
                styles.convPreview,
                {
                  color: isUnread ? colors.text.primary : colors.text.muted,
                  fontWeight: isUnread ? "500" : "400",
                },
              ]}
              numberOfLines={1}
            >
              {preview}
            </Text>
            {isUnread && (
              <View
                style={[
                  styles.unreadBadge,
                  { backgroundColor: colors.primaryLight },
                ]}
              >
                <Text style={styles.unreadText}>
                  {item.unread_count > 99 ? "99+" : item.unread_count}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Right side: time + 3-dot options button */}
        <View style={styles.convRight}>
          <Text
            style={[
              styles.convTime,
              {
                color: isUnread ? colors.primaryLight : colors.text.muted,
                fontWeight: isUnread ? "600" : "400",
              },
            ]}
          >
            {formatTime(item.last_message_at)}
          </Text>
          <TouchableOpacity
            style={{ padding: 6 }}
            onPress={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={18}
              color={colors.text.muted}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  },
);

export default function ChatInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const { user, isLoggedIn } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Load inbox once on mount — no re-fetch on every focus.
  // The socket keeps the list live after that.
  const fetchInbox = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const res = await chatService.getInbox(1, 30);
      setConversations(res.conversations || []);
    } catch (e) {
      warn("Failed to load inbox", e);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  useFocusEffect(
    useCallback(() => {
      notificationBus.emit("chatScreenOpen");
      return () => {
        notificationBus.emit("chatScreenClose");
      };
    }, []),
  );

  // Socket-driven updates — update the conversation in-place when a new
  // message arrives. Bump unread_count only if this isn't the active chat
  // (the ChatScreen marks messages as read and resets unread via its own
  // socket listener). No API call needed.
  useEffect(() => {
    if (!isLoggedIn) return;
    const handleNewMessage = (data: ChatMessagePayload) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === data.conversationId);
        if (idx === -1) {
          // Unknown conversation — do a one-time fetch to get it.
          fetchInbox();
          return prev;
        }
        const updated = [...prev];
        const conv = { ...updated[idx] };
        conv.last_message =
          data.messageType === 'post'
            ? '__post__'
            : data.messageType === 'game_invite'
              ? '__game_invite__'
              : data.content;
        conv.last_message_at = data.createdAt;
        conv.updated_at = data.createdAt;
        // Only bump unread if the sender is not the current user.
        if (data.senderId !== user?.id) {
          conv.unread_count = (conv.unread_count || 0) + 1;
        }
        updated[idx] = conv;
        // Bubble the updated conversation to the top.
        updated.splice(idx, 1);
        updated.unshift(conv);
        return updated;
      });
    };
    accountSocket.events.on('chat:message', handleNewMessage);
    return () => {
      accountSocket.events.off('chat:message', handleNewMessage);
    };
  }, [isLoggedIn, user?.id, fetchInbox]);

  const openChat = useCallback(
    async (otherUserId: string) => {
      try {
        const convId = await chatService.getOrCreateConversation(otherUserId);
        const conv = conversations.find((c) => c.other_user_id === otherUserId);
        stageScreenParams("chat", {
          otherUserId,
          otherUser: conv
            ? {
                id: conv.other_user_id,
                name: conv.other_user_name,
                username: conv.other_user_username,
                avatarUrl: conv.other_user_avatar,
                handle: conv.other_user_username,
              }
            : undefined,
        });
        router.push(`/chat/${convId}`);
      } catch (e: any) {
        themedAlert(
          "Cannot Message",
          e?.response?.data?.message ||
            "You can only message mutual followers.",
        );
      }
    },
    [router, conversations],
  );

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      themedAlert(
        "Delete Conversation",
        "Are you sure you want to delete this conversation?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await chatService.deleteConversation(conversationId);
                setConversations((prev) =>
                  prev.filter((c) => c.id !== conversationId),
                );
              } catch (e: any) {
                themedAlert(
                  "Error",
                  e?.response?.data?.message ||
                    "Failed to delete conversation.",
                );
              }
            },
          },
        ],
      );
    },
    [],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <MainHeader showBack />

      <View style={{ flex: 1, paddingTop: insets.top + 64 }}>
        {/* Heading row — title left, today's date right */}
        <View style={styles.headingRow}>
          <Text style={[styles.headingTitle, { color: colors.text.primary }]}>
            Messages
          </Text>
          <Text style={[styles.headingDate, { color: colors.text.muted }]}>
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </Text>
        </View>
        <Text style={[styles.headingSubtitle, { color: colors.text.muted }]}>
          Chat with mutuals & communities
        </Text>

        {loading ? (
          <StateBlock
            inline
            loading
            loaderSize={32}
            style={{ flex: 1, justifyContent: "center" }}
          />
        ) : conversations.length === 0 ? (
          <View style={styles.empty}>
            <View
              style={[
                styles.emptyIconWrap,
                { backgroundColor: colors.bg.elevated },
              ]}
            >
              <Ionicons
                name="chatbubbles-outline"
                size={42}
                color={colors.primaryLight}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
              Your Inbox is Empty
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.text.muted }]}>
              Search for your mutual followers to start chatting, sharing posts,
              and sending game invites!
            </Text>
          </View>
        ) : (
          <FlashList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ConversationRow
                item={item}
                openChat={openChat}
                onDelete={handleDeleteConversation}
              />
            )}
            keyboardDismissMode="on-drag"
            contentContainerStyle={{
              paddingBottom: insets.bottom + 100,
              paddingTop: 4,
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: 2,
  },
  headingTitle: { fontSize: fontSizes.xxl, fontWeight: "800" },
  headingDate: { fontSize: fontSizes.sm, fontWeight: "500" },
  headingSubtitle: {
    fontSize: fontSizes.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  // Conversation row
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginHorizontal: spacing.sm,
    marginBottom: 2,
    borderRadius: radii.lg,
    gap: 12,
  },
  unreadBar: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderRadius: 2,
  },
  avatarWrap: { position: "relative" },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
  },
  convContent: { flex: 1 },
  convNameRow: { marginBottom: 2 },
  convName: { fontSize: fontSizes.md },
  convTime: { fontSize: fontSizes.xs },
  convUsername: { fontSize: fontSizes.xs, fontWeight: "500", marginBottom: 3 },
  convPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  convPreview: { fontSize: fontSizes.sm, flex: 1 },
  convRight: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    gap: 4,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  deleteActionBtn: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    width: 76,
    marginVertical: 1,
    marginRight: spacing.sm,
    borderRadius: radii.lg,
    gap: 3,
  },
  deleteActionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  // Empty state
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 48,
    paddingBottom: 80,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: fontSizes.sm,
    textAlign: "center",
    lineHeight: 22,
  },
});
