/**
 * SwitchAccountSection.tsx
 *
 * Instagram-style account switcher: a horizontal row of circular avatars
 * for each logged-in account on this device, with a checkmark on the active
 * one and a "+" button at the end to add another account.
 *
 * Used in:
 *   - SideDrawer (sidebar)
 *   - WelcomeScreen / LoginScreen (auth screens, like Instagram)
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { radii, fontSizes, spacing } from "../../theme";
import type { AccountProfile } from "../../utils/accountStore";

interface Props {
  /** Called when user taps the "+" to add a new account. */
  onAddAccount?: () => void;
  /** If true, show a compact row suitable for auth screens. */
  compact?: boolean;
  /** Called after an account switch completes (to close drawer, etc). */
  onSwitchDone?: () => void;
}

export default function SwitchAccountSection({
  onAddAccount,
  compact = false,
  onSwitchDone,
}: Props) {
  const colors = useThemeColors();
  const { user, accounts, switchAccount, removeAccountFromDevice } = useAuth();

  const activeUserId = user?.id;
  const hasOtherAccounts = accounts.length > 1;

  if (accounts.length === 0 && !activeUserId) return null;

  const handleSwitch = async (userId: number | string) => {
    if (String(userId) === String(activeUserId)) return;
    await switchAccount(userId);
    onSwitchDone?.();
  };

  const handleRemove = (userId: number | string) => {
    removeAccountFromDevice(userId);
  };

  return (
    <View style={compact ? styles.compactWrap : styles.wrap}>

      <View style={styles.row}>
        {accounts.map((account) => {
          const isActive = String(account.userId) === String(activeUserId);
          return (
            <TouchableOpacity
              key={String(account.userId)}
              style={styles.avatarWrap}
              onPress={() => handleSwitch(account.userId)}
              onLongPress={() => {
                if (isActive && !hasOtherAccounts) return; // Don't remove the only active account this way
                Alert.alert(
                  "Remove Account",
                  `Are you sure you want to remove @${account.username} from this device?`,
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: () => handleRemove(account.userId) }
                  ]
                );
              }}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.avatarRing,
                  isActive && { borderColor: colors.primaryLight, borderWidth: 2.5 },
                ]}
              >
                {account.avatarUrl ? (
                  <Image
                    source={{ uri: account.avatarUrl }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatarFallback,
                      { backgroundColor: colors.bg.card },
                    ]}
                  >
                    <Text style={[styles.avatarInitial, { color: colors.text.primary }]}>
                      {(account.name || "U").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              {isActive && (
                <View style={[styles.checkBadge, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
              {!compact && (
                <Text
                  numberOfLines={1}
                  style={[styles.accountName, { color: colors.text.secondary }]}
                >
                  {account.username}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const AVATAR_SIZE = 48;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  compactWrap: {
    paddingVertical: 4,
  },
  sectionLabel: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  avatarWrap: {
    alignItems: "center",
    width: AVATAR_SIZE + 8,
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: AVATAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: fontSizes.md,
    fontWeight: "700",
  },
  addAvatar: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
  },
  checkBadge: {
    position: "absolute",
    bottom: 8,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  accountName: {
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
    maxWidth: AVATAR_SIZE + 8,
  },
  removeBtn: {
    position: "absolute",
    top: -2,
    right: -2,
    borderRadius: 10,
  },
});
