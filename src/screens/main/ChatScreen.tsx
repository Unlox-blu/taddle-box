import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { fontSizes, spacing, radii } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { chatService, type ChatMessage } from "../../services/chat.service";
import { postsService } from "../../services/posts.service";
import { chatSocketClient } from "../../services/chatSocketClient";
import { themedAlert } from "../../components/common/ThemedAlert";
import StateBlock from "../../components/common/StateBlock";
import {
  useActiveStatus,
  activeStatusLabel,
} from "../../context/ActiveStatusContext";
import { warn } from '../../utils/logger';
import { notificationBus } from '../../lib/notificationBus';

const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];

export default function ChatScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const { user } = useAuth();

  const {
    conversationId,
    otherUserId,
    otherUser,
    isCommunityChat,
    communityName,
    communityAvatar,
  } = route.params || {};

  const activeStatus = useActiveStatus(otherUserId);
  const statusLabel = activeStatusLabel(activeStatus);

  // ── Hide tab bar while inside a chat ──
  useEffect(() => {
    notificationBus.emit('chatScreenOpen');
    return () => { notificationBus.emit('chatScreenClose'); };
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [longPressedMsg, setLongPressedMsg] = useState<string | null>(null);
  const flatListRef = useRef<any>(null);

  const fetchMessages = useCallback(async () => {
    if (isCommunityChat) {
      setMessages([]); // Placeholder for community chat
      setLoading(false);
      return;
    }
    try {
      const msgs = await chatService.getMessages(conversationId);
      setMessages(msgs);
      notificationBus.emit('chat_inbox_updated');
    } catch (e) {
      warn("Failed to load messages", e);
    } finally {
      setLoading(false);
    }
  }, [conversationId, isCommunityChat]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: false }),
        100,
      );
    }
  }, [messages.length]);

  // ── Real-time messages via socket ──
  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (msg.conversationId === conversationId && msg.sender_id !== user?.id) {
        setMessages((prev) => [...prev, msg]);
      }
    };
    const handleReaction = (payload: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, reactions: payload.reactions }
            : m,
        ),
      );
    };
    if (isCommunityChat) return;

    chatSocketClient.connect(conversationId);
    chatSocketClient.events.on("chat:message", handleMessage);
    chatSocketClient.events.on("chat:reaction", handleReaction);

    return () => {
      chatSocketClient.events.off("chat:message", handleMessage);
      chatSocketClient.events.off("chat:reaction", handleReaction);
      chatSocketClient.disconnect();
    };
  }, [conversationId, user?.id, isCommunityChat]);

  const handleSendPost = useCallback(
    async (postId: string) => {
      try {
        const msg = await chatService.sendMessage(conversationId, {
          messageType: "post",
          postId,
        });
        setMessages((prev) => [...prev, msg]);
      } catch (e: any) {
        themedAlert(
          "Failed",
          e?.response?.data?.message || "Could not send post.",
        );
      }
    },
    [conversationId],
  );

  const handleSendGameInvite = useCallback(
    async (gameName: string, inviteCode: string, lobbyId: string) => {
      try {
        const msg = await chatService.sendMessage(conversationId, {
          messageType: "game_invite",
          gameName,
          gameInviteCode: inviteCode,
          gameLobbyId: lobbyId,
        });
        setMessages((prev) => [...prev, msg]);
      } catch (e: any) {
        themedAlert(
          "Failed",
          e?.response?.data?.message || "Could not send invite.",
        );
      }
    },
    [conversationId],
  );

  const handleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      setLongPressedMsg(null);
      try {
        const result = await chatService.toggleReaction(messageId, emoji);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, reactions: result.reactions } : m,
          ),
        );
      } catch (e) {
        warn("Failed to react", e);
      }
    },
    [],
  );

  const openPost = useCallback(
    async (postId: string) => {
      try {
        const res = await postsService.getPost(postId);
        const post = res?.data;
        if (post) {
          navigation.navigate("PostDetail", { post, feedPosts: [post], isSinglePost: true } as any);
        }
      } catch {
        // Fallback — navigate with minimal object
        navigation.navigate("PostDetail", { post: { id: postId } as any });
      }
    },
    [navigation],
  );

  const showComingSoon = useCallback(() => {
    themedAlert(
      "Coming Soon 🚧",
      "Text messaging, voice messages, video calls, and media sharing are coming soon! For now you can share posts and game invites.",
    );
  }, []);

  const isOwn = (msg: ChatMessage) => msg.sender_id === user?.id;

  const renderReactions = (msg: ChatMessage) => {
    const entries = Object.entries(msg.reactions || {}).filter(
      ([, users]) => users.length > 0,
    );
    if (entries.length === 0) return null;
    return (
      <View style={styles.reactionsRow}>
        {entries.map(([emoji, users]) => (
          <TouchableOpacity
            key={emoji}
            style={[
              styles.reactionPill,
              {
                backgroundColor: colors.bg.elevated,
                borderColor: colors.border,
              },
              users.includes(user?.id || "") && {
                backgroundColor: colors.primaryLight + "22",
                borderColor: colors.primaryLight,
              },
            ]}
            onPress={() => handleReaction(msg.id, emoji)}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
            <Text style={[styles.reactionCount, { color: colors.text.muted }]}>
              {users.length}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const own = isOwn(item);

    // ── Post share message ──
    if (item.message_type === "post" && item.shared_post_id) {
      return (
        <Pressable
          style={[
            styles.msgBubble,
            own ? styles.msgOwn : styles.msgOther,
            { backgroundColor: own ? colors.primaryLight : colors.bg.elevated },
          ]}
          onLongPress={() =>
            setLongPressedMsg(longPressedMsg === item.id ? null : item.id)
          }
          delayLongPress={400}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => openPost(item.shared_post_id!)}
          >
            <View
              style={[styles.sharedPostCard, { borderColor: colors.border }]}
            >
              <Text
                style={[styles.sharedPostLabel, { color: colors.text.muted }]}
              >
                📎 Shared Post
              </Text>
              {item.shared_post_author_name && (
                <Text
                  style={[
                    styles.sharedPostAuthor,
                    { color: colors.text.secondary },
                  ]}
                >
                  {item.shared_post_author_name}
                </Text>
              )}
              {item.shared_post_title && (
                <Text
                  style={[
                    styles.sharedPostTitle,
                    { color: colors.text.primary },
                  ]}
                  numberOfLines={2}
                >
                  {item.shared_post_title}
                </Text>
              )}
              {item.shared_post_content && (
                <Text
                  style={[
                    styles.sharedPostContent,
                    { color: colors.text.muted },
                  ]}
                  numberOfLines={2}
                >
                  {item.shared_post_content}
                </Text>
              )}
              {item.shared_post_media_url && (
                <Image
                  source={{ uri: item.shared_post_media_url }}
                  style={styles.sharedPostThumb}
                  contentFit="cover"
                />
              )}
            </View>
          </TouchableOpacity>
          {renderReactions(item)}
        </Pressable>
      );
    }

    // ── Game invite message ──
    if (item.message_type === "game_invite") {
      return (
        <Pressable
          style={[
            styles.msgBubble,
            own ? styles.msgOwn : styles.msgOther,
            { backgroundColor: own ? colors.primaryLight : colors.bg.elevated },
          ]}
          onPress={() => {
            if (item.game_lobby_id) {
              navigation.navigate("Main" as never, { screen: "Games" } as never);
            }
          }}
          onLongPress={() =>
            setLongPressedMsg(longPressedMsg === item.id ? null : item.id)
          }
          delayLongPress={400}
        >
          <View style={styles.gameInviteCard}>
            <Ionicons
              name="game-controller"
              size={20}
              color={colors.primaryLight}
            />
            <Text
              style={[styles.gameInviteTitle, { color: colors.primaryLight }]}
            >
              {item.game_name || "Game Invite"}
            </Text>
            <Text style={[styles.gameInviteSub, { color: colors.text.muted }]}>
              {own ? "You invited to play" : "Tap to join"}
            </Text>
          </View>
          {renderReactions(item)}
        </Pressable>
      );
    }

    // ── Text message (coming soon - show alert) ──
    return (
      <Pressable
        style={[
          styles.msgBubble,
          own ? styles.msgOwn : styles.msgOther,
          { backgroundColor: own ? colors.primaryLight : colors.bg.elevated },
        ]}
        onLongPress={() =>
          setLongPressedMsg(longPressedMsg === item.id ? null : item.id)
        }
        delayLongPress={400}
      >
        <Text
          style={[
            styles.msgText,
            { color: own ? "#fff" : colors.text.primary },
          ]}
        >
          {item.content}
        </Text>
        {renderReactions(item)}
      </Pressable>
    );
  };

  const renderReactionPicker = () => {
    if (!longPressedMsg) return null;
    return (
      <View
        style={[
          styles.reactionPicker,
          { backgroundColor: colors.bg.card, borderColor: colors.border },
        ]}
      >
        {REACTION_EMOJIS.map((emoji) => (
          <TouchableOpacity
            key={emoji}
            style={styles.reactionOption}
            onPress={() => handleReaction(longPressedMsg, emoji)}
          >
            <Text style={styles.reactionOptionEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg.base }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            backgroundColor: colors.bg.base,
            paddingTop: insets.top,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerInfo}
          activeOpacity={0.7}
          onPress={() => {
            if (isCommunityChat) {
              // Chat is at root — navigate through Main tab to Community stack
              navigation.navigate("Main" as never, {
                screen: "Community",
                params: {
                  screen: "CommunityDetail",
                  params: { communitySlug: conversationId },
                },
              } as never);
            } else if (otherUser) {
              navigation.navigate("UserProfile", { user: otherUser });
            }
          }}
        >
          {isCommunityChat ? (
            <>
              <View
                style={[
                  styles.headerAvatarWrap,
                  { backgroundColor: colors.bg.elevated },
                ]}
              >
                {communityAvatar ? (
                  <Image
                    source={{ uri: communityAvatar }}
                    style={styles.headerAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <Ionicons name="people" size={20} color={colors.text.muted} />
                )}
              </View>
              <View style={styles.headerTextWrap}>
                <Text
                  style={[styles.headerTitle, { color: colors.text.primary }]}
                  numberOfLines={1}
                >
                  {communityName || "Community Chat"}
                </Text>
                <Text
                  style={[
                    styles.headerSubtitle,
                    { color: colors.text.secondary },
                  ]}
                  numberOfLines={1}
                >
                  Community
                </Text>
              </View>
            </>
          ) : (
            <>
              <View
                style={[
                  styles.headerAvatarWrap,
                  { backgroundColor: colors.bg.elevated },
                ]}
              >
                {otherUser?.avatarUrl || otherUser?.avatar ? (
                  <Image
                    source={{ uri: otherUser.avatarUrl || otherUser.avatar }}
                    style={styles.headerAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <Ionicons name="person" size={20} color={colors.text.muted} />
                )}
              </View>
              <View style={styles.headerTextWrap}>
                <Text
                  style={[styles.headerTitle, { color: colors.text.primary }]}
                  numberOfLines={1}
                >
                  {otherUser?.name || "Chat"}
                </Text>
                <Text
                  style={[
                    styles.headerSubtitle,
                    { color: colors.text.secondary },
                  ]}
                  numberOfLines={1}
                >
                  {otherUser?.handle ? `@${otherUser.handle}` : ""}
                  {statusLabel && (
                    <Text style={{ color: colors.text.secondary }}>
                      {otherUser?.handle ? " • " : ""}
                      <Text
                        style={{
                          color: activeStatus?.online
                            ? colors.primary
                            : colors.text.muted,
                          fontWeight: activeStatus?.online ? "600" : "normal",
                        }}
                      >
                        {statusLabel}
                      </Text>
                    </Text>
                  )}
                </Text>
              </View>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => {
            const params: any = { source: 'messages' };
            if (isCommunityChat && communityName) {
              params.query = communityName;
            } else if (otherUser?.username) {
              params.authorFilter = otherUser.username;
            } else if (otherUserId) {
              params.authorFilter = otherUserId;
            }
            navigation.navigate('Search', params);
          }}
        >
          <Ionicons name="search-outline" size={22} color={colors.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIconBtn} onPress={showComingSoon}>
          <Ionicons
            name="videocam-outline"
            size={24}
            color={colors.text.primary}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIconBtn} onPress={showComingSoon}>
          <Ionicons name="call-outline" size={22} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlashList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        ListEmptyComponent={
          !loading ? (
            isCommunityChat ? (
              <View style={styles.emptyChat}>
                <Ionicons
                  name="people-outline"
                  size={48}
                  color={colors.text.muted}
                />
                <Text
                  style={[styles.emptyChatText, { color: colors.text.muted }]}
                >
                  Welcome to {communityName || "the community"} Community Chat!
                </Text>
              </View>
            ) : (
              <View style={styles.emptyChat}>
                <Ionicons
                  name="chatbubble-outline"
                  size={48}
                  color={colors.text.muted}
                />
                <Text
                  style={[styles.emptyChatText, { color: colors.text.muted }]}
                >
                  Share posts and game invites to start chatting!
                </Text>
              </View>
            )
          ) : (
            <StateBlock inline loading loaderSize={32} style={{ marginTop: 100 }} />
          )
        }
      />

      {/* Reaction picker overlay */}
      {renderReactionPicker()}

      {/* Bottom bar — only media actions (coming soon) */}
      <View
        style={[
          styles.bottomBar,
          {
            borderTopColor: colors.border,
            backgroundColor: colors.bg.base,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <TouchableOpacity style={styles.actionBtn} onPress={showComingSoon}>
          <Ionicons name="add-circle" size={28} color={colors.text.muted} />
        </TouchableOpacity>

        <View
          style={[
            styles.textInputWrap,
            { backgroundColor: colors.bg.elevated, borderColor: colors.border },
          ]}
        >
          <TextInput
            style={[styles.textInput, { color: colors.text.primary }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.text.muted}
            editable={false}
            onPressIn={showComingSoon}
          />
          <TouchableOpacity onPress={showComingSoon} style={styles.stickerBtn}>
            <Ionicons
              name="happy-outline"
              size={22}
              color={colors.text.muted}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.actionBtn, { marginLeft: 4 }]}
          onPress={showComingSoon}
        >
          <Ionicons name="mic" size={26} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatar: { width: "100%", height: "100%" },
  headerTextWrap: { flex: 1, justifyContent: "center" },
  headerTitle: { fontSize: fontSizes.md, fontWeight: "800" },
  headerSubtitle: { fontSize: fontSizes.xs, marginTop: 1 },
  headerIconBtn: { padding: 6, marginLeft: 2 },
  messagesList: { padding: spacing.md, paddingBottom: 20 },
  msgBubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.lg,
    marginBottom: 8,
  },
  msgOwn: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  msgOther: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  msgText: { fontSize: fontSizes.md, lineHeight: 22 },
  // Shared post
  sharedPostCard: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 10,
    maxWidth: 260,
  },
  sharedPostLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  sharedPostAuthor: { fontSize: 12, fontWeight: "600", marginBottom: 2 },
  sharedPostTitle: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  sharedPostContent: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  sharedPostThumb: {
    width: "100%",
    height: 120,
    borderRadius: radii.sm,
    marginTop: 8,
  },
  // Game invite
  gameInviteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  gameInviteTitle: { fontSize: fontSizes.md, fontWeight: "700" },
  gameInviteSub: { fontSize: fontSizes.xs, width: "100%" },
  // Reactions
  reactionsRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 6,
    flexWrap: "wrap",
  },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontWeight: "600" },
  reactionPicker: {
    flexDirection: "row",
    position: "absolute",
    alignSelf: "center",
    bottom: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
    gap: 8,
    zIndex: 100,
  },
  reactionOption: { padding: 4 },
  reactionOptionEmoji: { fontSize: 24 },
  // Empty
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 120,
  },
  emptyChatText: { fontSize: fontSizes.sm, marginTop: 12, textAlign: "center" },
  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  actionBtn: { padding: 8 },
  textInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  textInput: { flex: 1, fontSize: fontSizes.md, padding: 0 },
  stickerBtn: { padding: 4, marginLeft: 4 },
});
