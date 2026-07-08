import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, fontSizes, spacing } from '../../theme';
import type { Story } from '../../types';

interface StoryRowProps {
  stories: Story[];
  onStoryPress?: (story: Story) => void;
}

export default function StoryRow({ stories, onStoryPress }: StoryRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {stories.map(story => (
        <TouchableOpacity key={story.id} style={styles.item} activeOpacity={0.8} onPress={() => onStoryPress?.(story)}>
          {story.isOwn ? (
            <View style={styles.addRing}>
              <View style={styles.addAv}>
                <Text style={styles.addIcon}>＋</Text>
              </View>
            </View>
          ) : story.seen ? (
            <View style={styles.seenRing}>
              <View style={styles.av}>
                <Text style={styles.emoji}>{story.avatar}</Text>
              </View>
            </View>
          ) : (
            <LinearGradient
              colors={[colors.primaryLight, colors.cyanLight]}
              style={styles.activeRing}
            >
              <View style={styles.av}>
                <Text style={styles.emoji}>{story.avatar}</Text>
              </View>
            </LinearGradient>
          )}
          <Text style={styles.name} numberOfLines={1}>{story.user}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const RING = 64;
const AV   = 56;

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: 12 },
  item: { alignItems: 'center', gap: 5, width: RING },
  activeRing: {
    width: RING, height: RING,
    borderRadius: RING / 2,
    padding: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  seenRing: {
    width: RING, height: RING,
    borderRadius: RING / 2,
    padding: 2,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  addRing: {
    width: RING, height: RING,
    borderRadius: RING / 2,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.borderHover,
    borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  av: {
    width: AV, height: AV,
    borderRadius: AV / 2,
    backgroundColor: colors.bg.card,
    borderWidth: 2,
    borderColor: colors.bg.base,
    alignItems: 'center', justifyContent: 'center',
  },
  addAv: {
    width: AV, height: AV,
    borderRadius: AV / 2,
    backgroundColor: 'rgba(124,58,237,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  emoji:   { fontSize: 24 },
  addIcon: { fontSize: 26, color: colors.primaryLight, fontWeight: '300' },
  name: {
    fontSize: fontSizes.xs,
    color: colors.text.secondary,
    width: RING,
    textAlign: 'center',
  },
});
