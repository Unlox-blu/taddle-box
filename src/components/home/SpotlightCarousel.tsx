import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Dimensions, ListRenderItem,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';

const { width: SW } = Dimensions.get('window');
const CARD_W  = SW - spacing.lg * 2;
const CARD_H  = 168;
const ITEM_W  = CARD_W + spacing.md;

type SpotlightItem = {
  id:       string;
  title:    string;
  subtitle: string;
  meta:     string;
  tag:      string;
  tagColor: string;
  emoji:    string;
  gradient: [string, string];
};

const SPOTLIGHTS: SpotlightItem[] = [
  {
    id: 'sp1', emoji: '⚡',
    title:    'HackFest 2026',
    subtitle: "India's Biggest College Hackathon",
    meta:     'Jun 20–22 · Online & Offline · 48h',
    tag:      'Registrations Open',
    tagColor: '#10B981',
    gradient: ['#1E1B4B', '#4C1D95'],
  },
  {
    id: 'sp2', emoji: '🌐',
    title:    'Web3 Dev Webinar',
    subtitle: 'Building DApps from Scratch',
    meta:     'Today · 6:00 PM IST · Free',
    tag:      '🔴 Live Today',
    tagColor: '#EF4444',
    gradient: ['#1C0B2E', '#5B21B6'],
  },
  {
    id: 'sp3', emoji: '🎭',
    title:    'Cultural Fest – Mela 26',
    subtitle: 'Music, Dance & Gaming Contests',
    meta:     'Jul 5 · Campus + Online',
    tag:      '🎟 This Weekend',
    tagColor: '#F59E0B',
    gradient: ['#1A1200', '#78350F'],
  },
  {
    id: 'sp4', emoji: '📚',
    title:    'DSA Bootcamp',
    subtitle: 'Crack Placements in 30 Days',
    meta:     'Starts Jun 15 · Free · 200+ enrolled',
    tag:      'Free Entry',
    tagColor: '#06B6D4',
    gradient: ['#0C1A2E', '#0E4C6A'],
  },
  {
    id: 'sp5', emoji: '🚀',
    title:    'Startup Pitch Contest',
    subtitle: 'Win ₹1,00,000 in Prize Money',
    meta:     'Jun 25 · IIT Delhi · Apply by Jun 18',
    tag:      'Apply Now',
    tagColor: '#EC4899',
    gradient: ['#1A001A', '#6D1278'],
  },
];

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container:    { marginBottom: spacing.md },
    sectionLabel: {
      fontSize: fontSizes.xs, fontWeight: '700',
      color: c.text.muted, letterSpacing: 0.5,
      paddingHorizontal: spacing.xl, marginBottom: 10,
    },
    card: {
      width: CARD_W, height: CARD_H,
      borderRadius: radii.lg,
      padding: spacing.lg,
      justifyContent: 'flex-end',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.07)',
    },
    tag: {
      position: 'absolute', top: 14, right: 14,
      paddingVertical: 4, paddingHorizontal: 10,
      borderRadius: radii.full, borderWidth: 1,
    },
    tagText:     { fontSize: fontSizes.xs, fontWeight: '700' },
    emoji:       { fontSize: 44, marginBottom: 6 },
    cardTitle:   { fontSize: fontSizes.lg, fontWeight: '800', color: '#fff' },
    cardSubtitle:{ fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
    cardMeta:    { fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
    dots: {
      flexDirection: 'row', justifyContent: 'center',
      gap: 5, marginTop: 10,
    },
    dot: {
      width: 6, height: 6, borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    dotActive: {
      width: 22, height: 6, borderRadius: 3,
      backgroundColor: c.primary,
    },
  });
}

export default function SpotlightCarousel() {
  const colors = useThemeColors();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const [activeIdx, setActiveIdx] = useState(0);
  const flatRef   = useRef<FlatList<SpotlightItem>>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(0);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const next = (activeRef.current + 1) % SPOTLIGHTS.length;
      activeRef.current = next;
      setActiveIdx(next);
      flatRef.current?.scrollToIndex({ index: next, animated: true });
    }, 3600);
  }, []);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTimer]);

  const renderItem: ListRenderItem<SpotlightItem> = ({ item }) => (
    <TouchableOpacity activeOpacity={0.88} style={{ width: CARD_W }}>
      <LinearGradient
        colors={item.gradient}
        style={styles.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={[styles.tag, { borderColor: `${item.tagColor}55`, backgroundColor: `${item.tagColor}1A` }]}>
          <Text style={[styles.tagText, { color: item.tagColor }]}>{item.tag}</Text>
        </View>
        <Text style={styles.emoji}>{item.emoji}</Text>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
        <Text style={styles.cardMeta}>{item.meta}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>✨ SPOTLIGHT</Text>

      <FlatList
        ref={flatRef}
        data={SPOTLIGHTS}
        renderItem={renderItem}
        keyExtractor={i => i.id}
        horizontal
        pagingEnabled={false}
        snapToInterval={ITEM_W}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        getItemLayout={(_, idx) => ({ length: ITEM_W, offset: ITEM_W * idx, index: idx })}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / ITEM_W);
          const clamped = Math.max(0, Math.min(idx, SPOTLIGHTS.length - 1));
          activeRef.current = clamped;
          setActiveIdx(clamped);
          startTimer();
        }}
      />

      <View style={styles.dots}>
        {SPOTLIGHTS.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIdx && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}
