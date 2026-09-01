import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { RowCtx, FeedEnvelope } from "../ContentCard";
import type { Notification } from "../../../../types";
import { fontSizes, radii, spacing, type ColorPalette } from "../../../../theme";
import ActiveStatusDot from "../../ActiveStatusDot";

const NOTIF_ICON: Record<string, string> = {
  like: 'heart', comment: 'chatbubble', follow: 'person-add',
  mention: 'at', event: 'calendar', achievement: 'trophy', game_invite: 'game-controller',
  post: 'create', community: 'people', streak: 'flame'
};

function getNotifColor(c: ColorPalette): Record<string, string> {
  return {
    like: c.pink, comment: c.primaryLight, follow: c.cyan,
    mention: c.cyanLight, event: c.xpGold, achievement: c.xpGold, game_invite: c.primaryLight,
    post: c.primary, community: c.cyan, streak: c.xpGold
  };
}

export default function NotificationCard({ item, ctx }: { item: FeedEnvelope<any>; ctx: RowCtx }) {
  const notif: Notification = item.data;
  const colors = ctx.colors;
  const notifColor = getNotifColor(colors);

  const openNotification = () => {
    if (!notif) return;
    const { type, payload, resourceId } = notif;
    
    if (type === 'follow' && payload?.isFollowRequest) {
      ctx.navigation.navigate('FollowRequests');
      return;
    }
    if (type === 'follow' && payload?.username) {
      ctx.openUser({ username: payload.username, name: notif.actor, avatarUrl: notif.avatarUrl });
      return;
    }
    if (type === 'community') {
      ctx.openCommunity(payload?.communitySlug || resourceId || payload?.communityId);
      return;
    }
    if (type === 'event') {
      ctx.navigation.navigate('Main', { screen: 'Events' });
      return;
    }
    if (type === 'game_invite') {
      ctx.navigation.navigate('Main', { screen: 'Games' });
      return;
    }
    if (type === 'post' || type === 'like' || type === 'comment' || type === 'mention') {
      if (resourceId) {
         ctx.openPost({ id: resourceId });
         return;
      }
    }
    // Fallback
    if (notif.payload?.username) {
      ctx.openUser({ username: notif.payload.username, name: notif.actor, avatarUrl: notif.avatarUrl });
    }
  };

  if (!notif) return null;

  const isStacked = typeof notif.actorCount === 'number' && notif.actorCount >= 2;

  return (
    <TouchableOpacity
      style={[styles.row, notif.isRead ? { backgroundColor: colors.bg.card, borderColor: colors.border } : { backgroundColor: 'rgba(124, 58, 237, 0.08)', borderColor: 'rgba(124, 58, 237, 0.2)' }]}
      onPress={openNotification}
      activeOpacity={0.7}
    >
      {isStacked ? (
        <View style={styles.stackedAvatarWrap}>
          <View style={[styles.secondAvatar, { backgroundColor: colors.bg.surface, borderColor: colors.bg.base }]}>
            <LinearGradient colors={[colors.cyanDark, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person" size={15} color="#fff" />
            </LinearGradient>
          </View>
          <View style={[styles.firstAvatarSmall, { backgroundColor: colors.bg.surface, borderColor: colors.bg.base }]}>
            {notif.avatarUrl ? (
              <Image source={{ uri: notif.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
            ) : (
              <LinearGradient colors={[colors.primary, colors.cyanDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person" size={15} color="#fff" />
              </LinearGradient>
            )}
          </View>
          <View style={[styles.typeDot, { borderColor: colors.bg.base, backgroundColor: notifColor[notif.type] || colors.primary, bottom: -4, right: -4, zIndex: 3 }]}>
            <Ionicons name={(NOTIF_ICON[notif.type] || 'notifications') as any} size={10} color="#fff" />
          </View>
        </View>
      ) : (
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: colors.bg.surface, borderColor: colors.borderHover }]}>
            {notif.avatarUrl ? (
              <Image source={{ uri: notif.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
            ) : (
              <LinearGradient colors={[colors.primary, colors.cyanDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person" size={20} color="#fff" />
              </LinearGradient>
            )}
          </View>
          <View style={[styles.typeDot, { borderColor: colors.bg.base, backgroundColor: notifColor[notif.type] || colors.primary }]}>
            <Ionicons name={(NOTIF_ICON[notif.type] || 'notifications') as any} size={10} color="#fff" />
          </View>
          {notif.senderId || notif.payload?.userId ? (
            <ActiveStatusDot userId={notif.senderId || notif.payload?.userId} size={13} style={{ top: -3, right: 4, bottom: undefined }} />
          ) : null}
        </View>
      )}

      <View style={styles.content}>
        {notif.type === 'community' && notif.communityName ? (
          <Text style={{ fontSize: fontSizes.xs, fontWeight: '700', color: colors.primary, marginBottom: 4 }} numberOfLines={1}>
            {notif.communityName}
          </Text>
        ) : null}

        {isStacked ? (
          <Text style={[styles.notifText, { color: colors.text.secondary, marginBottom: 2 }]} numberOfLines={3}>
            <Text style={[styles.actor, { color: colors.text.primary, fontSize: fontSizes.sm }]}>{notif.actor} </Text>
            <Text style={styles.notifBody}>{notif.text}</Text>
          </Text>
        ) : (
          <>
            <Text style={[styles.actor, { color: colors.text.primary }]} numberOfLines={1}>{notif.actor || notif.title || 'Notification'}</Text>
            <Text style={[styles.notifText, { color: colors.text.secondary }]} numberOfLines={2}>
              <Text style={styles.notifBody}>{notif.text || notif.message}</Text>
            </Text>
          </>
        )}
        {notif.time ? (
          <Text style={[styles.time, { color: colors.text.muted }]}>{notif.time}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginHorizontal: spacing.lg, paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: 8, gap: 14, borderRadius: radii.xl,
    borderWidth: 1,
  },
  avatarWrap: { position: 'relative', width: 48 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  typeDot: {
    position: 'absolute', bottom: -2, right: -4,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  stackedAvatarWrap: { width: 64, height: 48, position: 'relative' },
  secondAvatar: {
    position: 'absolute', left: 18, top: 0,
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  firstAvatarSmall: {
    position: 'absolute', left: 0, top: 6,
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  content: { flex: 1, justifyContent: 'center' },
  notifText: { fontSize: fontSizes.sm, lineHeight: 20 },
  actor: { fontWeight: '800', fontSize: fontSizes.md, marginBottom: 2 },
  notifBody: { fontWeight: '500' },
  time: { fontSize: fontSizes.xs, marginTop: 4, fontWeight: '600' },
});
