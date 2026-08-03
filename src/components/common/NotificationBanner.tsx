import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fontSizes, spacing, radii } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import { useNotifications, type InAppBanner } from "../../context/NotificationContext";
import { navigationRef } from "../../navigation/AppNavigator";

// Slide-down banner that appears at the very top of the app whenever a new
// notification arrives in real-time. Tapping it opens the notifications list.
// The last banner is kept mounted while animating out so the exit is smooth.
export default function NotificationBanner() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { banner, hideBanner, clearUnread } = useNotifications();

  // Local copy that survives the exit animation (banner from context goes null
  // the instant the timer fires).
  const [renderedBanner, setRenderedBanner] = useState<InAppBanner>(null);

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (banner) {
      setRenderedBanner(banner);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, speed: 14, bounciness: 8, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (renderedBanner) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -120, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => setRenderedBanner(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banner, translateY, opacity]);

  if (!renderedBanner) return null;

  const openNotifications = () => {
    hideBanner();
    clearUnread();
    if (navigationRef.isReady()) {
      // Notifications lives in the Home stack, nested under the "Home" tab
      // inside the "Main" tab navigator at the root.
      (navigationRef.navigate as any)("Main", {
        screen: "Home",
        params: { screen: "Notifications" },
      });
    }
  };

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 6,
          opacity,
          transform: [{ translateY }],
          backgroundColor: colors.bg.surface,
          borderColor: colors.border,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.inner, { backgroundColor: colors.bg.elevated }]}
        activeOpacity={0.9}
        onPress={openNotifications}
      >
        <View style={[styles.iconBubble, { backgroundColor: "rgba(124,58,237,0.18)" }]}>
          <Ionicons name="notifications" size={18} color={colors.primaryLight} />
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
            {renderedBanner.title}
          </Text>
          <Text style={[styles.body, { color: colors.text.secondary }]} numberOfLines={2}>
            {renderedBanner.body}
          </Text>
        </View>
        <TouchableOpacity onPress={hideBanner} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={18} color={colors.text.muted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: spacing.md,
    paddingBottom: 8,
    borderBottomWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.3)",
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  content: { flex: 1, marginRight: 8 },
  title: { fontSize: fontSizes.sm, fontWeight: "800" },
  body: { fontSize: fontSizes.xs, marginTop: 2, lineHeight: 16 },
});
