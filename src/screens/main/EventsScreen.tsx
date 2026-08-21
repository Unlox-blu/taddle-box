import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageBackground,
  FlatList,
  DeviceEventEmitter,
  Dimensions,
} from "react-native";
import { FlashList } from '@shopify/flash-list';
import { useNavigation, useIsFocused, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import PullToRefreshWrapper from "../../components/common/PullToRefreshWrapper";
import StateBlock from "../../components/common/StateBlock";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import Button from "../../components/common/Button";
import MainHeader from "../../components/common/MainHeader";
import { SectionHeader } from "../../components/common/SectionChrome";
// removed mockData import
import type { Event } from "../../types";
import { useEvents } from "../../queries/events";
import { useToggleEventRegister } from "../../mutations/events";
import { themedAlert } from "../../components/common/ThemedAlert";
import EventJoinModal from "../../components/events/EventJoinModal";

const TABS = [
  { label: "All", key: "all" },
  { label: "Joined", key: "joined" },
  { label: "Upcoming", key: "upcoming" },
  { label: "Featured", key: "featured" },
];

type TypeMeta = {
  iconName: string;
  label: string;
  gradient: [string, string];
  tagColor: string;
};

function getTypeMeta(c: ColorPalette): Record<string, TypeMeta> {
  return {
    hackathon: {
      iconName: "rocket",
      label: "Hackathon",
      gradient: ["rgba(124,58,237,0.3)", "rgba(99,38,183,0.2)"],
      tagColor: c.primaryLight,
    },
    workshop: {
      iconName: "build",
      label: "Workshop",
      gradient: ["rgba(124,58,237,0.2)", "rgba(99,38,183,0.12)"],
      tagColor: c.primaryLight,
    },
    meetup: {
      iconName: "people",
      label: "Meetup",
      gradient: ["rgba(16,185,129,0.28)", "rgba(5,150,105,0.18)"],
      tagColor: "#34D399",
    },
    webinar: {
      iconName: "mic",
      label: "Webinar",
      gradient: ["rgba(6,182,212,0.28)", "rgba(14,116,144,0.18)"],
      tagColor: c.cyanLight,
    },
    competition: {
      iconName: "trophy",
      label: "Competition",
      gradient: ["rgba(251,191,36,0.22)", "rgba(249,115,22,0.12)"],
      tagColor: c.xpGold,
    },
  };
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },

    featCard: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: "rgba(124,58,237,0.28)",
      overflow: "hidden",
    },
    featBanner: {
      height: 148,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    featBannerEmoji: { fontSize: 60 },
    livePill: {
      position: "absolute",
      top: 12,
      left: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(239,68,68,0.9)",
      paddingVertical: 3,
      paddingHorizontal: 10,
      borderRadius: radii.full,
    },
    liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
    livePillText: {
      fontSize: fontSizes.xs,
      fontWeight: "800",
      color: "#fff",
      letterSpacing: 0.5,
    },
    xpPill: {
      backgroundColor: "rgba(251,191,36,0.92)",
      paddingVertical: 3,
      paddingHorizontal: 10,
      borderRadius: radii.full,
    },
    xpPillText: { fontSize: fontSizes.xs, fontWeight: "800", color: "#1A0A00" },
    featTopRight: {
      position: "absolute",
      top: 12,
      right: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    featFeaturedPill: {
      backgroundColor: "rgba(124,58,237,0.92)",
      paddingVertical: 3,
      paddingHorizontal: 10,
      borderRadius: radii.full,
    },
    featFeaturedText: {
      fontSize: fontSizes.xs,
      fontWeight: "800",
      color: "#fff",
      letterSpacing: 0.5,
    },
    featBody: { padding: spacing.lg },
    featType: {
      fontSize: fontSizes.xs,
      fontWeight: "800",
      color: c.cyanLight,
      letterSpacing: 0.1,
      marginBottom: 6,
    },
    featTitle: {
      fontSize: fontSizes.xl,
      fontWeight: "800",
      color: c.text.primary,
      marginBottom: 12,
      lineHeight: 24,
    },
    featMeta: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
      marginBottom: 16,
    },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    metaText: { fontSize: fontSizes.xs, color: c.text.muted },
    sectionLabel: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.1,
      paddingHorizontal: spacing.xl,
      marginBottom: 10,
    },
    evCard: {
      marginHorizontal: spacing.lg,
      marginBottom: 12,
      backgroundColor: c.bg.card,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    evCardInner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 12,
    },
    evThumb: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
    },
    evEmoji: { fontSize: 26 },
    evInfo: { flex: 1 },
    evTitle: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: c.text.primary,
      marginBottom: 3,
    },
    evMeta: { fontSize: fontSizes.xs, color: c.text.muted, marginBottom: 7 },
    evTags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    evTag: {
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: radii.full,
    },
    evTagText: { fontSize: fontSizes.xs, fontWeight: "700" },
    evCtaBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
      paddingVertical: 10,
      borderRadius: radii.md,
    },
    evCtaBtnDone: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: c.success,
    },
    evCtaBtnText: { fontSize: fontSizes.sm, fontWeight: "700", color: "#fff" },
    evCtaBtnTextDone: { color: c.success },
    // Calendar Styles
    calendarContainer: {
      backgroundColor: c.bg.surface,
      marginHorizontal: spacing.lg,
      marginBottom: 16,
      borderRadius: radii.xl,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    calMonthRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
      marginLeft: 4,
      marginRight: 4,
    },
    calMonthHeader: {
      fontSize: fontSizes.lg,
      fontWeight: "800",
      color: c.text.primary,
    },
    calLegend: { flexDirection: "row", alignItems: "center", gap: 5 },
    calLegendDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.primaryLight,
    },
    calLegendText: { fontSize: fontSizes.xs, color: c.text.muted },
    calHeader: { flexDirection: "row", marginBottom: 4, justifyContent: "space-between" },
    calWeekDay: {
      width: "14.2%",
      textAlign: "center",
      fontSize: fontSizes.xs,
      color: c.text.muted,
      fontWeight: "700",
    },
    calGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
    calDay: {
      width: "14.2%",
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 20,
    },
    calDayEmpty: { width: "14.2%", aspectRatio: 1 },
    calDayText: {
      fontSize: fontSizes.sm,
      color: c.text.primary,
      fontWeight: "500",
    },
    calDaySelected: { backgroundColor: c.primary },
    calDayTextSelected: { color: "#fff", fontWeight: "800" },
    calDayTextToday: { color: c.primary, fontWeight: "800" },
    calEventDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.primaryLight,
      position: "absolute",
      bottom: 6,
      left: "50%",
      marginLeft: -2.5,
    },
    calEventDotSelected: { backgroundColor: "#fff" },
    dateBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: spacing.lg,
      marginBottom: 16,
      backgroundColor: "rgba(124,58,237,0.14)",
      borderWidth: 1,
      borderColor: "rgba(124,58,237,0.4)",
      borderRadius: radii.full,
      paddingVertical: 8,
      paddingHorizontal: 14,
      alignSelf: "flex-start",
    },
    dateBarText: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: c.primaryLight,
    },
    dateBarClear: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "2026-08-12" → "12 Aug 2026"
function formatSelDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

const CalendarView = ({ selectedDate, onSelectDate, events, styles }: any) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday

  // Plain flex-wrap grid — a nested FlatList (numColumns=7) inside the outer
  // ScrollView triggered the "VirtualizedLists should never be nested" crash
  // and mis-aligned rows. Cells are width 14.28% (100/7) so all 7 columns
  // fit the card exactly.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const getDayStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const hasEventOnDate = (day: number) => {
    const dStr = getDayStr(day);
    return events.some((e: any) => e.rawDate && e.rawDate.startsWith(dStr));
  };

  const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
  const monthName = `${MONTHS[month]} ${year}`;

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calMonthRow}>
        <Text style={styles.calMonthHeader}>{monthName}</Text>
        <View style={styles.calLegend}>
          <View style={styles.calLegendDot} />
          <Text style={styles.calLegendText}>Events</Text>
        </View>
      </View>
      <View style={styles.calHeader}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.calWeekDay}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (day === null)
            return <View key={`e${i}`} style={styles.calDayEmpty} />;
          const dateStr = getDayStr(day);
          const isSelected = selectedDate === dateStr;
          const isToday = day === today.getDate();
          const hasEvent = hasEventOnDate(day);
          return (
            <TouchableOpacity
              key={dateStr}
              style={[styles.calDay, isSelected && styles.calDaySelected]}
              onPress={() => onSelectDate(isSelected ? null : dateStr)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.calDayText,
                  isSelected && styles.calDayTextSelected,
                  isToday && !isSelected && styles.calDayTextToday,
                ]}
              >
                {day}
              </Text>
              {hasEvent && (
                <View
                  style={[
                    styles.calEventDot,
                    isSelected && styles.calEventDotSelected,
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default function EventsScreen() {
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const TYPE_META = useMemo(() => getTypeMeta(colors), [colors]);

  const [activeTab, setActiveTab] = useState("all");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const {
    data: allEventsData,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
  } = useEvents('', null, activeTab);

  const events = useMemo(() => allEventsData?.pages?.flatMap(p => p) || [], [allEventsData]);

  const { mutate: toggleEventRegister } = useToggleEventRegister();

  const [joinModalVisible, setJoinModalVisible] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('openEventMatchmaking', () => {
      setJoinModalVisible(true);
    });
    return () => sub.remove();
  }, []);

  // Scroll offset is saved on every scroll and restored on refocus so
  // re-entering the tab keeps your place (like Communities).
  const eventsListRef = useRef<any>(null);
  const eventsScrollOffsetRef = useRef(0);

  // Refresh whenever the tab regains focus so live status, registrations and
  // XP prices stay current without a manual pull-to-refresh. Debounced: a
  // blur during the 300ms window cancels the pending refetch so rapid tab
  // switching doesn't fire one API call per hop. Restores the scroll offset
  // after the refetch instead of resetting to the top.
  useFocusEffect(
    React.useCallback(() => {
      const t = setTimeout(() => {
        refetch();
        setTimeout(() => {
          eventsListRef.current?.scrollToOffset({
            offset: eventsScrollOffsetRef.current,
            animated: false,
          });
        }, 80);
      }, 300);
      return () => clearTimeout(t);
    }, [refetch]),
  );

  // Tab-bar single-tap → scroll to top; double-tap → scroll to top + refresh
  // the active scope, dropping the pull bubble in like a real pull.
  useEffect(() => {
    const subs = [
      DeviceEventEmitter.addListener('eventsSingleTap', () => {
        eventsListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }),
      DeviceEventEmitter.addListener('eventsDoubleTap', () => {
        eventsListRef.current?.scrollToOffset({ offset: 0, animated: true });
        DeviceEventEmitter.emit('triggerPullRefresh');
        setTimeout(() => refetch(), 500);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [refetch]);

  const displayEvents = events.filter((e: any) => {
    if (selectedDate) {
      if (!e.rawDate || !e.rawDate.startsWith(selectedDate)) return false;
    }
    return true;
  });

  const participated = displayEvents.filter((e: any) => e.isRegistered);
  const featuredList = displayEvents.filter(
    (e: any) => e.isFeatured && !e.isRegistered,
  );

  const featuredScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (isFocused && activeTab === "all" && featuredList.length > 1) {
      let currentIndex = 0;
      const interval = setInterval(() => {
        currentIndex = (currentIndex + 1) % featuredList.length;
        const cardWidth = Dimensions.get('window').width * 0.85;
        const snapInterval = cardWidth + spacing.lg;
        
        featuredScrollRef.current?.scrollTo({
          x: currentIndex * snapInterval,
          animated: true,
        });
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [activeTab, featuredList.length]);

  const featuredIds = new Set(featuredList.map((e: any) => e.id));
  const unregUnfeat = displayEvents.filter(
    (e: any) => !e.isRegistered && !e.isFeatured && !featuredIds.has(e.id),
  );
  const upcomingList = unregUnfeat.slice(0, 3);
  const discoverList = unregUnfeat.slice(3);

  const toggleRegister = async (id: string) => {
    const ev = events.find((e: any) => e.id === id);
    if (!ev) return;
    const isReg = ev.isRegistered;

    // Paid events are paid in XP (never real money) — confirm the XP spend.
    if (!isReg && !ev.isFree && ev.xpPrice) {
      themedAlert(
        "Join with XP",
        `This event costs ${ev.xpPrice.toLocaleString()} XP. Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: `Pay ${ev.xpPrice.toLocaleString()} XP`,
            onPress: () =>
              toggleEventRegister({
                eventId: id,
                isCurrentlyRegistered: false,
              }),
          },
        ],
      );
      return;
    }

    if (isReg) {
      themedAlert(
        "Cancel Registration",
        "Are you sure you want to cancel your registration?",
        [
          { text: "No", style: "cancel" },
          {
            text: "Yes",
            style: "destructive",
            onPress: () =>
              toggleEventRegister({ eventId: id, isCurrentlyRegistered: true }),
          },
        ],
      );
    } else {
      toggleEventRegister({ eventId: id, isCurrentlyRegistered: false });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />
      
      <EventJoinModal 
        visible={joinModalVisible} 
        onClose={() => setJoinModalVisible(false)} 
      />

      <MainHeader />

      <PullToRefreshWrapper 
        refreshing={isRefetching} 
        onRefresh={refetch}
        sectionHeader={
          /* Pinned with the main header — title + top tabs slide away with
              it for a full-screen feed, and ease back in together. Shared
              SectionHeader component. */
          <SectionHeader
            title="Events Zone"
            subtitle="Discover what's happening."
            actions={[
              {
                icon: showCalendar ? "close-outline" : "calendar-outline",
                onPress: () => setShowCalendar((s) => !s),
              },
              {
                icon: "trophy-outline",
                onPress: () =>
                  navigation.navigate("Leaderboards", { initialTab: "Events" }),
              },
            ]}
            pills={TABS.map((t) => ({
              key: t.key,
              label: t.label,
              active: activeTab === t.key,
              onPress: () => setActiveTab(t.key),
            }))}
          />
        }
        sectionHeaderH={144}
      >
        <FlashList
          ref={eventsListRef}
          data={activeTab === "all" ? discoverList : displayEvents}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            eventsScrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>

            {showCalendar && (
              <CalendarView
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                events={events}
                styles={styles}
              />
            )}

            {selectedDate && (
              <View style={styles.dateBar}>
                <Ionicons name="calendar" size={14} color={colors.primaryLight} />
                <Text style={styles.dateBarText}>
                  {formatSelDate(selectedDate)}
                </Text>
                <TouchableOpacity
                  style={styles.dateBarClear}
                  onPress={() => setSelectedDate(null)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="close" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {activeTab === "all" && featuredList.length > 0 && (
              <ScrollView ref={featuredScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 16 }} snapToInterval={Dimensions.get('window').width * 0.85 + spacing.lg} decelerationRate="fast">
                {featuredList.map((featured: any) => (
                  <TouchableOpacity key={featured.id} activeOpacity={0.9} style={[styles.featCard, { width: Dimensions.get('window').width * 0.85, marginHorizontal: 0, marginRight: spacing.lg }]} onPress={() => navigation.navigate("EventDetail", { event: featured })}>
                    {featured.banner ? (
                  <ImageBackground
                    source={{ uri: featured.banner }}
                    style={styles.featBanner}
                    imageStyle={{
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 16,
                    }}
                  >
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.6)"]}
                      style={StyleSheet.absoluteFillObject}
                    />
                    {featured.isLive && (
                      <View style={styles.livePill}>
                        <View style={styles.liveDot} />
                        <Text style={styles.livePillText}>LIVE</Text>
                      </View>
                    )}
                    <View style={styles.featTopRight}>
                      <View style={styles.featFeaturedPill}>
                        <Text style={styles.featFeaturedText}>★ FEATURED</Text>
                      </View>
                      {featured.xpReward > 0 && (
                        <View style={styles.xpPill}>
                          <Text style={styles.xpPillText}>
                            ⚡ {featured.xpReward} XP
                          </Text>
                        </View>
                      )}
                    </View>
                  </ImageBackground>
                ) : (
                  <LinearGradient
                    colors={["rgba(124,58,237,0.38)", "rgba(6,182,212,0.28)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.featBanner}
                  >
                    <Text style={styles.featBannerEmoji}>🚀</Text>
                    {featured.isLive && (
                      <View style={styles.livePill}>
                        <View style={styles.liveDot} />
                        <Text style={styles.livePillText}>LIVE</Text>
                      </View>
                    )}
                    <View style={styles.featTopRight}>
                      <View style={styles.featFeaturedPill}>
                        <Text style={styles.featFeaturedText}>★ FEATURED</Text>
                      </View>
                      {featured.xpReward > 0 && (
                        <View style={styles.xpPill}>
                          <Text style={styles.xpPillText}>
                            ⚡ {featured.xpReward} XP
                          </Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                )}

                <View style={styles.featBody}>
                  <Text style={styles.featType}>
                    {(
                      TYPE_META[featured.type] || TYPE_META["meetup"]
                    ).label.toUpperCase()}{" "}
                    · NATIONAL LEVEL
                  </Text>
                  <Text style={styles.featTitle}>{featured.title}</Text>
                  <View style={styles.featMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons
                        name="calendar-outline"
                        size={12}
                        color={colors.text.muted}
                      />
                      <Text style={styles.metaText}>{featured.date}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons
                        name="people-outline"
                        size={12}
                        color={colors.text.muted}
                      />
                      <Text style={styles.metaText}>
                        {(featured.registrations || 0).toLocaleString()} registered
                      </Text>
                    </View>
                    {featured.cashPrize ? (
                      <View style={styles.metaItem}>
                        <Ionicons
                          name="trophy-outline"
                          size={12}
                          color={colors.text.muted}
                        />
                        <Text style={styles.metaText}>
                          ₹{(featured.cashPrize / 1000).toFixed(0)}k prize
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Button
                    label={
                      featured.isRegistered
                        ? "✓ Participated"
                        : featured.isFree || !featured.xpPrice
                          ? "Join Free"
                          : `Join • ${featured.xpPrice.toLocaleString()} XP`
                    }
                    onPress={() => toggleRegister(featured.id)}
                    variant={featured.isRegistered ? "ghost" : "primary"}
                    fullWidth
                  />
                </View>
              </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {activeTab === "all" && participated.length > 0 && (
              <>
                <Text style={{ ...styles.sectionLabel, marginTop: 8 }}>
                  My Participated Events
                </Text>
                {participated.map((ev: any) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    onRegister={toggleRegister}
                    styles={styles}
                    colors={colors}
                    typeMeta={TYPE_META}
                  />
                ))}
              </>
            )}

            {isPending && events.length === 0 ? (
              <StateBlock card loading style={{ paddingTop: 40 }} />
            ) : (activeTab === "all" && displayEvents.length === 0 && selectedDate) || (activeTab !== "all" && displayEvents.length === 0) ? (
              <StateBlock
                card
                icon={activeTab === "joined" ? "ticket-outline" : "calendar-outline"}
                title={activeTab === "joined" ? "No participated events yet" : "No events found"}
                subtitle={activeTab === "joined" ? "Join events to see them here" : "Try a different date or filter"}
              />
            ) : null}

            {activeTab === "all" && upcomingList.length > 0 && (
              <>
                <Text style={{ ...styles.sectionLabel, marginTop: 16 }}>
                  Upcoming Events
                </Text>
                {upcomingList.map((ev: any) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    onRegister={toggleRegister}
                    styles={styles}
                    colors={colors}
                    typeMeta={TYPE_META}
                  />
                ))}
              </>
            )}

            {activeTab === "all" && discoverList.length > 0 && (
              <Text style={{ ...styles.sectionLabel, marginTop: 16 }}>
                Discover Events
              </Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onRegister={toggleRegister}
            styles={styles}
            colors={colors}
            typeMeta={TYPE_META}
          />
        )}
        ListFooterComponent={
          <View style={{ height: 100, alignItems: 'center', justifyContent: 'center' }}>
            {isFetchingNextPage && <StateBlock inline loading loaderSize={18} />}
          </View>
        }
      />
      </PullToRefreshWrapper>
    </View>
  );
}

const EventCard = React.memo(function EventCard({
  event: e,
  onRegister,
  styles,
  colors,
  typeMeta,
}: {
  event: Event;
  onRegister: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
  typeMeta: Record<string, TypeMeta>;
}) {
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const meta = typeMeta[e.type] || typeMeta["meetup"];
  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.evCard} onPress={() => navigation.navigate("EventDetail", { event: e })}>
      <View style={styles.evCardInner}>
        {e.banner ? (
          <Image source={{ uri: e.banner }} style={styles.evThumb} />
        ) : (
          <LinearGradient colors={meta.gradient} style={styles.evThumb}>
            <Ionicons
              name={meta.iconName as any}
              size={26}
              color="rgba(255,255,255,0.85)"
            />
          </LinearGradient>
        )}
        <View style={styles.evInfo}>
          <Text style={styles.evTitle} numberOfLines={2}>
            {e.title}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={12}
              color={colors.text.muted}
            />
            <Text style={styles.evMeta}>
              {e.date}
              {e.time ? ` · ${e.time}` : ""}
            </Text>
            <Text style={styles.evMeta}>·</Text>
            <Ionicons
              name="location-outline"
              size={12}
              color={colors.text.muted}
            />
            <Text style={styles.evMeta}>{e.location}</Text>
          </View>
          <View style={styles.evTags}>
            <View
              style={[
                styles.evTag,
                { backgroundColor: "rgba(124,58,237,0.18)" },
              ]}
            >
              <Text style={[styles.evTagText, { color: meta.tagColor }]}>
                {meta.label}
              </Text>
            </View>
            {e.xpReward > 0 && (
              <View
                style={[
                  styles.evTag,
                  { backgroundColor: "rgba(251,191,36,0.14)" },
                ]}
              >
                <Text style={[styles.evTagText, { color: colors.xpGold }]}>
                  ⚡ {e.xpReward} XP
                </Text>
              </View>
            )}
            {e.cashPrize ? (
              <View
                style={[
                  styles.evTag,
                  { backgroundColor: "rgba(16,185,129,0.14)" },
                ]}
              >
                <Text style={[styles.evTagText, { color: "#34D399" }]}>
                  ₹{(e.cashPrize / 1000).toFixed(0)}k
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => onRegister(e.id)}
        style={[styles.evCtaBtn, e.isRegistered && styles.evCtaBtnDone]}
      >
        <Text
          style={[
            styles.evCtaBtnText,
            e.isRegistered && styles.evCtaBtnTextDone,
          ]}
        >
          {e.isRegistered
            ? "✓ Participated"
            : e.isFree || !e.xpPrice
              ? "Join Free"
              : `Join • ${e.xpPrice.toLocaleString()} XP`}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
})
