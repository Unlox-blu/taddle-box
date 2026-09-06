import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Image,
  Platform,
} from "react-native";
import ControlledMentionsInput from "./ControlledMentionsInput";
import { colors, fontSizes, radii, spacing } from "../../theme";
import { hashtagService } from "../../services/hashtag.service";
import { userService } from "../../services/user.service";
import { communityService } from "../../services/community.service";
import { error } from '../../utils/logger';

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
  "c/": {
    trigger: "c/",
    allowedSpacesCount: 0,
    textStyle: { color: colors.cyanLight, fontWeight: "700" as const },
  },
};

const SmartInput = React.forwardRef<any, SmartInputProps>(function SmartInput(
  {
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
  }: SmartInputProps,
  ref,
) {
  const [triggers, setTriggers] = useState<any>();
  const [dynamicTags, setDynamicTags] = useState<string[]>([]);
  const [dynamicUsers, setDynamicUsers] = useState<any[]>([]);
  const [dynamicCommunities, setDynamicCommunities] = useState<any[]>([]);

  const activeTrigger = useMemo(() => {
    if (triggers?.["#"]?.keyword != null) return "#";
    if (triggers?.["@"]?.keyword != null) return "@";
    if (triggers?.["c/"]?.keyword != null) return "c/";
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

  const activeCommunityQuery = useMemo(() => {
    let keyword = triggers?.["c/"]?.keyword || "";
    return keyword.toLowerCase().replace(/[^a-z0-9_]/g, "");
  }, [triggers]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (activeTrigger === "#") {
        hashtagService
          .getHashtags(activeHashtagQuery)
          .then((res) => {
            if (res?.data) setDynamicTags(res.data);
          })
          .catch((e) => error("Failed to fetch hashtags", e));
      } else if (activeTrigger === "@") {
        userService
          .searchUsers(activeMentionQuery)
          .then((res) => {
            if (res?.data) setDynamicUsers(res.data);
          })
          .catch((e) => error("Failed to fetch users", e));
      } else if (activeTrigger === "c/") {
        communityService
          .getCommunities(1, 10, activeCommunityQuery)
          .then((res) => {
            if (res?.data) setDynamicCommunities(res.data);
          })
          .catch((e) => error("Failed to fetch communities", e));
      }
    }, 200);

    return () => clearTimeout(handler);
  }, [activeHashtagQuery, activeMentionQuery, activeCommunityQuery, activeTrigger]);

  const formatTagsOnSpace = React.useCallback(
    (text: string, currentUsers: any[], currentCommunities: any[]) => {
      let fixedText = text.replace(
        /\{#\}\[([^\]]+)\]\([^)]+\)([a-z0-9_]+)/gi,
        (match, name, appended) => `#${name}${appended}`,
      );

      fixedText = fixedText.replace(
        /\{@\}\[([^\]]+)\]\([^)]+\)([a-z0-9_]+)/gi,
        (match, name, appended) => `@${name}${appended}`,
      );

      fixedText = fixedText.replace(
        /\{c\/\}\[([^\]]+)\]\([^)]+\)([a-z0-9_]+)/gi,
        (match, name, appended) => `c/${name}${appended}`,
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

      fixedText = fixedText.replace(
        /(^|\s)c\/([a-z0-9_]+)(?=\s)/gi,
        (match, prefix, slug) => {
          const community = currentCommunities.find(
            (c) => (c.slug || c.name || "").toLowerCase() === slug.toLowerCase(),
          );
          if (community) {
            const name = community.slug || community.name;
            return `${prefix}{c/}[${name}](${community.id})`;
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

  // ── Android multiline Enter-key safeguard ────────────────────────────────
  // MentionInput renders the native EditText from `children` (the parsed
  // mention markup) with NO `value` prop, so on Android the field is effectively
  // uncontrolled. When such an input re-renders mid-IME-composition, the
  // Enter key's newline can get dropped — pressing Enter then appears to do
  // nothing. The JS diff layer provably preserves newlines, so the loss is
  // native-only. We re-assert the newline idempotently: only when the Enter
  // keypress produced NO change to the raw text at all.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const enterPendingRef = useRef(false);

  const handleKeyPress = (e: any) => {
    if (Platform.OS === "android" && multiline && e?.nativeEvent?.key === "Enter") {
      enterPendingRef.current = true;
      // If the native field swallows Enter so completely that no change event
      // fires at all, re-assert the newline once the dust settles.
      setTimeout(() => {
        if (enterPendingRef.current) {
          enterPendingRef.current = false;
          onChange(valueRef.current + "\n");
        }
      }, 80);
    }
  };

  const handleChange = (val: string) => {
    const formatted = formatTagsOnSpace(val, dynamicUsers, dynamicCommunities);
    let next = formatted;
    if (Platform.OS === "android" && multiline && enterPendingRef.current) {
      enterPendingRef.current = false;
      // Raw text unchanged after an Enter → the IME newline was dropped. Add
      // it back (formatting differences in the fallback timer are self-healed
      // on the next keystroke).
      if (val === valueRef.current) {
        next = formatted + "\n";
      }
    }
    onChange(next);
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

    if (activeTrigger === "c/") {
      let keyword = triggers?.["c/"]?.keyword;
      let onSelect = triggers?.["c/"]?.onSelect;

      if (keyword == null || !onSelect) return null;

      const q = activeCommunityQuery;
      let communities = dynamicCommunities.filter(
        (c: any) =>
          (c.slug || "").toLowerCase() !== q &&
          (c.name || "").toLowerCase() !== q,
      );

      if (communities.length === 0) return null;

      return (
        <View style={[styles.suggestionBox, suggestionPosition === "top" ? styles.suggestionBoxTop : styles.suggestionBoxBottom]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {communities.map((c: any) => {
              const name = c.slug || c.name;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.suggestionRow}
                  onPress={() => onSelect!({ id: c.id, name })}
                >
                  <View style={styles.avatarBubble}>
                    {c.avatarUrl || c.avatar ? (
                      <Image
                        source={{ uri: c.avatarUrl || c.avatar }}
                        style={{ width: 24, height: 24, borderRadius: 12 }}
                      />
                    ) : (
                      <Text style={{ fontSize: 11 }}>🏘️</Text>
                    )}
                  </View>
                  <Text numberOfLines={1} style={styles.suggestionText}>
                    <Text style={{ color: colors.cyanLight, fontWeight: "700" }}>c/</Text>
                    {name}{" "}
                    <Text style={styles.suggestionSubText}>
                      {c.memberCount ? `${c.memberCount} members` : c.privacy || ""}
                    </Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      );
    }
    return null;
  };

  // MentionInput always passes `children` (the parsed mention markup) into the
  // native TextInput. On ANDROID a TextInput whose children render any content
  // suppresses the native placeholder — so the create-post title/content fields
  // showed no hint text in either theme, and a JS <Text> overlay was used
  // instead. That overlay could never match the EditText's metrics (native
  // includeFontPadding + line layout), which is why the placeholder landed a
  // few px off the caret. The native hint, by contrast, is drawn by the
  // platform exactly where typed text/caret go (ReactEditText.setPlaceholder →
  // EditText.hint), so alignment is guaranteed on both platforms.
  //
  // Fix: when the raw value is empty we pass NO children — an empty EditText
  // shows its native hint, perfectly aligned. Once there is text, children
  // render again so @/# tokens keep their highlight.
  return (
    <View style={[styles.container, containerStyle]}>
      {suggestionPosition === "top" && renderSuggestions()}
      <ControlledMentionsInput
        ref={ref}
        style={style}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        multiline={multiline}
        value={value}
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyPress={handleKeyPress}
        triggersConfig={MENTION_AND_HASHTAG_CONFIG}
        onTriggersChange={handleTriggersChange}
        maxLength={maxLength}
        textAlignVertical={textAlignVertical}
        autoFocus={autoFocus}
      />
      {suggestionPosition === "bottom" && renderSuggestions()}
    </View>
  );
});

export default SmartInput;

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 1,
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
