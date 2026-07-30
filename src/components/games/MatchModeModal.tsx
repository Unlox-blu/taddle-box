import React, { useState, useMemo, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../context/ThemeContext";
import { fontSizes, radii, spacing, type ColorPalette } from "../../theme";
import type { HtmlGameDefinition } from "../../games/types";
import { userService } from "../../services/user.service";
import { useAuth } from "../../context/AuthContext";
import type { User } from "../../types";

export type MatchMode = "bot" | "auto" | "manual";

interface MatchModeModalProps {
  visible: boolean;
  game: HtmlGameDefinition | null;
  onClose: () => void;
  onSelectMode: (mode: MatchMode, opponents?: User[]) => void;
}

export default function MatchModeModal({
  visible,
  game,
  onClose,
  onSelectMode,
}: MatchModeModalProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();

  const [mode, setMode] = useState<MatchMode | null>(null);

  // Manual match state
  const [mutualFollowers, setMutualFollowers] = useState<User[]>([]);
  const [loadingMutuals, setLoadingMutuals] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<User[]>([]);

  useEffect(() => {
    if (visible) {
      setMode(null);
      setSelectedFriends([]);
      setSearchQuery("");
      setMutualFollowers([]);
    }
  }, [visible]);

  useEffect(() => {
    if (mode === "manual" && mutualFollowers.length === 0 && (user?.username || user?.handle)) {
      fetchMutualFollowers();
    }
  }, [mode, user?.username, user?.handle]);

  const fetchMutualFollowers = async () => {
    setLoadingMutuals(true);
    try {
      const username = user?.username || user?.handle;
      if (!username) return;
      const [followersRes, followingRes] = await Promise.all([
        userService.getFollowers(username).catch(() => ({ data: [] })),
        userService.getFollowing(username).catch(() => ({ data: [] })),
      ]);
      const followers = followersRes.data || [];
      const following = followingRes.data || [];

      const followingSet = new Set(following.map((f: User) => f.id));
      const mutuals = followers.filter((f: User) => followingSet.has(f.id));

      setMutualFollowers(mutuals);
    } catch (e) {
      console.error("Failed to fetch mutual followers", e);
    } finally {
      setLoadingMutuals(false);
    }
  };

  if (!game) return null;

  const maxOpponents = (game.maxPlayers || 2) - 1;

  const filteredMutuals = mutualFollowers.filter(
    (m) =>
      m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.username || m.handle)?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const toggleFriend = (friend: User) => {
    const isSelected = selectedFriends.some((f) => f.id === friend.id);
    if (isSelected) {
      setSelectedFriends(selectedFriends.filter((f) => f.id !== friend.id));
    } else {
      if (selectedFriends.length < maxOpponents) {
        setSelectedFriends([...selectedFriends, friend]);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.title}>
            {mode === "manual" ? "Invite Friends" : "Select Mode"}
          </Text>
          <View style={styles.closeBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {!mode ? (
            <View style={styles.modeList}>
              <TouchableOpacity
                style={styles.modeCard}
                activeOpacity={0.8}
                onPress={() => onSelectMode("bot")}
              >
                <View
                  style={[
                    styles.modeIconBox,
                    { backgroundColor: "rgba(124,58,237,0.1)" },
                  ]}
                >
                  <Ionicons
                    name="hardware-chip-outline"
                    size={28}
                    color={colors.primaryLight}
                  />
                </View>
                <View style={styles.modeInfo}>
                  <Text style={styles.modeTitle}>Bot Match</Text>
                  <Text style={styles.modeDesc}>
                    Great for warming up. No XP will be Rewarded for this!
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.border}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modeCard}
                activeOpacity={0.8}
                onPress={() => onSelectMode("auto")}
              >
                <View
                  style={[
                    styles.modeIconBox,
                    { backgroundColor: "rgba(6,182,212,0.1)" },
                  ]}
                >
                  <Ionicons
                    name="wifi-outline"
                    size={28}
                    color={colors.cyanLight}
                  />
                </View>
                <View style={styles.modeInfo}>
                  <Text style={styles.modeTitle}>Auto Match</Text>
                  <Text style={styles.modeDesc}>
                    Play against a random taddler
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.border}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modeCard}
                activeOpacity={0.8}
                onPress={() => setMode("manual")}
              >
                <View
                  style={[
                    styles.modeIconBox,
                    { backgroundColor: "rgba(16,185,129,0.1)" },
                  ]}
                >
                  <Ionicons
                    name="people-outline"
                    size={28}
                    color={colors.success}
                  />
                </View>
                <View style={styles.modeInfo}>
                  <Text style={styles.modeTitle}>Manual Match</Text>
                  <Text style={styles.modeDesc}>
                    Invite mutual followers to a private match.
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.border}
                />
              </TouchableOpacity>
            </View>
          ) : mode === "manual" ? (
            <View style={styles.manualContainer}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={20} color={colors.text.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search mutual followers..."
                  placeholderTextColor={colors.text.muted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>

              <View style={styles.slotInfo}>
                <Text style={styles.slotText}>
                  Selected: {selectedFriends.length} / {maxOpponents}
                </Text>
              </View>

              {loadingMutuals ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : mutualFollowers.length === 0 ? (
                <View style={styles.centerBox}>
                  <Ionicons
                    name="people-outline"
                    size={40}
                    color={colors.text.muted}
                    style={{ marginBottom: 12 }}
                  />
                  <Text style={styles.emptyTitle}>No Mutual Followers</Text>
                  <Text style={styles.emptyDesc}>
                    You can only invite friends who follow you back.
                  </Text>
                </View>
              ) : filteredMutuals.length === 0 ? (
                <View style={styles.centerBox}>
                  <Text style={styles.emptyDesc}>No results found.</Text>
                </View>
              ) : (
                <View style={styles.friendList}>
                  {filteredMutuals.map((friend) => {
                    const isSelected = selectedFriends.some(
                      (f) => f.id === friend.id,
                    );
                    return (
                      <TouchableOpacity
                        key={friend.id}
                        style={[
                          styles.friendRow,
                          isSelected && styles.friendRowActive,
                        ]}
                        onPress={() => toggleFriend(friend)}
                        activeOpacity={0.7}
                      >
                        <Image
                          source={
                            friend.avatarUrl || friend.avatar
                              ? { uri: friend.avatarUrl || friend.avatar }
                              : require("../../../assets/icon.png")
                          }
                          style={styles.friendAvatar}
                        />
                        <View style={styles.friendInfo}>
                          <Text style={styles.friendName}>{friend.name}</Text>
                          <Text style={styles.friendHandle}>
                            @{friend.username || friend.handle}
                          </Text>
                        </View>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={24}
                            color={colors.primaryLight}
                          />
                        )}
                        {!isSelected &&
                          selectedFriends.length >= maxOpponents && (
                            <View style={styles.disabledCheck} />
                          )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setMode(null)}
                >
                  <Ionicons
                    name="arrow-back"
                    size={20}
                    color={colors.text.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.startBtn,
                    selectedFriends.length === 0 && styles.startBtnDisabled,
                  ]}
                  onPress={() => onSelectMode("manual", selectedFriends)}
                  disabled={selectedFriends.length === 0}
                >
                  <LinearGradient
                    colors={
                      selectedFriends.length > 0
                        ? [colors.primary, colors.cyanDark]
                        : [colors.bg.elevated, colors.bg.elevated]
                    }
                    style={styles.startGradient}
                  >
                    <Text
                      style={[
                        styles.startText,
                        selectedFriends.length === 0 && {
                          color: colors.text.muted,
                        },
                      ]}
                    >
                      Send Invites & Start
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    closeBtn: { padding: 4, width: 32 },
    title: { fontSize: fontSizes.lg, fontWeight: "700", color: c.text.primary },
    body: { padding: spacing.lg, paddingBottom: 60 },

    modeList: { gap: spacing.md },
    modeCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.bg.card,
      padding: spacing.lg,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    modeIconBox: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.md,
    },
    modeInfo: { flex: 1 },
    modeTitle: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
      marginBottom: 4,
    },
    modeDesc: { fontSize: fontSizes.sm, color: c.text.muted, lineHeight: 20 },

    manualContainer: { flex: 1 },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.bg.elevated,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      height: 44,
      marginBottom: spacing.md,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      color: c.text.primary,
      fontSize: fontSizes.sm,
    },
    slotInfo: { marginBottom: spacing.md, paddingHorizontal: 4 },
    slotText: {
      fontSize: fontSizes.sm,
      color: c.primaryLight,
      fontWeight: "600",
    },

    centerBox: { alignItems: "center", paddingVertical: 40 },
    emptyTitle: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
      marginBottom: 8,
    },
    emptyDesc: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      textAlign: "center",
      paddingHorizontal: 20,
    },

    friendList: { gap: spacing.sm, marginBottom: spacing.xl },
    friendRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    friendRowActive: {
      borderColor: c.primary,
      backgroundColor: "rgba(124,58,237,0.08)",
    },
    friendAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
    friendInfo: { flex: 1 },
    friendName: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
      marginBottom: 2,
    },
    friendHandle: { fontSize: fontSizes.xs, color: c.text.muted },
    disabledCheck: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.border,
    },

    actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    backBtn: {
      width: 50,
      height: 50,
      borderRadius: radii.md,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    startBtn: { flex: 1, borderRadius: radii.md, overflow: "hidden" },
    startBtnDisabled: { opacity: 0.5 },
    startGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
    startText: { fontSize: fontSizes.md, fontWeight: "700", color: "#fff" },
  });
}
