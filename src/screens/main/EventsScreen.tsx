import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList, Modal, Alert, ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import Button from '../../components/common/Button';
import MainHeader from '../../components/common/MainHeader';
// removed mockData import
import { eventService } from '../../services/event.service';
import type { Event } from '../../types';

const FILTERS = ['All', '🔴 Live', '💻 Online', '📍 Offline', '🏆 Contest'];

type TypeMeta = { emoji: string; label: string; gradient: [string,string]; tagColor: string };

function getTypeMeta(c: ColorPalette): Record<string, TypeMeta> {
  return {
    hackathon:   { emoji: '🚀', label: 'Hackathon',  gradient: ['rgba(124,58,237,0.3)','rgba(99,38,183,0.2)'],  tagColor: c.primaryLight },
    workshop:    { emoji: '🎯', label: 'Workshop',   gradient: ['rgba(124,58,237,0.2)','rgba(99,38,183,0.12)'], tagColor: c.primaryLight },
    meetup:      { emoji: '🌐', label: 'Meetup',     gradient: ['rgba(16,185,129,0.28)','rgba(5,150,105,0.18)'],tagColor: '#34D399' },
    webinar:     { emoji: '🎤', label: 'Webinar',    gradient: ['rgba(6,182,212,0.28)','rgba(14,116,144,0.18)'],tagColor: c.cyanLight },
    competition: { emoji: '♟️', label: 'Competition',gradient: ['rgba(251,191,36,0.22)','rgba(249,115,22,0.12)'],tagColor: c.xpGold },
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
      position: 'absolute', top: 12, right: 12,
      backgroundColor: 'rgba(251,191,36,0.92)',
      paddingVertical: 3, paddingHorizontal: 10,
      borderRadius: radii.full,
    },
    xpPillText: { fontSize: fontSizes.xs, fontWeight: '800', color: '#1A0A00' },
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
      marginHorizontal: spacing.lg, marginBottom: 10,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg, borderWidth: 1, borderColor: c.border,
      padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12,
    },
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
    evRegBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    evRegBtnDone: { backgroundColor: 'rgba(16,185,129,0.28)', borderWidth: 1, borderColor: c.success },
    evRegBtnText: { fontSize: fontSizes.md, fontWeight: '800', color: '#fff' },
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
    calMonthHeader: { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary, marginBottom: 12, marginLeft: 4 },
    calHeader: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
    calWeekDay: { width: 36, textAlign: 'center', fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '700' },
    calDay: { 
      width: 36, height: 36, marginHorizontal: 4, marginVertical: 4,
      alignItems: 'center', justifyContent: 'center', borderRadius: 18,
    },
    calDayEmpty: { width: 36, height: 36, marginHorizontal: 4, marginVertical: 4 },
    calDayText: { fontSize: fontSizes.sm, color: c.text.primary, fontWeight: '500' },
    calDaySelected: { backgroundColor: c.primary },
    calDayTextSelected: { color: '#fff', fontWeight: '800' },
    calDayTextToday: { color: c.primary, fontWeight: '800' },
    calEventDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: c.primaryLight, marginTop: 2, position: 'absolute', bottom: 4 },
    calEventDotSelected: { backgroundColor: '#fff' },
  });
}

const CalendarView = ({ selectedDate, onSelectDate, events, styles }: any) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const hasEventOnDate = (day: number) => {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.some((e: any) => e.rawDate && e.rawDate.startsWith(dStr));
  };

  const getDayStr = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const renderDay = ({ item }: any) => {
    if (item === null) return <View style={styles.calDayEmpty} />;
    
    const dateStr = getDayStr(item);
    const isSelected = selectedDate === dateStr;
    const isToday = item === today.getDate() && month === new Date().getMonth();
    const hasEvent = hasEventOnDate(item);

    return (
      <TouchableOpacity 
        style={[styles.calDay, isSelected && styles.calDaySelected]} 
        onPress={() => onSelectDate(isSelected ? null : dateStr)}
      >
        <Text style={[styles.calDayText, isSelected && styles.calDayTextSelected, isToday && !isSelected && styles.calDayTextToday]}>
          {item}
        </Text>
        {hasEvent && <View style={[styles.calEventDot, isSelected && styles.calEventDotSelected]} />}
      </TouchableOpacity>
    );
  };

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = `${MONTHS[month]} ${year}`;

  return (
    <View style={styles.calendarContainer}>
      <Text style={styles.calMonthHeader}>{monthName}</Text>
      <View style={styles.calHeader}>
        {WEEKDAYS.map((d, i) => <Text key={i} style={styles.calWeekDay}>{d}</Text>)}
      </View>
      <FlatList
        data={days}
        numColumns={7}
        keyExtractor={(item, index) => index.toString()}
        renderItem={renderDay}
        scrollEnabled={false}
        columnWrapperStyle={{ justifyContent: 'space-around' }}
      />
    </View>
  );
};

export default function EventsScreen() {
  const insets  = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const TYPE_META = useMemo(() => getTypeMeta(colors), [colors]);

  const [filter, setFilter] = useState('All');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  // Payment Flow State
  const [payuHtml, setPayuHtml] = useState<string | null>(null);
  const [paymentEventId, setPaymentEventId] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchEvents = async () => {
      try {
        const res = await eventService.discoverEvents();
        if (active && res.data) {
          setEvents(res.data);
        }
      } catch (e) {
        console.error('Failed to fetch events:', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchEvents();
    return () => { active = false; };
  }, []);

  const displayEvents = events.filter(e => {
    if (selectedDate) {
      if (!e.rawDate || !e.rawDate.startsWith(selectedDate)) return false;
    }
    if (filter === 'All') return true;
    if (filter === '🔴 Live') return e.isLive;
    if (filter === '💻 Online') return e.location === 'Online';
    if (filter === '📍 Offline') return e.location !== 'Online';
    if (filter === '🏆 Contest') return e.type === 'hackathon' || e.type === 'competition';
    return true;
  });

  const featured = displayEvents.find(e => e.isFeatured);
  const rest     = displayEvents.filter(e => !e.isFeatured && e.id !== featured?.id);

  const toggleRegister = async (id: string) => {
    const evIndex = events.findIndex(e => e.id === id);
    if (evIndex === -1) return;
    const ev = events[evIndex];
    const isReg = ev.isRegistered;
    
    if (!isReg && !ev.isFree && ev.priceCents) {
      setProcessingPayment(true);
      try {
        const payData = await eventService.initPayment(id, ev.priceCents);
        setPayuHtml(payData.html);
        setPaymentEventId(id);
      } catch (e) {
        console.error('Failed to init payment:', e);
        Alert.alert('Payment Error', 'Could not initialize payment flow.');
      } finally {
        setProcessingPayment(false);
      }
      return; // Stop here, wait for webview success
    }

    // Optimistic
    setEvents(prev => prev.map(e => e.id === id ? { ...e, isRegistered: !isReg } : e));
    try {
      if (isReg) {
        await eventService.cancelRegistration(id);
      } else {
        await eventService.register(id);
      }
    } catch (e) {
      // Revert
      setEvents(prev => prev.map(e => e.id === id ? { ...e, isRegistered: isReg } : e));
      console.error('Failed to toggle register:', e);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <MainHeader />

      <View style={styles.header}>
        <Text style={styles.title}>Events 🎯</Text>
        <TouchableOpacity style={styles.calendarBtn} onPress={() => setShowCalendar(s => !s)}>
          <Ionicons name={showCalendar ? "close-outline" : "calendar-outline"} size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
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

        {featured && (
          <View style={styles.featCard}>
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
              <View style={styles.xpPill}>
                <Text style={styles.xpPillText}>⚡ {featured.xpReward} XP</Text>
              </View>
            </LinearGradient>

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
                {featured.cashPrize && (
                  <View style={styles.metaItem}>
                    <Ionicons name="trophy-outline" size={12} color={colors.text.muted} />
                    <Text style={styles.metaText}>₹{(featured.cashPrize / 1000).toFixed(0)}k prize</Text>
                  </View>
                )}
              </View>
              <Button
                label={featured.isRegistered ? '✓ Registered' : 'Register Now — Free Entry'}
                onPress={() => toggleRegister(featured.id)}
                variant={featured.isRegistered ? 'ghost' : 'primary'}
                fullWidth
              />
            </View>
          </View>
        )}

        {displayEvents.length === 0 && selectedDate ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyText}>No events on this date</Text>
            <Text style={styles.emptySubtext}>Try selecting a different day</Text>
          </View>
        ) : (
          <>
            {displayEvents.length > 0 && <Text style={styles.sectionLabel}>Upcoming Events</Text>}
            {rest.map(ev => (
              <EventCard key={ev.id} event={ev} onRegister={toggleRegister} styles={styles} colors={colors} typeMeta={TYPE_META} />
            ))}
          </>
        )}

        <Text style={{ ...styles.sectionLabel, marginTop: 8 }}>
          My Registered Events
        </Text>
        {events.filter(e => e.isRegistered && !e.isFeatured).length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyText}>No registered events yet</Text>
            <Text style={styles.emptySubtext}>Browse and register for events above</Text>
          </View>
        ) : (
          events.filter(e => e.isRegistered && !e.isFeatured).map(ev => (
            <EventCard key={ev.id} event={ev} onRegister={toggleRegister} styles={styles} colors={colors} typeMeta={TYPE_META} />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Payment Processing Indicator */}
      {processingPayment && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* PayU Webview Modal */}
      <Modal visible={!!payuHtml} animationType="slide" onRequestClose={() => setPayuHtml(null)}>
        <View style={{ flex: 1, backgroundColor: colors.bg.base, paddingTop: insets.top }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: fontSizes.lg, fontWeight: '700', color: colors.text.primary }}>Complete Payment</Text>
            <TouchableOpacity onPress={() => setPayuHtml(null)}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {payuHtml && (
            <WebView 
              source={{ html: payuHtml }}
              onNavigationStateChange={async (navState) => {
                if (navState.url.includes('payu/success')) {
                  // Payment Success
                  setPayuHtml(null);
                  if (paymentEventId) {
                    try {
                      // Call backend to actually register now
                      setEvents(prev => prev.map(e => e.id === paymentEventId ? { ...e, isRegistered: true } : e));
                      await eventService.register(paymentEventId);
                      setPaymentEventId(null);
                    } catch (e) {
                      console.error('Failed to register after payment:', e);
                      Alert.alert('Registration Error', 'Payment succeeded but registration failed. Please contact support.');
                    }
                  }
                } else if (navState.url.includes('payu/failure')) {
                  // Payment Failure
                  setPayuHtml(null);
                  setPaymentEventId(null);
                  Alert.alert('Payment Failed', 'Your transaction could not be completed.');
                }
              }}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </Modal>

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
      <LinearGradient colors={meta.gradient} style={styles.evThumb}>
        <Text style={styles.evEmoji}>{meta.emoji}</Text>
      </LinearGradient>
      <View style={styles.evInfo}>
        <Text style={styles.evTitle} numberOfLines={2}>{e.title}</Text>
        <Text style={styles.evMeta}>
          📅 {e.date}{e.time ? ` · 🕐 ${e.time}` : ''} · 📍 {e.location}
        </Text>
        <View style={styles.evTags}>
          <View style={[styles.evTag, { backgroundColor: 'rgba(124,58,237,0.18)' }]}>
            <Text style={[styles.evTagText, { color: meta.tagColor }]}>
              {meta.label}
            </Text>
          </View>
          <View style={[styles.evTag, { backgroundColor: 'rgba(251,191,36,0.14)' }]}>
            <Text style={[styles.evTagText, { color: colors.xpGold }]}>⚡ {e.xpReward} XP</Text>
          </View>
          {e.cashPrize ? (
            <View style={[styles.evTag, { backgroundColor: 'rgba(16,185,129,0.14)' }]}>
              <Text style={[styles.evTagText, { color: '#34D399' }]}>₹{(e.cashPrize/1000).toFixed(0)}k</Text>
            </View>
          ) : null}
        </View>
      </View>
      <TouchableOpacity
        onPress={() => onRegister(e.id)}
        style={[styles.evRegBtn, e.isRegistered && styles.evRegBtnDone]}
      >
        <Text style={styles.evRegBtnText}>{e.isRegistered ? '✓' : '+'}</Text>
      </TouchableOpacity>
    </View>
  );
}
