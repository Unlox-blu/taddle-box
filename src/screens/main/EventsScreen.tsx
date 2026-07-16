const EVENTS: any[] = [];
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import Button from '../../components/common/Button';
// removed mockData import
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
  });
}

export default function EventsScreen() {
  const insets  = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const TYPE_META = useMemo(() => getTypeMeta(colors), [colors]);

  const [filter, setFilter] = useState('All');
  const [events, setEvents] = useState(EVENTS);

  const featured = events.find(e => e.isFeatured);
  const rest     = events.filter(e => !e.isFeatured);

  const toggleRegister = (id: string) =>
    setEvents(prev => prev.map(e => e.id === id ? { ...e, isRegistered: !e.isRegistered } : e));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.header}>
        <Text style={styles.title}>Events 🎯</Text>
        <TouchableOpacity style={styles.calendarBtn}>
          <Ionicons name="calendar-outline" size={20} color={colors.text.secondary} />
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
                {TYPE_META[featured.type].label.toUpperCase()} · NATIONAL LEVEL
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

        <Text style={styles.sectionLabel}>Upcoming Events</Text>
        {rest.map(ev => (
          <EventCard key={ev.id} event={ev} onRegister={toggleRegister} styles={styles} colors={colors} typeMeta={TYPE_META} />
        ))}

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
  const meta = typeMeta[e.type];
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
