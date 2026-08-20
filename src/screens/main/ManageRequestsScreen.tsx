import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,  Image } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, useTheme } from '../../context/ThemeContext';
import { fontSizes, spacing, radii } from '../../theme';
import { communityService } from '../../services/community.service';
import type { CommunityStackParamList } from '../../types';
import { themedAlert } from '../../components/common/ThemedAlert';

type Route = RouteProp<CommunityStackParamList, 'ManageRequests'>;

export default function ManageRequestsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { communityId } = route.params;
  const colors = useThemeColors();

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      const res = await communityService.getRequests(communityId);
      setRequests(res.data || []);
    } catch (e: any) {
      themedAlert('Error', 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      await communityService.approveRequest(communityId, userId);
      setRequests(prev => prev.filter(r => r.user_id !== userId));
    } catch (e) {
      themedAlert('Error', 'Failed to approve request');
    }
  };

  const handleReject = async (userId: string) => {
    try {
      await communityService.rejectRequest(communityId, userId);
      setRequests(prev => prev.filter(r => r.user_id !== userId));
    } catch (e) {
      themedAlert('Error', 'Failed to reject request');
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg.base }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.base, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Join Requests</Text>
      </View>

      <FlashList
        data={requests}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={colors.text.muted} />
            <Text style={[styles.emptyText, { color: colors.text.secondary }]}>No pending requests.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
            <View style={styles.userInfo}>
              <View style={[styles.avatarWrap, { backgroundColor: colors.bg.elevated, borderColor: colors.border }]}>
                {item.user.avatarUrl ? (
                  <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
                ) : (
                  <Ionicons name="person-outline" size={24} color={colors.text.muted} />
                )}
              </View>
              <View>
                <Text style={[styles.name, { color: colors.text.primary }]}>{item.user.name}</Text>
                <Text style={[styles.username, { color: colors.text.secondary }]}>@{item.user.username}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.rejectBtn, { borderColor: colors.danger }]} onPress={() => handleReject(item.user_id)}>
                <Ionicons name="close" size={20} color={colors.danger} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.approveBtn, { backgroundColor: colors.primary }]} onPress={() => handleApprove(item.user_id)}>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1 },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: fontSizes.lg, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderWidth: 1, borderRadius: radii.lg, marginBottom: 12 },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatarWrap: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: '100%', height: '100%' },
  name: { fontSize: fontSizes.md, fontWeight: '700' },
  username: { fontSize: fontSizes.sm },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  rejectBtn: { backgroundColor: 'transparent' },
  approveBtn: { borderWidth: 0 },
  empty: { alignItems: 'center', marginTop: 100, gap: 12 },
  emptyText: { fontSize: fontSizes.md },
});
