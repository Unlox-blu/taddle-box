import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Image,
} from "react-native";
import { MentionInput } from "react-native-controlled-mentions";
import { colors, fontSizes, radii, spacing } from "../../theme";
import { hashtagService } from "../../services/hashtag.service";
import { userService } from "../../services/user.service";

interface SmartInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  multiline?: boolean;
  style?: any;
  onFocus?: () => void;
  onBlur?: () => void;
  maxLength?: number;
  textAlignVertical?: "auto" | "top" | "bottom" | "center";
  containerStyle?: StyleProp<ViewStyle>;
  suggestionPosition?: "top" | "bottom";
  autoFocus?: boolean;
}

const MENTION_AND_HASHTAG_CONFIG = {
  "#": {
    trigger: "#",
    allowedSpacesCount: 0,
    textStyle: { color: colors.primaryLight, fontWeight: "700" as const },
  },
  "@": {
    trigger: "@",
    allowedSpacesCount: 0,
    textStyle: { color: colors.primaryLight, fontWeight: "700" as const },
  },
};

export default function SmartInput({
  value,
  onChange,
  placeholder,
  placeholderTextColor = colors.text.muted,
  multiline = false,
  style,
  onFocus,
  onBlur,
  maxLength,
  textAlignVertical = "top",
  containerStyle,
  suggestionPosition = "bottom",
  autoFocus,
}: SmartInputProps) {
  const [triggers, setTriggers] = useState<any>();
  const [dynamicTags, setDynamicTags] = useState<string[]>([]);
  const [dynamicUsers, setDynamicUsers] = useState<any[]>([]);

  const activeTrigger = useMemo(() => {
    if (triggers?.["#"]?.keyword != null) return "#";
    if (triggers?.["@"]?.keyword != null) return "@";
    return null;
  }, [triggers]);

  const activeHashtagQuery = useMemo(() => {
    let keyword = triggers?.["#"]?.keyword || "";
    return keyword.toLowerCase().replace(/[^a-z0-9_]/g, "");
  }, [triggers]);

  const activeMentionQuery = useMemo(() => {
    let keyword = triggers?.["@"]?.keyword || "";
    return keyword.toLowerCase();
  }, [triggers]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (activeTrigger === "#") {
        hashtagService
          .getHashtags(activeHashtagQuery)
          .then((res) => {
            if (res?.data) setDynamicTags(res.data);
          })
          .catch((e) => console.error("Failed to fetch hashtags", e));
      } else if (activeTrigger === "@") {
        userService
          .searchUsers(activeMentionQuery)
          .then((res) => {
            if (res?.data) setDynamicUsers(res.data);
          })
          .catch((e) => console.error("Failed to fetch users", e));
      }
    }, 200);

    return () => clearTimeout(handler);
  }, [activeHashtagQuery, activeMentionQuery, activeTrigger]);

  const formatTagsOnSpace = React.useCallback(
    (text: string, currentUsers: any[]) => {
      let fixedText = text.replace(
        /\{#\}\[([^\]]+)\]\([^)]+\)([a-z0-9_]+)/gi,
        (match, name, appended) => `#${name}${appended}`,
      );

      fixedText = fixedText.replace(
        /\{@\}\[([^\]]+)\]\([^)]+\)([a-z0-9_]+)/gi,
        (match, name, appended) => `@${name}${appended}`,
      );

      fixedText = fixedText.replace(
        /(^|\s)#([a-z0-9_]+)(?=\s)/gi,
        (match, prefix, name) => `${prefix}{#}[${name}](${name})`,
      );

      fixedText = fixedText.replace(
        /(^|\s)@([a-z0-9_]+)(?=\s)/gi,
        (match, prefix, username) => {
          const user = currentUsers.find(
            (u) => u.username.toLowerCase() === username.toLowerCase(),
          );
          if (user) {
            return `${prefix}{@}[${user.username}](${user.id})`;
          }
          return match;
        },
      );

      return fixedText;
    },
    [],
  );

  const handleTriggersChange = React.useCallback((newTriggers: any) => {
    setTriggers((prev: any) => {
      // Prevent infinite loop if MentionInput passes a new object reference with same data
      if (JSON.stringify(prev) === JSON.stringify(newTriggers)) {
        return prev;
      }
      return newTriggers;
    });
  }, []);

  const handleChange = (val: string) => {
    onChange(formatTagsOnSpace(val, dynamicUsers));
  };

  const renderSuggestions = () => {
    if (activeTrigger === "@") {
      let keyword = triggers?.["@"]?.keyword;
      let onSelect = triggers?.["@"]?.onSelect;

      if (keyword == null || !onSelect) return null;

      const filteredUsers = dynamicUsers.filter(
        (u) =>
          u.username.toLowerCase().includes(keyword.toLowerCase()) ||
          u.name.toLowerCase().includes(keyword.toLowerCase()),
      );

      if (filteredUsers.length === 0) return null;

      return (
        <View style={[styles.suggestionBox, suggestionPosition === "top" ? styles.suggestionBoxTop : styles.suggestionBoxBottom]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {filteredUsers.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={styles.suggestionRow}
                onPress={() => onSelect!({ id: u.id, name: u.username })}
              >
                <View style={styles.avatarBubble}>
                  {(u.user_avatar || u.avatarUrl) ? (
                    <Image
                      source={{ uri: u.user_avatar || u.avatarUrl }}
                      style={{ width: 24, height: 24, borderRadius: 12 }}
                    />
                  ) : (
                    <Text style={{ fontSize: 12 }}>👾</Text>
                  )}
                </View>
                <Text numberOfLines={1} style={styles.suggestionText}>
                  {u.name}{" "}
                  <Text style={styles.suggestionSubText}>@{u.username}</Text>
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      );
    }

    if (activeTrigger === "#") {
      let keyword = triggers?.["#"]?.keyword;
      let onSelect = triggers?.["#"]?.onSelect;

      if (keyword == null || !onSelect) return null;

      const query = activeHashtagQuery;
      let v3Tags = dynamicTags.filter(
        (tag) => typeof tag === "string" && tag.toLowerCase() !== query,
      );

      if (query.length > 0) {
        v3Tags = [query, ...v3Tags];
      }

      if (v3Tags.length === 0) return null;

      return (
        <View style={[styles.suggestionBox, suggestionPosition === "top" ? styles.suggestionBoxTop : styles.suggestionBoxBottom]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {v3Tags.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={styles.suggestionRow}
                onPress={() => onSelect!({ id: tag, name: tag })}
              >
                <Text style={styles.hashIcon}>#</Text>
                <Text numberOfLines={1} style={styles.suggestionText}>
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      );
    }
    return null;
  };

  // MentionInput always passes `children` (the parsed mention markup) into the
  // native TextInput. On Android a TextInput with children suppresses the native
  // placeholder entirely — so the create-post title/content fields showed no
  // hint text in either theme. We render our own placeholder layer instead:
  // it's shown only while the raw value is empty, styled like the input text,
  // and pointer-transparent so taps always reach the field underneath.
  const showOverlayPlaceholder = !!placeholder && !value;

  return (
    <View style={[styles.container, containerStyle]}>
      {suggestionPosition === "top" && renderSuggestions()}
      {showOverlayPlaceholder && (
        <Text
          pointerEvents="none"
          numberOfLines={multiline ? undefined : 1}
          style={[
            styles.placeholderOverlay,
            style,
            { color: placeholderTextColor },
          ]}
        >
          {placeholder}
        </Text>
      )}
      <MentionInput
        style={style}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        multiline={multiline}
        value={value}
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
        triggersConfig={MENTION_AND_HASHTAG_CONFIG}
        onTriggersChange={handleTriggersChange}
        maxLength={maxLength}
        textAlignVertical={textAlignVertical}
        autoFocus={autoFocus}
      />
      {suggestionPosition === "bottom" && renderSuggestions()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 1,
  },
  placeholderOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  suggestionBox: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 120,
    width: "100%",
    position: "absolute",
    zIndex: 999,
    elevation: 10,
  },
  suggestionBoxBottom: {
    top: "100%",
    marginTop: 4,
  },
  suggestionBoxTop: {
    bottom: "100%",
    marginBottom: 4,
  },
  suggestionRow: {
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  suggestionText: {
    color: colors.text.primary,
    fontSize: fontSizes.sm,
    fontWeight: "500",
    flex: 1,
  },
  suggestionSubText: {
    color: colors.text.muted,
    fontSize: fontSizes.xs,
  },
  hashIcon: {
    color: colors.text.secondary,
    fontSize: 10,
    fontWeight: "bold",
    marginRight: 4,
  },
});
