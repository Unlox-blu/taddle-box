import React, { useState, useCallback, useRef, useEffect, memo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Animated,
  useWindowDimensions,
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
import { warn } from "../../utils/logger";
import { notificationBus } from "../../lib/notificationBus";

const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];

const formatMsgTime = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

// ─── Floating Reaction Picker ─────────────────────────────────────────────────
const ReactionPicker = memo(
  ({
    visible,
    positionY,
    onReact,
    onDismiss,
    colors,
  }: {
    visible: boolean;
    positionY: number;
    onReact: (emoji: string) => void;
    onDismiss: () => void;
    colors: any;
  }) => {
    const { width, height } = useWindowDimensions();
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.spring(anim, {
        toValue: visible ? 1 : 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 280,
      }).start();
    }, [visible]);

    // Always render — use pointerEvents to block touches when hidden
    return (
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={visible ? "auto" : "none"}
      >
        {/* Backdrop to dismiss */}
        {visible && (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onDismiss}
          />
        )}
        <Animated.View
          style={[
            styles.floatingPicker,
            {
              backgroundColor: colors.bg.surface,
              borderColor: colors.border,
              // Center horizontally, position vertically in middle of screen
              top: height / 2 - 30,
              left: width / 2 - 156,
              opacity: anim,
              transform: [{ scale: anim }],
            },
          ]}
          pointerEvents={visible ? "auto" : "none"}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.pickerEmoji}
              onPress={() => onReact(emoji)}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerEmojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </View>
    );
  },
);

// ─── Shared Post Card ─────────────────────────────────────────────────────────
const SharedPostCard = memo(
  ({
    item,
    own,
    colors,
    cardWidth,
    onPress,
  }: {
    item: ChatMessage;
    own: boolean;
    colors: any;
    cardWidth: number;
    onPress: () => void;
  }) => (
    <View
      style={[
        styles.sharedPostCard,
        {
          width: cardWidth,
          backgroundColor: colors.bg.card,
          borderColor: own ? "rgba(124,58,237,0.3)" : colors.border,
          borderLeftColor: own ? colors.primaryLight : colors.primary,
        },
      ]}
    >
      {/* Author name */}
      <View style={styles.sharedPostAuthorRow}>
        <Text style={[styles.sharedPostAuthorName, { color: colors.text.primary }]}>
          {item.shared_post_author_name || "Post"}
        </Text>
      </View>

      {/* Title or content */}
      {item.shared_post_title ? (
        <Text style={[styles.sharedPostTitle, { color: colors.text.primary }]} numberOfLines={2}>
          {item.shared_post_title}
        </Text>
      ) : item.shared_post_content ? (
        <Text style={[styles.sharedPostContent, { color: colors.text.secondary }]} numberOfLines={3}>
          {item.shared_post_content}
        </Text>
      ) : null}

      {/* Media thumbnail */}
      {item.shared_post_media_url && (
        <Image
          source={{ uri: item.shared_post_media_url }}
          style={styles.sharedPostThumb}
          contentFit="cover"
        />
      )}
    </View>
  ),
);

// ─── Game Invite Card ─────────────────────────────────────────────────────────
const GameInviteCard = memo(
  ({
    item,
    own,
    colors,
    cardWidth,
    onPress,
  }: {
    item: ChatMessage;
    own: boolean;
    colors: any;
    cardWidth: number;
    onPress: () => void;
  }) => (
    <View
      style={[
        styles.gameInviteCard,
        {
          width: cardWidth,
          backgroundColor: own
            ? "rgba(124,58,237,0.15)"
            : "rgba(15,10,40,0.85)",
          borderColor: own ? "rgba(124,58,237,0.4)" : "rgba(124,58,237,0.25)",
        },
      ]}
    >
      <View style={styles.gameInviteTop}>
        <View
          style={[
            styles.gameInviteIcon,
            { backgroundColor: "rgba(124,58,237,0.2)" },
          ]}
        >
          <Ionicons name="game-controller" size={22} color="#A78BFA" />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.gameInviteName,
              { color: own ? "#A78BFA" : "#C4B5FD" },
            ]}
          >
            {item.game_name || "Game Invite"}
          </Text>
          <Text
            style={[styles.gameInviteSub, { color: "rgba(196,181,253,0.6)" }]}
          >
            {own ? "You sent an invite" : "You've been invited to play!"}
          </Text>
        </View>
      </View>
      {item.game_invite_code && (
        <View
          style={[
            styles.inviteCodePill,
            { backgroundColor: "rgba(124,58,237,0.15)" },
          ]}
        >
          <Text style={[styles.inviteCodeText, { color: "#A78BFA" }]}>
            Code: {item.game_invite_code}
          </Text>
        </View>
      )}
      {!own && (
        <TouchableOpacity
          style={[styles.joinBtn, { backgroundColor: "#7C3AED" }]}
          onPress={onPress}
          activeOpacity={0.85}
        >
          <Ionicons name="play" size={14} color="#fff" />
          <Text style={styles.joinBtnText}>Join Game</Text>
        </TouchableOpacity>
      )}
      {own && (
        <Text style={[styles.waitingText, { color: "rgba(196,181,253,0.5)" }]}>
          Waiting for response...
        </Text>
      )}
    </View>
  ),
);

// ─── Message Bubble ───────────────────────────────────────────────────────────
const MessageBubble = memo(
  ({
    item,
    own,
    colors,
    cardWidth,
    isLongPressed,
    onLongPress,
    onReact,
    onOpenPost,
    onJoinGame,
  }: {
    item: ChatMessage;
    own: boolean;
    colors: any;
    cardWidth: number;
    isLongPressed: boolean;
    onLongPress: (id: string, y: number) => void;
    onReact: (id: string, emoji: string) => void;
    onOpenPost: (id: string) => void;
    onJoinGame: () => void;
  }) => {
    const reactions = Object.entries(item.reactions || {}).filter(
      ([, users]) => users.length > 0,
    );

    // Support both field names: shared_post_id (enriched) and post_id (raw)
    const postId = item.shared_post_id || item.post_id;
    const isCard =
      item.message_type === "post" || item.message_type === "game_invite";
    const rowYRef = useRef(0);

    const renderContent = () => {
      if (item.message_type === "post") {
        // Show card even if postId is null — display what we have
        return (
          <SharedPostCard
            item={item}
            own={own}
            colors={colors}
            cardWidth={cardWidth}
            onPress={() => postId && onOpenPost(postId)}
          />
        );
      }
      if (item.message_type === "game_invite") {
        return (
          <GameInviteCard
            item={item}
            own={own}
            colors={colors}
            cardWidth={cardWidth}
            onPress={onJoinGame}
          />
        );
      }
      return (
        <Text
          style={[
            styles.msgText,
            { color: own ? "#fff" : colors.text.primary },
          ]}
        >
          {item.content}
        </Text>
      );
    };

    return (
      <View
        style={[styles.msgRow, own ? styles.msgRowOwn : styles.msgRowOther]}
        onLayout={(e) => {
          rowYRef.current = e.nativeEvent.layout.y;
        }}
      >
        <Pressable
          onPress={
            item.message_type === "post" && postId
              ? () => onOpenPost(postId)
              : item.message_type === "game_invite"
                ? onJoinGame
                : undefined
          }
          onLongPress={() => onLongPress(item.id, rowYRef.current)}
          delayLongPress={350}
          style={[
            isCard ? styles.msgBubbleCard : styles.msgBubble,
            own ? styles.bubbleOwn : styles.bubbleOther,
            {
              backgroundColor: isCard
                ? "transparent"
                : own
                  ? colors.primaryLight
                  : colors.bg.elevated,
              opacity: isLongPressed ? 0.85 : 1,
            },
          ]}
        >
          {renderContent()}

          {/* Timestamp + delivery — hide for cards */}
          {!isCard && (
            <View style={styles.msgFooter}>
              <Text
                style={[
                  styles.msgTime,
                  { color: own ? "rgba(255,255,255,0.55)" : colors.text.muted },
                ]}
              >
                {formatMsgTime(item.created_at)}
              </Text>
              {own && (
                <Ionicons
                  name="checkmark-done"
                  size={13}
                  color="rgba(255,255,255,0.55)"
                />
              )}
            </View>
          )}
        </Pressable>

        {/* Reactions below bubble */}
        {reactions.length > 0 && (
          <View
            style={[
              styles.reactionsRow,
              own ? styles.reactionsOwn : styles.reactionsOther,
            ]}
          >
            {reactions.map(([emoji, users]) => (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.reactionPill,
                  {
                    backgroundColor: colors.bg.elevated,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => onReact(item.id, emoji)}
                activeOpacity={0.7}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                <Text
                  style={[styles.reactionCount, { color: colors.text.muted }]}
                >
                  {users.length}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  },
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  // Consistent card width for both post and game invite cards
  const cardWidth = Math.min(Math.round(screenWidth * 0.72), 280);

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

  useEffect(() => {
    notificationBus.emit("chatScreenOpen");
    return () => {
      notificationBus.emit("chatScreenClose");
    };
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  const [pickerY, setPickerY] = useState(0);
  const flatListRef = useRef<any>(null);

  const fetchMessages = useCallback(async () => {
    if (isCommunityChat) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const msgs = await chatService.getMessages(conversationId);
      setMessages(msgs);
      notificationBus.emit("chat_inbox_updated");
    } catch (e) {
      warn("Failed to load messages", e);
    } finally {
      setLoading(false);
    }
  }, [conversationId, isCommunityChat]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: false }),
        100,
      );
    }
  }, [messages.length]);

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

  const handleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      setPickerMsgId(null);
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

  const handleLongPress = useCallback((id: string, y: number) => {
    setPickerMsgId(id);
    setPickerY(y);
  }, []);

  const openPost = useCallback(
    async (postId: string) => {
      try {
        const res = await postsService.getPost(postId);
        const post = res?.data;
        if (post) {
          navigation.navigate("PostDetail", {
            post,
            feedItems: [post],
            isSinglePost: true,
          } as any);
        }
      } catch {
        navigation.navigate("PostDetail", { post: { id: postId } as any });
      }
    },
    [navigation],
  );

  const showComingSoon = useCallback(() => {
    themedAlert(
      "Coming Soon",
      "This feature will be available in further updates!",
    );
  }, []);

  const avatarUrl = otherUser?.avatarUrl || otherUser?.avatar;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg.base }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* ── Header ── */}
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
              navigation.navigate(
                "Main" as never,
                {
                  screen: "Community",
                  params: {
                    screen: "CommunityDetail",
                    params: { communitySlug: conversationId },
                  },
                } as never,
              );
            } else if (otherUser) {
              navigation.navigate("UserProfile", { user: otherUser });
            }
          }}
        >
          {/* Avatar with online dot */}
          <View style={styles.headerAvatarContainer}>
            <View
              style={[
                styles.headerAvatarWrap,
                { backgroundColor: colors.bg.elevated },
              ]}
            >
              {isCommunityChat ? (
                communityAvatar ? (
                  <Image
                    source={{ uri: communityAvatar }}
                    style={styles.headerAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <Ionicons name="people" size={22} color={colors.text.muted} />
                )
              ) : avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.headerAvatar}
                  contentFit="cover"
                />
              ) : (
                <Text style={{ fontSize: 20 }}>👾</Text>
              )}
            </View>
            {!isCommunityChat && activeStatus?.online && (
              <View
                style={[
                  styles.headerOnlineDot,
                  { borderColor: colors.bg.base },
                ]}
              />
            )}
          </View>

          {/* Name + username + status */}
          <View style={styles.headerTextWrap}>
            <Text
              style={[styles.headerTitle, { color: colors.text.primary }]}
              numberOfLines={1}
            >
              {isCommunityChat
                ? communityName || "Community Chat"
                : otherUser?.name || "Chat"}
            </Text>
            <Text
              style={[styles.headerSubtitle, { color: colors.text.secondary }]}
              numberOfLines={1}
            >
              {isCommunityChat
                ? "Community"
                : otherUser?.handle
                  ? `@${otherUser.handle}${statusLabel ? " · " + statusLabel : ""}`
                  : statusLabel || ""}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => {
            const params: any = { source: "messages" };
            if (isCommunityChat && communityName) {
              params.query = communityName;
            } else if (otherUser?.username) {
              params.authorFilter = otherUser.username;
            }
            navigation.navigate("Search", params);
          }}
        >
          <Ionicons
            name="search-outline"
            size={22}
            color={colors.text.secondary}
          />
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

      {/* ── Messages ── */}
      <FlashList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            item={item}
            own={item.sender_id === user?.id}
            colors={colors}
            cardWidth={cardWidth}
            isLongPressed={pickerMsgId === item.id}
            onLongPress={handleLongPress}
            onReact={handleReaction}
            onOpenPost={openPost}
            onJoinGame={() =>
              navigation.navigate(
                "Main" as never,
                {
                  screen: "Games",
                } as never,
              )
            }
          />
        )}
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
                  Taddles will appear here!
                </Text>
              </View>
            )
          ) : (
            <StateBlock
              inline
              loading
              loaderSize={32}
              style={{ marginTop: 100 }}
            />
          )
        }
      />

      {/* ── Floating Reaction Picker ── */}
      <ReactionPicker
        visible={!!pickerMsgId}
        positionY={pickerY}
        onReact={(emoji) => pickerMsgId && handleReaction(pickerMsgId, emoji)}
        onDismiss={() => setPickerMsgId(null)}
        colors={colors}
      />

      {/* ── Bottom Bar ── */}
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
          <Ionicons name="add-circle" size={30} color={colors.primaryLight} />
        </TouchableOpacity>

        <Pressable
          style={[
            styles.textInputWrap,
            {
              backgroundColor: colors.bg.elevated,
              borderColor: colors.border,
            },
          ]}
          onPress={showComingSoon}
        >
          <Text
            style={[styles.textInputPlaceholder, { color: colors.text.muted }]}
          >
            Type a message...
          </Text>
          <TouchableOpacity onPress={showComingSoon}>
            <Ionicons
              name="happy-outline"
              size={22}
              color={colors.text.muted}
            />
          </TouchableOpacity>
        </Pressable>

        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: colors.primary }]}
          onPress={showComingSoon}
        >
          <Ionicons name="mic" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  headerAvatarContainer: { position: "relative" },
  headerAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatar: { width: "100%", height: "100%" },
  headerOnlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#10B981",
    borderWidth: 2,
  },
  headerTextWrap: { flex: 1 },
  headerTitle: { fontSize: fontSizes.md, fontWeight: "800" },
  headerSubtitle: { fontSize: fontSizes.xs, marginTop: 1 },
  headerIconBtn: { padding: 6 },

  // Messages
  messagesList: { padding: spacing.md, paddingBottom: 24 },
  msgRow: { marginBottom: 12 },
  msgRowOwn: { alignItems: "flex-end" },
  msgRowOther: { alignItems: "flex-start" },
  msgBubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 6,
  },
  msgBubbleCard: {
    // No padding — cards have their own internal padding
    // Width is set via cardWidth prop directly on the card
  },
  bubbleOwn: {
    borderRadius: 20,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderRadius: 20,
    borderBottomLeftRadius: 4,
  },
  msgText: { fontSize: fontSizes.md, lineHeight: 22 },
  msgTime: {
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
  },
  msgFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    marginTop: 4,
  },
  deliveryRow: {
    position: "absolute",
    bottom: 6,
    right: 6,
  },

  // Reactions
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  reactionsOwn: { justifyContent: "flex-end" },
  reactionsOther: { justifyContent: "flex-start" },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontWeight: "600" },

  // Floating picker
  floatingPicker: {
    position: "absolute",
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 32,
    borderWidth: 1,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  pickerEmoji: { padding: 6 },
  pickerEmojiText: { fontSize: 26 },

  // Shared post card
  sharedPostCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderLeftWidth: 3,
    overflow: "hidden",
  },
  sharedPostLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sharedPostLabel: { fontSize: 11, fontWeight: "700" },
  sharedPostAuthorRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 2,
  },
  sharedPostAuthorName: { fontSize: 13, fontWeight: "700" },
  sharedPostTitle: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  sharedPostContent: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  sharedPostThumb: { width: "100%", height: 120 },
  sharedPostTap: {
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // Keep old ones for compat
  sharedPostBody: { padding: 12 },
  sharedPostHeader: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  sharedPostAuthor: { fontSize: 12, fontWeight: "600", marginBottom: 4 },

  // Game invite card
  gameInviteCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
    maxWidth: 260,
    gap: 10,
  },
  gameInviteTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  gameInviteIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  gameInviteName: { fontSize: fontSizes.md, fontWeight: "800" },
  gameInviteSub: { fontSize: fontSizes.xs, marginTop: 2 },
  inviteCodePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  inviteCodeText: { fontSize: 12, fontWeight: "700" },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSizes.sm },
  waitingText: { fontSize: 11, textAlign: "center" },

  // Empty
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 120,
    paddingHorizontal: 40,
  },
  emptyChatText: {
    fontSize: fontSizes.sm,
    marginTop: 12,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyChatHint: {
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },

  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  actionBtn: { padding: 6 },
  textInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  textInputPlaceholder: {
    flex: 1,
    fontSize: fontSizes.md,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
