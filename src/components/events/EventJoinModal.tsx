import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ImageBackground
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, radii, spacing } from '../../theme';
import { useEvents } from '../../queries/events';
import { useToggleEventRegister } from '../../mutations/events';
import { themedAlert } from '../common/ThemedAlert';

interface EventJoinModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function EventJoinModal({
  visible,
  onClose,
}: EventJoinModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Fetch upcoming events
  const { data: allEventsData } = useEvents('', null, 'upcoming');
  const events = useMemo(() => allEventsData?.pages?.flatMap(p => p) || [], [allEventsData]);
  
  // Filter out events the user has already joined
  const joinableEvents = events.filter((e: any) => !e.isRegistered);

  const { mutate: toggleEventRegister } = useToggleEventRegister();

  const handleJoin = (ev: any) => {
    if (!ev.isFree && ev.xpPrice) {
      themedAlert(
        "Join with XP",
        `This event costs ${ev.xpPrice.toLocaleString()} XP. Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: `Pay ${ev.xpPrice.toLocaleString()} XP`,
            onPress: () => {
              toggleEventRegister({ eventId: ev.id, isCurrentlyRegistered: false });
              onClose();
            }
          },
        ]
      );
    } else {
      toggleEventRegister({ eventId: ev.id, isCurrentlyRegistered: false });
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Join an Event</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {joinableEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={40} color={colors.text.muted} />
                <Text style={styles.emptyText}>No upcoming events available</Text>
              </View>
            ) : (
              joinableEvents.map((ev: any) => (
                <TouchableOpacity
                  key={ev.id}
                  style={styles.eventCard}
                  activeOpacity={0.8}
                  onPress={() => handleJoin(ev)}
                >
                  <View style={styles.eventIconWrapper}>
                    {ev.banner ? (
                      <ImageBackground source={{ uri: ev.banner }} style={StyleSheet.absoluteFillObject} imageStyle={{ borderRadius: radii.md }}>
                        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: radii.md }} />
                      </ImageBackground>
                    ) : (
                      <LinearGradient
                        colors={[colors.primary, colors.cyanDark]}
                        style={[StyleSheet.absoluteFillObject, { borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' }]}
                      >
                        <Ionicons name="calendar" size={20} color="#fff" />
                      </LinearGradient>
                    )}
                  </View>
                  
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventName} numberOfLines={1}>{ev.title}</Text>
                    <Text style={styles.eventMeta}>
                      {ev.date} • {ev.isFree || !ev.xpPrice ? 'Free' : `${ev.xpPrice} XP`}
                    </Text>
                  </View>

                  <View style={styles.joinBtn}>
                    <Text style={styles.joinBtnText}>Join</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    backgroundColor: c.bg.base,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    maxHeight: '80%',
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  title: {
    fontSize: fontSizes.lg,
    fontWeight: '900',
    color: c.text.primary,
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bg.card,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  eventIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: c.text.primary,
  },
  eventMeta: {
    fontSize: fontSizes.xs,
    color: c.text.muted,
    marginTop: 2,
    fontWeight: '600',
  },
  joinBtn: {
    backgroundColor: c.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  joinBtnText: {
    color: '#fff',
    fontSize: fontSizes.sm,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: c.text.muted,
  }
});
