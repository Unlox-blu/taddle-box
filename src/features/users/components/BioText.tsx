import React from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { useThemeColors } from "../../../design-system/theme/ThemeProvider";
import { userService } from "../api/users.api";
import { safeOpenURL } from "../../../shared/utils/url-allowlist";

export const normalizeUrl = (url: string) => {
  const trimmed = (url || "").trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

type BioTextProps = {
  text: string;
  style?: any;
  colors?: any;
  /** Override URL handling (default: open in the system browser). */
  onLinkPress?: (url: string) => void;
};

/**
 * BioText — renders a bio / description with tappable links, Instagram-style:
 *   • URLs → onLinkPress (defaults to the system browser)
 *   • @username mentions → that user's profile (community slug fallback)
 *   • #hashtags → the hashtag search view
 *   • c/community-slug references → that community
 * Both the composer's structured markup ({@}[name](id) / {c/}[name](id) /
 * {#}[name](name)) and plain @ / # / c/ text are supported, so it renders
 * the same text whether it was typed with SmartInput suggestions or not.
 */
export default function BioText({ text, style, colors, onLinkPress }: BioTextProps) {
  const router = useRouter();
  const theme = useThemeColors();
  const c = colors || theme;

  const parts = (text || "").split(
    /(https?:\/\/[^\s]+|\{@\}\[[^\]]+\]\([^)]+\)|\{c\/\}\[[^\]]+\]\([^)]+\)|\{#\}\[[^\]]+\]\([^)]+\)|@[A-Za-z0-9_]+|c\/[A-Za-z0-9_]+|#[A-Za-z0-9_]+)/g,
  );

  const openMention = async (handle: string) => {
    try {
      await userService.getProfile(handle);
      router.push(`/user/${handle}` as never);
    } catch (e) {
      // Not a user account — treat it as a community slug.
      router.push(`/community/${handle}` as never);
    }
  };

  const openHashtag = (tag: string) => {
    router.push({ pathname: "/search", params: { query: tag, tab: "hashtags" } } as never);
  };

  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("http")) {
          return (
            <Text
              key={i}
              style={{ color: c.primaryLight, fontWeight: "600" }}
              onPress={() => (onLinkPress || safeOpenURL)(normalizeUrl(part))}
            >
              {part}
            </Text>
          );
        }
        if (part.startsWith("{@}")) {
          const match = part.match(/^\{@\}\[([^\]]+)\]\(([^)]+)\)$/);
          const handle = match ? match[1] : part.slice(3);
          return (
            <Text
              key={i}
              style={{ color: c.primaryLight, fontWeight: "700" }}
              onPress={() => openMention(handle)}
            >
              @{handle}
            </Text>
          );
        }
        if (part.startsWith("{c/}")) {
          const match = part.match(/^\{c\/\}\[([^\]]+)\]\(([^)]+)\)$/);
          const slug = match ? match[1] : part.slice(4);
          return (
            <Text
              key={i}
              style={{ color: c.cyanLight, fontWeight: "700" }}
              onPress={() => router.push(`/community/${slug}` as never)}
            >
              c/{slug}
            </Text>
          );
        }
        if (part.startsWith("{#}")) {
          const match = part.match(/^\{#\}\[([^\]]+)\]\(([^)]+)\)$/);
          const tag = match ? match[1] : part.slice(3);
          return (
            <Text
              key={i}
              style={{ color: c.primaryLight, fontWeight: "700" }}
              onPress={() => openHashtag(tag)}
            >
              #{tag}
            </Text>
          );
        }
        if (part.startsWith("@")) {
          const handle = part.slice(1);
          return (
            <Text
              key={i}
              style={{ color: c.primaryLight, fontWeight: "700" }}
              onPress={() => openMention(handle)}
            >
              {part}
            </Text>
          );
        }
        if (part.startsWith("c/")) {
          const slug = part.slice(2);
          return (
            <Text
              key={i}
              style={{ color: c.cyanLight, fontWeight: "700" }}
              onPress={() => router.push(`/community/${slug}` as never)}
            >
              {part}
            </Text>
          );
        }
        if (part.startsWith("#")) {
          const tag = part.slice(1);
          return (
            <Text
              key={i}
              style={{ color: c.primaryLight, fontWeight: "700" }}
              onPress={() => openHashtag(tag)}
            >
              {part}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}
