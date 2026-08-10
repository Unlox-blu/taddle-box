import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,

  Image,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { StatusBar } from "expo-status-bar";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { userService } from "../../services/user.service";
import { socketClient } from "../../services/socketClient";
import { useAuth } from "../../context/AuthContext";
import { themedAlert } from '../../components/common/ThemedAlert';

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    headerTitle: { flex: 1, textAlign: "center", fontSize: fontSizes.lg, fontWeight: "800", color: c.text.primary },
    headerSpacer: { width: 36 },

    listContent: { padding: spacing.lg, gap: 12 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    userInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
    avatarWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg.elevated,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    avatar: { width: "100%", height: "100%" },
    name: { fontSize: fontSizes.md, fontWeight: "700", color: c.text.primary },
    username: { fontSize: fontSizes.sm, color: c.text.secondary, marginTop: 2 },
    actions: { flexDirection: "row", gap: 8 },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    rejectBtn: { borderColor: "rgba(239,68,68,0.4)", backgroundColor: "rgba(239,68,68,0.08)" },
    approveBtn: { borderWidth: 0, backgroundColor: c.primary },

    empty: { alignItems: "center", marginTop: 120, gap: 12, paddingHorizontal: spacing.xl },
    emptyEmoji: { fontSize: 56 },
    emptyTitle: { fontSize: fontSizes.lg, fontWeight: "800", color: c.text.primary },
    emptySub: { fontSize: fontSizes.sm, color: c.text.muted, textAlign: "center", lineHeight: 20 },
    acceptAllBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: radii.full,
      backgroundColor: "rgba(124,58,237,0.16)",
      borderWidth: 1,
      borderColor: "rgba(124,58,237,0.4)",
      minWidth: 84,
      alignItems: "center",
    },
    acceptAllText: { color: c.primaryLight, fontSize: fontSizes.xs, fontWeight: "800" },
  });
}

export default function FollowRequestsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { refreshUser } = useAuth();

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      const res = await userService.getFollowRequests();
      setRequests(res.data || []);
    } catch (e) {
      console.warn("Failed to load follow requests", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // If a requester cancels while this screen is open, drop their row live so
  // no stale request lingers next to the approve/reject buttons.
  useEffect(() => {
    const onReqCancelled = (data: any) => {
      const followerId = data?.followerId;
      if (!followerId) return;
      setRequests((prev) => prev.filter((r) => r.id !== followerId));
    };
    socketClient.events.on("follow:requestCancelled", onReqCancelled);
    return () => {
      socketClient.events.off("follow:requestCancelled", onReqCancelled);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const handleApprove = async (follower: any) => {
    setBusyId(follower.id);
    try {
      await userService.approveFollowRequest(follower.id);
      setRequests((prev) => prev.filter((r) => r.id !== follower.id));
      refreshUser();
    } catch (e: any) {
      themedAlert("Error", e?.response?.data?.message || "Failed to approve request.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (follower: any) => {
    setBusyId(follower.id);
    try {
      await userService.rejectFollowRequest(follower.id);
      setRequests((prev) => prev.filter((r) => r.id !== follower.id));
      refreshUser();
    } catch (e: any) {
      themedAlert("Error", e?.response?.data?.message || "Failed to reject request.");
    } finally {
      setBusyId(null);
    }
  };

  // Approve every pending request in one tap.
  const [acceptingAll, setAcceptingAll] = useState(false);
  const handleAcceptAll = async () => {
    if (requests.length === 0 || acceptingAll) return;
    themedAlert(
      "Accept all requests?",
      `This will approve ${requests.length} follow request${requests.length === 1 ? "" : "s"} at once.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept All",
          onPress: async () => {
            setAcceptingAll(true);
            try {
              const res = await userService.acceptAllFollowRequests();
              setRequests([]);
              refreshUser();
              themedAlert("Done", res?.message || "All follow requests accepted.");
            } catch (e: any) {
              themedAlert("Error", e?.response?.data?.message || "Failed to accept requests.");
            } finally {
              setAcceptingAll(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Follow Requests</Text>
        {requests.length > 0 ? (
          <TouchableOpacity
            style={styles.acceptAllBtn}
            disabled={acceptingAll}
            onPress={handleAcceptAll}
          >
            {acceptingAll ? (
              <ActivityIndicator size="small" color={colors.primaryLight} />
            ) : (
              <Text style={styles.acceptAllText}>Accept All</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>✅</Text>
              <Text style={styles.emptyTitle}>No pending requests</Text>
              <Text style={styles.emptySub}>
                When someone requests to follow you, you can approve or reject them here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.userInfo}
                onPress={() => navigation.push("UserProfile", { user: item })}
              >
                <View style={styles.avatarWrap}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <Ionicons name="person-outline" size={22} color={colors.text.muted} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name || item.username}
                  </Text>
                  <Text style={styles.username}>@{item.username}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.iconBtn, styles.rejectBtn]}
                  disabled={busyId !== null}
                  onPress={() => handleReject(item)}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Ionicons name="close" size={18} color={colors.danger} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, styles.approveBtn]}
                  disabled={busyId !== null}
                  onPress={() => handleApprove(item)}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
