import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fontSizes, spacing, radii } from '../../theme';
import type { HomeStackParamList } from '../../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'StoryViewer'>;

const { width, height } = Dimensions.get('window');
const STORY_DURATION = 5000;

const STORY_GRADIENTS: [string, string][] = [
  ['#1a0a3e', '#3b1a7e'],
  ['#0a2e1a', '#0a4e2a'],
  ['#2e0a1a', '#4e0a2a'],
  ['#0a1a2e', '#0a2e4e'],
  ['#1a1a0a', '#2e2e0a'],
  ['#2e1a0a', '#4e2a0a'],
];

const STORY_CONTENT = [
  { emoji: '🎮', text: 'Just hit a new high score! The grind never stops 🔥' },
  { emoji: '🚀', text: 'Shipped a new feature today. From idea to prod in 48h!' },
  { emoji: '🏆', text: 'Tournament day! Who wants to challenge the champ? 🤺' },
  { emoji: '🎨', text: 'Working on some new designs. Sneak peek coming soon...' },
  { emoji: '📚', text: 'Study session in full swing. 4 hours down, 2 to go 💪' },
  { emoji: '⚡', text: 'Hackathon night! Running on coffee and ambition ☕' },
];

export default function StoryViewerScreen({ navigation, route }: Props) {
  const { stories, initialIndex } = route.params;
  const insets = useSafeAreaInsets();

  const [current, setCurrent]   = useState(initialIndex);
  const [paused,  setPaused]    = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressRef  = useRef<Animated.CompositeAnimation | null>(null);

  const story = stories[current];

  const startProgress = () => {
    progressAnim.setValue(0);
    progressRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    progressRef.current.start(({ finished }) => {
      if (finished) goNext();
    });
  };

  const stopProgress = () => {
    progressRef.current?.stop();
  };

  useEffect(() => {
    startProgress();
    return () => stopProgress();
  }, [current]);

  useEffect(() => {
    if (paused) stopProgress();
    else startProgress();
  }, [paused]);

  const goNext = () => {
    if (current < stories.length - 1) {
      setCurrent(i => i + 1);
    } else {
      navigation.goBack();
    }
  };

  const goPrev = () => {
    if (current > 0) setCurrent(i => i - 1);
    else navigation.goBack();
  };

  const gradient = STORY_GRADIENTS[current % STORY_GRADIENTS.length];
  const content  = story.isOwn ? null : STORY_CONTENT[current % STORY_CONTENT.length];

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden />
      <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />

      {/* Progress bars */}
      <View style={[styles.progressRow, { paddingTop: insets.top + 8 }]}>
        {stories.map((_, i) => (
          <View key={i} style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: i < current
                    ? '100%'
                    : i === current
                    ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                    : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Top bar: avatar + name + close */}
      <View style={styles.topBar}>
        <View style={styles.storyUser}>
          <View style={styles.storyAvatar}>
            <Text style={styles.storyAvatarEmoji}>
              {story.isOwn ? '🧑‍💻' : story.avatar}
            </Text>
          </View>
          <View>
            <Text style={styles.storyName}>{story.user}</Text>
            <Text style={styles.storyTime}>
              {story.seen ? 'Viewed' : 'Just now'}
            </Text>
          </View>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity onPress={() => setPaused(v => !v)} style={styles.actionBtn}>
            <Ionicons name={paused ? 'play' : 'pause'} size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.actionBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tap zones: left = prev, right = next */}
      <View style={styles.tapZones}>
        <TouchableOpacity style={styles.tapLeft}  onPress={goPrev} activeOpacity={1} />
        <TouchableOpacity style={styles.tapRight} onPress={goNext} activeOpacity={1} />
      </View>

      {/* Story content */}
      {story.isOwn ? (
        <View style={styles.ownStoryCenter}>
          <View style={styles.addStoryCircle}>
            <Ionicons name="add" size={48} color={colors.primaryLight} />
          </View>
          <Text style={styles.ownStoryTitle}>Create Your Story</Text>
          <Text style={styles.ownStorySubtitle}>
            Share a moment with your followers
          </Text>
          <TouchableOpacity style={styles.ownStoryBtn}>
            <Ionicons name="camera-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.ownStoryBtnText}>Add to Story</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.contentCenter}>
          <Text style={styles.contentEmoji}>{content?.emoji}</Text>
          <Text style={styles.contentText}>{content?.text}</Text>
        </View>
      )}

      {/* Bottom bar */}
      {!story.isOwn && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.replyInput}>
            <Text style={styles.replyPlaceholder}>Reply to {story.user}…</Text>
          </View>
          <TouchableOpacity style={styles.sendBtn}>
            <Ionicons name="paper-plane-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070714' },

  progressRow: {
    flexDirection: 'row', gap: 4,
    paddingHorizontal: spacing.md,
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },
  progressTrack: {
    flex: 1, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },

  topBar: {
    position: 'absolute', left: 0, right: 0, top: 44,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, zIndex: 10,
  },
  storyUser:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  storyAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
  },
  storyAvatarEmoji: { fontSize: 20 },
  storyName:   { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },
  storyTime:   { fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.65)' },
  topActions:  { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },

  tapZones:  {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    flexDirection: 'row', zIndex: 5,
  },
  tapLeft:   { flex: 1 },
  tapRight:  { flex: 2 },

  contentCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  contentEmoji: { fontSize: 80, marginBottom: 24 },
  contentText: {
    fontSize: fontSizes.xl, fontWeight: '700', color: '#fff',
    textAlign: 'center', lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  ownStoryCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  addStoryCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderWidth: 2, borderColor: colors.primaryLight, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  ownStoryTitle:    { fontSize: fontSizes.xxl, fontWeight: '800', color: '#fff', marginBottom: 8 },
  ownStorySubtitle: { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.65)', marginBottom: 28 },
  ownStoryBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primary, borderRadius: radii.full,
    paddingVertical: 12, paddingHorizontal: 24,
  },
  ownStoryBtnText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.lg, paddingTop: 12,
    zIndex: 10,
  },
  replyInput: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: radii.full, paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  replyPlaceholder: { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.55)' },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
});
