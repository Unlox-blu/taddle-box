import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, 
  StyleSheet,
  RefreshControl,
  Image,
  ImageBackground,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import Button from '../../components/common/Button';
import MainHeader from '../../components/common/MainHeader';
// removed mockData import
import type { Event } from '../../types';
import { useEvents } from '../../queries/events';
import { useToggleEventRegister } from '../../mutations/events';
import { themedAlert } from '../../components/common/ThemedAlert';

const FILTERS = ['All', 'Live', 'Online', 'Offline', 'Contest'];

type TypeMeta = { iconName: string; label: string; gradient: [string,string]; tagColor: string };

function getTypeMeta(c: ColorPalette): Record<string, TypeMeta> {
  return {
    hackathon:   { iconName: 'rocket',        label: 'Hackathon',   gradient: ['rgba(124,58,237,0.3)','rgba(99,38,183,0.2)'],  tagColor: c.primaryLight },
    workshop:    { iconName: 'build',          label: 'Workshop',    gradient: ['rgba(124,58,237,0.2)','rgba(99,38,183,0.12)'], tagColor: c.primaryLight },
    meetup:      { iconName: 'people',         label: 'Meetup',      gradient: ['rgba(16,185,129,0.28)','rgba(5,150,105,0.18)'],tagColor: '#34D399' },
    webinar:     { iconName: 'mic',            label: 'Webinar',     gradient: ['rgba(6,182,212,0.28)','rgba(14,116,144,0.18)'],tagColor: c.cyanLight },
    competition: { iconName: 'trophy',         label: 'Competition', gradient: ['rgba(251,191,36,0.22)','rgba(249,115,22,0.12)'],tagColor: c.xpGold },
  };
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.xl, paddingVertical: 12,
    },
    title: { fontSize: fontSizes.xxl, fontWeight: '800', color: c.text.primary },
    calendarBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    filterScroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: 8 },
    filterChip: {
      paddingVertical: 6, paddingHorizontal: 16,
      borderRadius: radii.full, borderWidth: 1, borderColor: c.borderHover,
    },
    filterChipActive: {
      backgroundColor: 'rgba(124,58,237,0.18)', borderColor: c.primary,
    },
    filterText: { fontSize: fontSizes.sm, color: c.text.secondary, fontWeight: '600' },
    filterTextActive: { color: c.primaryLight },
    featCard: {
      marginHorizontal: spacing.lg, marginBottom: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(124,58,237,0.28)',
      overflow: 'hidden',
    },
    featBanner: {
      height: 148, alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    },
    featBannerEmoji: { fontSize: 60 },
    livePill: {
      position: 'absolute', top: 12, left: 12,
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: 'rgba(239,68,68,0.9)',
      paddingVertical: 3, paddingHorizontal: 10,
      borderRadius: radii.full,
    },
    liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
    livePillText: { fontSize: fontSizes.xs, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
    xpPill: {
      backgroundColor: 'rgba(251,191,36,0.92)',
      paddingVertical: 3, paddingHorizontal: 10,
      borderRadius: radii.full,
    },
    xpPillText: { fontSize: fontSizes.xs, fontWeight: '800', color: '#1A0A00' },
    featTopRight: {
      position: 'absolute', top: 12, right: 12,
      flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    featFeaturedPill: {
      backgroundColor: 'rgba(124,58,237,0.92)',
      paddingVertical: 3, paddingHorizontal: 10,
      borderRadius: radii.full,
    },
    featFeaturedText: { fontSize: fontSizes.xs, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
    featBody: { padding: spacing.lg },
    featType: {
      fontSize: fontSizes.xs, fontWeight: '800',
      color: c.cyanLight, letterSpacing: 0.1,
      marginBottom: 6,
    },
    featTitle: {
      fontSize: fontSizes.xl, fontWeight: '800',
      color: c.text.primary, marginBottom: 12, lineHeight: 24,
    },
    featMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 16 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: fontSizes.xs, color: c.text.muted },
    sectionLabel: {
      fontSize: fontSizes.xs, color: c.text.muted,
      fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.1,
      paddingHorizontal: spacing.xl, marginBottom: 10,
    },
    evCard: {
      marginHorizontal: spacing.lg, marginBottom: 12,
      backgroundColor: c.bg.card,
      borderRadius: radii.xl, borderWidth: 1, borderColor: c.border,
      padding: spacing.md, 
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    },
    evCardInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
    evThumb: {
      width: 56, height: 56, borderRadius: radii.md,
      alignItems: 'center', justifyContent: 'center',
    },
    evEmoji: { fontSize: 26 },
    evInfo: { flex: 1 },
    evTitle: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary, marginBottom: 3 },
    evMeta:  { fontSize: fontSizes.xs, color: c.text.muted, marginBottom: 7 },
    evTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    evTag: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radii.full },
    evTagText: { fontSize: fontSizes.xs, fontWeight: '700' },
    evCtaBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.primary, paddingVertical: 10, borderRadius: radii.md,
    },
    evCtaBtnDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.success },
    evCtaBtnText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },
    evCtaBtnTextDone: { color: c.success },
    emptyState: {
      alignItems: 'center', paddingVertical: 28, gap: 6,
      marginHorizontal: spacing.lg,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg, borderWidth: 1, borderColor: c.border,
    },
    emptyEmoji:   { fontSize: 36 },
    emptyText:    { fontSize: fontSizes.md, fontWeight: '700', color: c.text.primary },
    emptySubtext: { fontSize: fontSizes.sm, color: c.text.muted },
    
    // Calendar Styles
    calendarContainer: {
      backgroundColor: c.bg.surface, marginHorizontal: spacing.lg, marginBottom: 16,
      borderRadius: radii.xl, padding: spacing.md,
      borderWidth: 1, borderColor: c.border,
    },
    calMonthRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 12, marginLeft: 4, marginRight: 4,
    },
    calMonthHeader: { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary },
    calLegend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    calLegendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.primaryLight },
    calLegendText: { fontSize: fontSizes.xs, color: c.text.muted },
    calHeader: { flexDirection: 'row', marginBottom: 4 },
    calWeekDay: { width: '14.28%', textAlign: 'center', fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '700' },
    calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calDay: {
      width: '14.28%', aspectRatio: 1,
      alignItems: 'center', justifyContent: 'center', borderRadius: 20,
    },
    calDayEmpty: { width: '14.28%', aspectRatio: 1 },
    calDayText: { fontSize: fontSizes.sm, color: c.text.primary, fontWeight: '500' },
    calDaySelected: { backgroundColor: c.primary },
    calDayTextSelected: { color: '#fff', fontWeight: '800' },
    calDayTextToday: { color: c.primary, fontWeight: '800' },
    calEventDot: {
      width: 5, height: 5, borderRadius: 3, backgroundColor: c.primaryLight,
      position: 'absolute', bottom: 6, left: '50%', marginLeft: -2.5,
    },
    calEventDotSelected: { backgroundColor: '#fff' },
    dateBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: spacing.lg, marginBottom: 16,
      backgroundColor: 'rgba(124,58,237,0.14)',
      borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
      borderRadius: radii.full,
      paddingVertical: 8, paddingHorizontal: 14,
      alignSelf: 'flex-start',
    },
    dateBarText: { fontSize: fontSizes.sm, fontWeight: '700', color: c.primaryLight },
    dateBarClear: {
      width: 18, height: 18, borderRadius: 9,
      backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
    },
  });
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-08-12" → "12 Aug 2026"
function formatSelDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
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
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const hasEventOnDate = (day: number) => {
    const dStr = getDayStr(day);
    return events.some((e: any) => e.rawDate && e.rawDate.startsWith(dStr));
  };

  const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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
        {WEEKDAYS.map((d, i) => <Text key={i} style={styles.calWeekDay}>{d}</Text>)}
      </View>
      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`e${i}`} style={styles.calDayEmpty} />;
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
                <View style={[styles.calEventDot, isSelected && styles.calEventDotSelected]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default function EventsScreen() {
  const insets  = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const TYPE_META = useMemo(() => getTypeMeta(colors), [colors]);

  const [filter, setFilter] = useState('All');
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: events = [], refetch, isRefetching } = useEvents();
  const { mutate: toggleEventRegister } = useToggleEventRegister();

  // Refresh whenever the tab regains focus so live status, registrations and
  // XP prices stay current without a manual pull-to-refresh.
  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  const displayEvents = events.filter((e: any) => {
    if (selectedDate) {
      if (!e.rawDate || !e.rawDate.startsWith(selectedDate)) return false;
    }
    if (filter === 'All') return true;
    if (filter === 'Live') return e.isLive;
    if (filter === 'Online') return e.location === 'Online';
    if (filter === 'Offline') return e.location !== 'Online';
    if (filter === 'Contest') return e.type === 'hackathon' || e.type === 'competition';
    return true;
  });

  const participated = displayEvents.filter((e: any) => e.isRegistered);
  const featured = displayEvents.find((e: any) => e.isFeatured && !e.isRegistered);
  const rest     = displayEvents.filter((e: any) => !e.isRegistered && !e.isFeatured && e.id !== featured?.id);

  const toggleRegister = async (id: string) => {
    const ev = events.find((e: any) => e.id === id);
    if (!ev) return;
    const isReg = ev.isRegistered;

    // Paid events are paid in XP (never real money) — confirm the XP spend.
    if (!isReg && !ev.isFree && ev.xpPrice) {
      themedAlert(
        'Join with XP',
        `This event costs ${ev.xpPrice.toLocaleString()} XP. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Pay ${ev.xpPrice.toLocaleString()} XP`,
            onPress: () => toggleEventRegister({ eventId: id, isCurrentlyRegistered: false }),
          },
        ]
      );
      return;
    }

    if (isReg) {
      themedAlert(
        'Cancel Registration',
        'Are you sure you want to cancel your registration?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            style: 'destructive',
            onPress: () => toggleEventRegister({ eventId: id, isCurrentlyRegistered: true }),
          },
        ]
      );
    } else {
      toggleEventRegister({ eventId: id, isCurrentlyRegistered: false });
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <MainHeader />

      <View style={styles.header}>
        <Text style={styles.title}>Events 🎯</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Leaderboards', { initialTab: 'Events' })}>
            <Ionicons name="trophy-outline" size={22} color={colors.text.secondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.calendarBtn} onPress={() => setShowCalendar(s => !s)}>
            <Ionicons name={showCalendar ? "close-outline" : "calendar-outline"} size={22} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {showCalendar && (
          <CalendarView 
            selectedDate={selectedDate} 
            onSelectDate={setSelectedDate} 
            events={events} 
            styles={styles} 
          />
        )}

        {/* Active date filter — clearable chip under the calendar */}
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

        {featured && (
          <View style={styles.featCard}>
            {featured.banner ? (
              <ImageBackground
                source={{ uri: featured.banner }}
                style={styles.featBanner}
                imageStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
              >
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.6)']}
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
                      <Text style={styles.xpPillText}>⚡ {featured.xpReward} XP</Text>
                    </View>
                  )}
                </View>
              </ImageBackground>
            ) : (
              <LinearGradient
                colors={['rgba(124,58,237,0.38)', 'rgba(6,182,212,0.28)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
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
                      <Text style={styles.xpPillText}>⚡ {featured.xpReward} XP</Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
            )}

            <View style={styles.featBody}>
              <Text style={styles.featType}>
                {(TYPE_META[featured.type] || TYPE_META['meetup']).label.toUpperCase()} · NATIONAL LEVEL
              </Text>
              <Text style={styles.featTitle}>{featured.title}</Text>
              <View style={styles.featMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={12} color={colors.text.muted} />
                  <Text style={styles.metaText}>{featured.date}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="people-outline" size={12} color={colors.text.muted} />
                  <Text style={styles.metaText}>{featured.registrations.toLocaleString()} registered</Text>
                </View>
                {featured.cashPrize ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="trophy-outline" size={12} color={colors.text.muted} />
                    <Text style={styles.metaText}>₹{(featured.cashPrize / 1000).toFixed(0)}k prize</Text>
                  </View>
                ) : null}
              </View>
              <Button
                label={featured.isRegistered ? '✓ Participated' : (featured.isFree || !featured.xpPrice ? 'Join Free' : `Join • ${featured.xpPrice.toLocaleString()} XP`)}
                onPress={() => toggleRegister(featured.id)}
                variant={featured.isRegistered ? 'ghost' : 'primary'}
                fullWidth
              />
            </View>
          </View>
        )}

        {/* Participated Events First */}
        <Text style={{ ...styles.sectionLabel, marginTop: 8 }}>
          My Participated Events
        </Text>
        {participated.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="ticket-outline" size={40} color={colors.text.muted} />
            <Text style={styles.emptyText}>No participated events yet</Text>
            <Text style={styles.emptySubtext}>Join events below to see them here</Text>
          </View>
        ) : (
          participated.map((ev: any) => (
            <EventCard key={ev.id} event={ev} onRegister={toggleRegister} styles={styles} colors={colors} typeMeta={TYPE_META} />
          ))
        )}

        {/* Upcoming Events Below */}
        {displayEvents.length === 0 && selectedDate ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={40} color={colors.text.muted} />
            <Text style={styles.emptyText}>No events on this date</Text>
            <Text style={styles.emptySubtext}>Try selecting a different day</Text>
          </View>
        ) : (
          <>
            {displayEvents.length > 0 && <Text style={{ ...styles.sectionLabel, marginTop: 16 }}>Upcoming Events</Text>}
            {rest.map((ev: any) => (
            <EventCard key={ev.id} event={ev} onRegister={toggleRegister} styles={styles} colors={colors} typeMeta={TYPE_META} />
          ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

    </View>
  );
}

function EventCard({
  event: e, onRegister, styles, colors, typeMeta,
}: {
  event: Event;
  onRegister: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
  typeMeta: Record<string, TypeMeta>;
}) {
  const meta = typeMeta[e.type] || typeMeta['meetup'];
  return (
    <View style={styles.evCard}>
      <View style={styles.evCardInner}>
        {e.banner ? (
          <Image source={{ uri: e.banner }} style={styles.evThumb} />
        ) : (
          <LinearGradient colors={meta.gradient} style={styles.evThumb}>
            <Ionicons name={meta.iconName as any} size={26} color="rgba(255,255,255,0.85)" />
          </LinearGradient>
        )}
        <View style={styles.evInfo}>
          <Text style={styles.evTitle} numberOfLines={2}>{e.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Ionicons name="calendar-outline" size={12} color={colors.text.muted} />
            <Text style={styles.evMeta}>{e.date}{e.time ? ` · ${e.time}` : ''}</Text>
            <Text style={styles.evMeta}>·</Text>
            <Ionicons name="location-outline" size={12} color={colors.text.muted} />
            <Text style={styles.evMeta}>{e.location}</Text>
          </View>
          <View style={styles.evTags}>
            <View style={[styles.evTag, { backgroundColor: 'rgba(124,58,237,0.18)' }]}>
              <Text style={[styles.evTagText, { color: meta.tagColor }]}>{meta.label}</Text>
            </View>
            {e.xpReward > 0 && (
              <View style={[styles.evTag, { backgroundColor: 'rgba(251,191,36,0.14)' }]}>
                <Text style={[styles.evTagText, { color: colors.xpGold }]}>⚡ {e.xpReward} XP</Text>
              </View>
            )}
            {e.cashPrize ? (
              <View style={[styles.evTag, { backgroundColor: 'rgba(16,185,129,0.14)' }]}>
                <Text style={[styles.evTagText, { color: '#34D399' }]}>₹{(e.cashPrize/1000).toFixed(0)}k</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      
      <TouchableOpacity
        onPress={() => onRegister(e.id)}
        style={[styles.evCtaBtn, e.isRegistered && styles.evCtaBtnDone]}
      >
        <Text style={[styles.evCtaBtnText, e.isRegistered && styles.evCtaBtnTextDone]}>
          {e.isRegistered ? '✓ Participated' : (e.isFree || !e.xpPrice ? 'Join Free' : `Join • ${e.xpPrice.toLocaleString()} XP`)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
