import React, { useState, useCallback, useEffect, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { notificationBus } from "../../lib/notificationBus";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { chatService, type Conversation } from "../../services/chat.service";
import { accountSocket } from "../../services/accountSocketClient";
import { themedAlert } from "../../components/common/ThemedAlert";
import StateBlock from "../../components/common/StateBlock";
import MainHeader from "../../components/common/MainHeader";
import { fontSizes, spacing, radii } from "../../theme";
import { warn } from '../../utils/logger';
import { useActiveStatus } from "../../context/ActiveStatusContext";

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

// --- Subcomponents for list items ---

const ConversationRow = memo(({ item, openChat }: { item: Conversation, openChat: (id: string) => void }) => {
  const colors = useThemeColors();
  const activeStatus = useActiveStatus(item.other_user_id);
  const isOnline = activeStatus?.online ?? false;
  const isUnread = item.unread_count > 0;

  return (
    <TouchableOpacity
      style={[
        styles.convRow,
        isUnread && { backgroundColor: colors.bg.elevated }
      ]}
      onPress={() => openChat(item.other_user_id)}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrap}>
        {item.other_user_avatar ? (
          <Image source={{ uri: item.other_user_avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={{ fontSize: 20 }}>👾</Text>
          </View>
        )}
        {isOnline && (
          <View style={[styles.onlineDot, { borderColor: isUnread ? colors.bg.elevated : colors.bg.base }]} />
        )}
      </View>
      <View style={styles.convInfo}>
        <View style={styles.convTopRow}>
          <Text style={[styles.convName, { color: colors.text.primary }]} numberOfLines={1}>
            {item.other_user_name}
          </Text>
          <Text style={[styles.convTime, { color: isUnread ? colors.primaryLight : colors.text.muted, fontWeight: isUnread ? '600' : '400' }]}>
            {formatTime(item.last_message_at)}
          </Text>
        </View>
        <View style={styles.convBottomRow}>
          <Text
            style={[
              styles.convPreview, 
              { 
                color: isUnread ? colors.text.primary : colors.text.muted,
                fontWeight: isUnread ? '600' : '400'
              }
            ]}
            numberOfLines={1}
          >
            {item.last_message || "Tap to start chatting"}
          </Text>
          {isUnread && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={styles.unreadText}>{item.unread_count > 99 ? "99+" : item.unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function ChatInboxScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInbox = useCallback(async () => {
    try {
      const res = await chatService.getInbox(1, 20);
      setConversations(res.conversations || []);
    } catch (e) {
      warn("Failed to load inbox", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchInbox();
      notificationBus.emit('chatScreenOpen');
      return () => { notificationBus.emit('chatScreenClose'); };
    }, [fetchInbox])
  );

  useEffect(() => {
    const handleNewMessage = () => fetchInbox();
    accountSocket.events.on("chat:message" as any, handleNewMessage);
    return () => { accountSocket.events.off("chat:message" as any, handleNewMessage); };
  }, [fetchInbox]);

  const openChat = useCallback(async (otherUserId: string) => {
    try {
      const convId = await chatService.getOrCreateConversation(otherUserId);
      const conv = conversations.find((c) => c.other_user_id === otherUserId);
      navigation.navigate("Chat", {
        conversationId: convId,
        otherUserId,
        otherUser: conv ? {
          id: conv.other_user_id,
          name: conv.other_user_name,
          username: conv.other_user_username,
          avatarUrl: conv.other_user_avatar,
          handle: conv.other_user_username,
        } : undefined,
      });
    } catch (e: any) {
      themedAlert("Cannot Message", e?.response?.data?.message || "You can only message mutual followers.");
    }
  }, [navigation, conversations]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <MainHeader showBack />

      <View style={{ flex: 1, paddingTop: insets.top + 50 }}>
        {/* Heading */}
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
          <Text style={{ fontSize: fontSizes.xxl, fontWeight: '800', color: colors.text.primary }}>Messages</Text>
          <Text style={{ fontSize: fontSizes.sm, color: colors.text.muted, marginTop: 2 }}>Chat with mutuals & communities</Text>
        </View>

        {loading ? (
          <StateBlock inline loading loaderSize={32} style={{ flex: 1, justifyContent: 'center' }} />
        ) : conversations.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.bg.elevated }]}>
              <Ionicons name="chatbubbles" size={42} color={colors.primaryLight} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
              Your Inbox is Empty
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.text.muted }]}>
              Search for your mutual followers to start chatting, sharing posts, and sending game invites!
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlashList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <ConversationRow item={item} openChat={openChat} />}
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 10 }}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginHorizontal: spacing.sm,
    marginBottom: 4,
    borderRadius: radii.lg,
  },
  avatarWrap: { marginRight: 14, position: 'relative' },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2,
  },
  convInfo: { flex: 1 },
  convTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  convName: { fontSize: fontSizes.md, fontWeight: "700", flex: 1 },
  convTime: { fontSize: fontSizes.xs, marginLeft: 8 },
  convBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convPreview: { fontSize: fontSizes.sm, flex: 1 },
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
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 48, paddingBottom: 80 },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: { fontSize: fontSizes.lg, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  emptyDesc: { fontSize: fontSizes.sm, textAlign: "center", lineHeight: 22 },
});
