import React, { useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  Linking,
  Platform
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useThemeColors, useTheme } from '../../context/ThemeContext';
import { fontSizes, radii, spacing } from '../../theme';
import Button from '../../components/common/Button';
import { useToggleEventRegister } from '../../mutations/events';
import { themedAlert } from '../../components/common/ThemedAlert';

export default function EventDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);

  const event = route.params?.event;
  const { mutate: toggleEventRegister } = useToggleEventRegister();


  if (!event) return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: insets.top + 8, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={23} color={colors.text.primary} />
        </TouchableOpacity>

      </View>
    </View>
  );

  const handleJoin = () => {
    if (event.isRegistered) {
      themedAlert(
        "Cancel Registration",
        "Are you sure you want to cancel your registration?",
        [
          { text: "No", style: "cancel" },
          {
            text: "Yes",
            style: "destructive",
            onPress: () => toggleEventRegister({ eventId: event.id, isCurrentlyRegistered: true }),
          },
        ]
      );
    } else {
      if (!event.isFree && event.xpPrice) {
        themedAlert(
          "Join with XP",
          `This event costs ${event.xpPrice.toLocaleString()} XP. Continue?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: `Pay ${event.xpPrice.toLocaleString()} XP`,
              onPress: () => toggleEventRegister({ eventId: event.id, isCurrentlyRegistered: false }),
            },
          ]
        );
      } else {
        toggleEventRegister({ eventId: event.id, isCurrentlyRegistered: false });
      }
    }
  };

  const handleAddToCalendar = () => {
    const title = encodeURIComponent(event.title);
    const details = encodeURIComponent(event.description || '');
    const location = encodeURIComponent(event.location || 'Online');
    
    // Google Calendar template works great on both platforms and opens the browser/app
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
    Linking.openURL(url).catch(() => {
      themedAlert("Error", "Could not open calendar.", [{ text: "OK" }]);
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        
        {/* Banner */}
        <ImageBackground
          source={{ uri: event.banner || 'https://via.placeholder.com/800x400' }}
          style={styles.banner}
        >
          <LinearGradient
            colors={isDark ? ['rgba(0,0,0,0.7)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.8)'] : ['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
            style={StyleSheet.absoluteFillObject}
          />
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.bannerContent}>
            {event.isLive && (
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.livePillText}>LIVE NOW</Text>
              </View>
            )}
            <Text style={styles.title}>{event.title}</Text>
          </View>
        </ImageBackground>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.metaRow}>
            <View style={styles.metaBox}>
              <Ionicons name="calendar" size={24} color={colors.primaryLight} />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.metaLabel}>Date & Time</Text>
                <Text style={styles.metaValue}>{event.date}</Text>
              </View>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaBox}>
              <Ionicons name="location" size={24} color={colors.primaryLight} />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.metaLabel}>Location</Text>
                <Text style={styles.metaValue}>{event.location || 'Online'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaBox}>
              <Ionicons name="ticket" size={24} color={colors.primaryLight} />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.metaLabel}>Entry Fee</Text>
                <Text style={styles.metaValue}>{event.isFree || !event.xpPrice ? 'Free' : `${event.xpPrice} XP`}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>About this Event</Text>
          <Text style={styles.description}>
            {event.description || 'No description provided.'}
          </Text>
          
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.calendarBtn} onPress={handleAddToCalendar}>
          <Ionicons name="calendar-outline" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Button
            label={event.isRegistered ? "✓ Participated" : "Join Event"}
            onPress={handleJoin}
            variant={event.isRegistered ? "ghost" : "primary"}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: any, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg.base,
  },
  banner: {
    width: '100%',
    height: 320,
    justifyContent: 'flex-end',
  },
  backBtn: {
    position: 'absolute',
    top: insets.top + 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerContent: {
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: '900',
    color: '#fff',
    marginTop: 8,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.9)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  livePillText: {
    color: '#fff',
    fontSize: fontSizes.xs,
    fontWeight: '800',
  },
  content: {
    padding: spacing.xl,
  },
  metaRow: {
    marginBottom: 20,
  },
  metaBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: fontSizes.sm,
    color: c.text.muted,
  },
  metaValue: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: c.text.primary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '800',
    color: c.text.primary,
    marginTop: 16,
    marginBottom: 12,
  },
  description: {
    fontSize: fontSizes.md,
    color: c.text.secondary,
    lineHeight: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: c.bg.surface,
    borderTopWidth: 1,
    borderTopColor: c.border,
    padding: spacing.lg,
    paddingBottom: Math.max(insets.bottom, spacing.lg),
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarBtn: {
    width: 54,
    height: 54,
    borderRadius: radii.lg,
    backgroundColor: c.bg.card,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
