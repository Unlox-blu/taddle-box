import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Keyboard,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { chatService, type Conversation, type ChatUser } from "../../services/chat.service";
import { accountSocket } from "../../services/accountSocketClient";
import { themedAlert } from "../../components/common/ThemedAlert";
import StateBlock from "../../components/common/StateBlock";
import MainHeader from "../../components/common/MainHeader";
import { fontSizes, spacing, radii } from "../../theme";
import { warn } from '../../utils/logger';

const COMING_SOON_FEATURES = ["Text messaging", "Voice messages", "Video calls", "Photo sharing"];

export default function ChatInboxScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [mutuals, setMutuals] = useState<ChatUser[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    }, [fetchInbox])
  );

  // ── Real-time inbox updates ──
  useEffect(() => {
    const handleNewMessage = () => fetchInbox();
    accountSocket.events.on("chat:message" as any, handleNewMessage);
    return () => { accountSocket.events.off("chat:message" as any, handleNewMessage); };
  }, [fetchInbox]);

  // Debounced mutuals search
  useEffect(() => {
    if (!showSearch) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const users = await chatService.searchMutuals(searchQuery);
        setMutuals(users);
      } catch (e) {
        warn("Failed to search mutuals", e);
      }
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, showSearch]);

  const openChat = useCallback(async (otherUserId: string) => {
    try {
      const convId = await chatService.getOrCreateConversation(otherUserId);
      navigation.navigate("Chat", { conversationId: convId, otherUserId });
      setShowSearch(false);
      setSearchQuery("");
    } catch (e: any) {
      themedAlert("Cannot Message", e?.response?.data?.message || "You can only message mutual followers.");
    }
  }, [navigation]);

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

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={[styles.convRow, { borderBottomColor: colors.border }]}
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
      </View>
      <View style={styles.convInfo}>
        <View style={styles.convTopRow}>
          <Text style={[styles.convName, { color: colors.text.primary }]} numberOfLines={1}>
            {item.other_user_name}
          </Text>
          <Text style={[styles.convTime, { color: colors.text.muted }]}>
            {formatTime(item.last_message_at)}
          </Text>
        </View>
        <View style={styles.convBottomRow}>
          <Text
            style={[styles.convPreview, { color: item.unread_count > 0 ? colors.text.primary : colors.text.muted }]}
            numberOfLines={1}
          >
            {item.last_message || "Tap to start chatting"}
          </Text>
          {item.unread_count > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={styles.unreadText}>{item.unread_count > 99 ? "99+" : item.unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderMutual = ({ item }: { item: ChatUser }) => (
    <TouchableOpacity
      style={[styles.convRow, { borderBottomColor: colors.border }]}
      onPress={() => openChat(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrap}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={{ fontSize: 20 }}>👾</Text>
          </View>
        )}
      </View>
      <View style={styles.convInfo}>
        <Text style={[styles.convName, { color: colors.text.primary }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.convPreview, { color: colors.text.muted }]} numberOfLines={1}>
          @{item.username}
        </Text>
      </View>
      {item.has_conversation && (
        <Ionicons name="chatbubble" size={16} color={colors.primaryLight} />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <MainHeader showBack />

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.bg.elevated, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.text.muted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text.primary }]}
          placeholder="Search mutual taddlers..."
          placeholderTextColor={colors.text.muted}
          value={searchQuery}
          onChangeText={(t) => {
            setSearchQuery(t);
            if (!showSearch && t.length > 0) setShowSearch(true);
          }}
          onFocus={() => setShowSearch(true)}
          returnKeyType="search"
        />
        {showSearch && (
          <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(""); Keyboard.dismiss(); }}>
            <Ionicons name="close-circle" size={18} color={colors.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <StateBlock loading style={{ flex: 1, paddingTop: 80 }} />
      ) : showSearch ? (
        <FlatList
          data={mutuals}
          keyExtractor={(item) => item.id}
          renderItem={renderMutual}
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text.muted }]}>
                {searchQuery.length > 0 ? "No mutual taddlers found" : "Type to search mutual followers"}
              </Text>
            </View>
          }
        />
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={56} color={colors.text.muted} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary, marginTop: spacing.md }]}>
            No messages yet
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.text.muted }]}>
            Search mutual taddlers to start sharing posts and game invites.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.full,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: fontSizes.md },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: { marginRight: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  convInfo: { flex: 1 },
  convTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convName: { fontSize: fontSizes.md, fontWeight: "700", flex: 1 },
  convTime: { fontSize: fontSizes.xs, marginLeft: 8 },
  convBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 3 },
  convPreview: { fontSize: fontSizes.sm, flex: 1 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 48, paddingBottom: 80 },
  emptyTitle: { fontSize: fontSizes.lg, fontWeight: "700", textAlign: "center" },
  emptyDesc: { fontSize: fontSizes.sm, textAlign: "center", marginTop: 8, lineHeight: 20 },
});
