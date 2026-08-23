import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  Share,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../context/ThemeContext";
import { chatService, type ChatUser } from "../../services/chat.service";
import { themedAlert } from "./ThemedAlert";
import * as Clipboard from 'expo-clipboard';
import { fontSizes, spacing, radii } from "../../theme";

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
  postTitle?: string;
  postUrl?: string;
  onOpenChat?: (conversationId: string, otherUserId: string) => void;
}

export default function ShareSheet({
  visible,
  onClose,
  postId,
  postTitle,
  postUrl,
  onOpenChat,
}: ShareSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [mutuals, setMutuals] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!visible) return;
    setSentTo(new Set());
    setSearchQuery("");
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    
    setLoading(true);
    const timeout = setTimeout(() => {
      chatService
        .searchMutuals(searchQuery.trim(), 1, 20)
        .then((users) => setMutuals(users))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timeout);
  }, [visible, searchQuery]);

  const shareNative = useCallback(async () => {
    const url = postUrl || `https://taddlebox.com/post/${postId}`;
    const message = `${postTitle || "Check out this post"}\n\n${url}`;
    try {
      await Share.share({ message, url, title: postTitle || "Share Post" });
    } catch {}
    onClose();
  }, [postId, postTitle, postUrl, onClose]);

  const copyLink = useCallback(async () => {
    const url = postUrl || `https://taddlebox.com/post/${postId}`;
    await Clipboard.setStringAsync(url);
    themedAlert("Copied", "Link copied to clipboard");
    onClose();
  }, [postId, postUrl, onClose]);

  const shareToChat = useCallback(
    async (user: ChatUser) => {
      try {
        const convId = await chatService.getOrCreateConversation(user.id);
        await chatService.sendMessage(convId, { messageType: "post", postId });
        setSentTo((prev) => new Set(prev).add(user.id));
      } catch (e: any) {
        themedAlert("Failed", e?.response?.data?.message || "Could not share to chat.");
      }
    },
    [postId]
  );

  const renderUser = ({ item }: { item: ChatUser }) => {
    const sent = sentTo.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.userRow, { borderBottomColor: colors.border }]}
        onPress={() => shareToChat(item)}
        activeOpacity={0.7}
        disabled={sent}
      >
        <View style={styles.avatarWrap}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }]}>
              <Text>👾</Text>
            </View>
          )}
        </View>
        <Text style={[styles.userName, { color: colors.text.primary }]} numberOfLines={1}>
          {item.name}
        </Text>
        {sent ? (
          <Ionicons name="checkmark-circle" size={22} color="#10B981" />
        ) : (
          <Ionicons name="arrow-forward-circle-outline" size={22} color={colors.text.muted} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* RN Modal content gets no keyboard avoidance on iOS, so the
          bottom-anchored sheet stays put and the keyboard covers the
          mutuals search results. KAV lifts the sheet instead. Android
          resizes the window (softwareKeyboardLayoutMode: resize), so it
          needs no extra behavior — height here would double-shrink. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View
          style={[styles.sheet, { backgroundColor: colors.bg.card, paddingBottom: insets.bottom }]}
          onStartShouldSetResponder={() => true}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.text.muted }]} />

          <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Share to</Text>

          {/* Action buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionCircle, { backgroundColor: colors.bg.elevated }]} onPress={shareNative}>
              <Ionicons name="share-outline" size={22} color={colors.text.primary} />
              <Text style={[styles.actionLabel, { color: colors.text.secondary }]}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionCircle, { backgroundColor: colors.bg.elevated }]} onPress={copyLink}>
              <Ionicons name="link-outline" size={22} color={colors.text.primary} />
              <Text style={[styles.actionLabel, { color: colors.text.secondary }]}>Copy Link</Text>
            </TouchableOpacity>
          </View>

          {/* Mutual followers */}
          <Text style={[styles.sectionTitle, { color: colors.text.muted }]}>Send to</Text>
          
          <View style={[styles.searchContainer, { backgroundColor: colors.bg.elevated, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.text.muted} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text.primary }]}
              placeholder="Search mutuals..."
              placeholderTextColor={colors.text.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <FlatList
            data={mutuals}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            style={styles.userList}
            ListEmptyComponent={
              loading ? null : (
                <Text style={[styles.emptyText, { color: colors.text.muted }]}>No mutual taddlers yet</Text>
              )
            }
          />
        </View>
      </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingTop: 12, maxHeight: "70%" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16, opacity: 0.3 },
  sheetTitle: { fontSize: fontSizes.lg, fontWeight: "800", textAlign: "center", marginBottom: 16 },
  actionsRow: { flexDirection: "row", justifyContent: "center", gap: 24, paddingHorizontal: spacing.lg, marginBottom: 20 },
  actionCircle: { alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radii.lg },
  actionLabel: { fontSize: fontSizes.xs, fontWeight: "600" },
  sectionTitle: { fontSize: fontSizes.xs, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: spacing.lg, marginBottom: 8 },
  userList: { maxHeight: 280 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: { marginRight: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  userName: { flex: 1, fontSize: fontSizes.md, fontWeight: "600" },
  emptyText: { textAlign: "center", paddingVertical: 24, fontSize: fontSizes.sm },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: fontSizes.sm },
});
