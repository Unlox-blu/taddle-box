import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "../../context/ThemeContext";
import { fontSizes, radii, spacing } from "../../theme";

export type PollData = {
  question: string;
  options: { text: string; votes: number }[];
  totalVotes?: number;
  /** Author closed the poll — voting is disabled and a "Closed" badge shows. */
  closed?: boolean;
  closedAt?: string;
};

const LIVE_COLOR = "#22c55e";
const ENDED_COLOR = "#ef4444";

// "2h ago"-style relative time for the ended badge (mirrors the feed's
// timeAgo helpers). Falls back to "" when the timestamp is missing/unparseable.
const formatClosedAt = (iso?: string): string => {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(1, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

type PollBlockProps = {
  poll: PollData;
  /** Index of the option the current user voted for (null/undefined = not voted). */
  myVote?: number | null;
  /** When provided, options are tappable and taps call this with the index. */
  onVote?: (optionIndex: number) => void;
  /** When provided, LONG-pressing an option opens that option's voters list. */
  onShowVoters?: (optionIndex: number) => void;
  /** When true (e.g. inside a post card), the block blends into the card bg. */
  embedded?: boolean;
  /** When embedded inside a card, inset the block to align with the card's
      body text (which is padded horizontally). The repost preview is already
      inside the padded body, so it leaves this off. */
  inset?: boolean;
};

/**
 * PollStatusPill — the status badge shown next to a poll's question: a
 * breathing green dot + "Poll" when the poll is live, a static red dot +
 * "Poll" once the author closed it. Self-contained (owns its glow
 * animation), so feed cards, post detail, and the search poll rows render
 * an identical pill. Its content is top-anchored to match how text glyphs
 * sit in the question's line box, so it stays straight on the first line
 * even when the question wraps.
 */
export function PollStatusPill({ closed = false }: { closed?: boolean }) {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const glow = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (closed) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        // Never fully 0 — the dot breathes instead of blinking out.
        Animated.timing(glow, {
          toValue: 0.35,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [closed, glow]);

  return (
    <View
      style={[
        styles.statusPill,
        {
          backgroundColor: closed
            ? "rgba(239,68,68,0.10)"
            : "rgba(34,197,94,0.12)",
        },
      ]}
    >
      <Animated.Text
        style={[
          styles.statusPillDot,
          {
            color: closed ? ENDED_COLOR : LIVE_COLOR,
            opacity: closed ? 1 : glow,
          },
        ]}
      >
        {"\u25CF"}
      </Animated.Text>
      <Text
        style={[
          styles.statusPillText,
          { color: closed ? ENDED_COLOR : LIVE_COLOR },
        ]}
      >
        Poll
      </Text>
    </View>
  );
}

/**
 * PollBlock — shared poll UI (question, options, vote bars, tally) used by the
 * home feed cards and post detail. Matches the search-row poll styling. When
 * `onVote` is provided, tapping an option records the vote; the server returns
 * the authoritative tally + the user's selection, which the parent applies.
 */
export default function PollBlock({
  poll,
  myVote,
  onVote,
  onShowVoters,
  embedded = false,
  inset = false,
}: PollBlockProps) {
  const colors = useThemeColors();
  const styles = makeStyles(colors);

  const options = Array.isArray(poll.options) ? poll.options : [];
  const totalVotes =
    Number(poll.totalVotes ?? 0) ||
    options.reduce((sum, o) => sum + (Number(o.votes) || 0), 0);
  const closed = !!poll.closed;
  const closedRel = closed ? formatClosedAt(poll.closedAt) : "";
  // Once closed the author's taps still re-render, but voting is off.
  const interactive = !!onVote && !closed;

  return (
    <View
      style={[
        styles.card,
        embedded && styles.cardEmbedded,
        inset && styles.cardInset,
      ]}
    >
      <View style={{ alignSelf: "flex-start", marginBottom: 8 }}>
        <PollStatusPill closed={closed} />
      </View>
      <Text style={styles.question}>
        {poll.question || "Poll"}
      </Text>

      {options.map((o, i) => {
        const votes = Number(o.votes) || 0;
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const isMine = myVote != null && Number(myVote) === i;

        const optionBody = (
          <View style={[styles.option, isMine && styles.optionMine]}>
            <View style={styles.optionTextRow}>
              {isMine && (
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={colors.primaryLight}
                  style={{ marginRight: 6 }}
                />
              )}
              <Text style={styles.optionText} numberOfLines={2}>
                {o.text || `Option ${i + 1}`}
              </Text>
              <Text style={styles.optionPct}>
                {pct}%{totalVotes > 0 ? ` · ${votes}` : ""}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  isMine && styles.barFillMine,
                  { width: `${pct}%` },
                ]}
              />
            </View>
          </View>
        );

        // Long-pressing an option shows who voted for it (like the likers
        // list). Works whether or not voting is interactive — closed polls
        // and display-only embeds can still reveal their voters.
        return onShowVoters ? (
          <TouchableOpacity
            key={i}
            onPress={interactive ? () => onVote(i) : undefined}
            onLongPress={() => onShowVoters(i)}
            delayLongPress={350}
            activeOpacity={0.7}
            style={styles.optionTouch}
          >
            {optionBody}
          </TouchableOpacity>
        ) : interactive ? (
          <TouchableOpacity
            key={i}
            onPress={() => onVote(i)}
            activeOpacity={0.7}
            style={styles.optionTouch}
          >
            {optionBody}
          </TouchableOpacity>
        ) : (
          <View key={i}>{optionBody}</View>
        );
      })}

      <Text style={styles.footer}>
        {totalVotes} vote{totalVotes === 1 ? "" : "s"}
        {myVote != null
          ? ` · You voted${interactive ? " — tap again to undo" : ""}`
          : ""}
        {interactive && myVote == null ? " · Tap to vote" : ""}
        {onShowVoters ? " · Long-press an option for voters" : ""}
        {closed ? ` · Voting closed${closedRel ? ` · ${closedRel}` : ""}` : ""}
      </Text>
    </View>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.bg.card,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },

    // Align with the card body's text (padded horizontally). Applied on the
    // main card; the repost preview is already inside that padded body.
    // marginTop gives the poll breathing room from the media above it.
    cardInset: {
      paddingHorizontal: spacing.md,
      paddingTop: 0,
      paddingBottom: spacing.sm,
    },
    // Repost preview: the poll sits directly under the media carousel there
    // too — give it a touch of space.
    cardEmbedded: {
      backgroundColor: "transparent",
      borderWidth: 0,
      marginTop: spacing.sm,
      marginBottom: 0,
      padding: 0,
    },
    questionRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    question: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
      lineHeight: 22,
      marginBottom: 4,
    },
    // RN anchors text glyphs to the top of a lineHeight box (the extra
    // spacing lands below the line), so the question's first line sits up
    // against the top of its 22px line box. The pill hugs its own text and
    // top-anchors it the same way, so the dot + label align with the
    // question's first line without fixed-height/centering math.
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.full,
    },
    statusPillDot: {
      fontSize: 10,
    },
    statusPillText: {
      fontSize: fontSizes.xs,
      fontWeight: "800",
      letterSpacing: 0.3,
    },
    optionTouch: {
      marginTop: 8,
    },
    option: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: "transparent",
      borderRadius: radii.md,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    optionMine: {
      borderColor: c.primaryLight,
      backgroundColor: c.bg.elevated,
    },
    optionTextRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    optionText: {
      flex: 1,
      fontSize: fontSizes.sm,
      color: c.text.primary,
      marginRight: 8,
      lineHeight: 18,
    },
    optionPct: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: c.text.muted,
    },
    barTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.bg.elevated,
      marginTop: 6,
      overflow: "hidden",
    },
    barFill: {
      height: "100%",
      borderRadius: 3,
      backgroundColor: c.primaryLight,
      opacity: 0.45,
    },
    barFillMine: {
      opacity: 1,
    },
    footer: {
      marginTop: spacing.sm,
      fontSize: fontSizes.xs,
      fontWeight: "600",
      color: c.text.muted,
    },
  });
