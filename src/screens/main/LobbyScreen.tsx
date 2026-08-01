import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useGames } from '../../context/GamesContext';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, radii, spacing } from '../../theme';
import apiClient from '../../services/apiClient';
import { socketClient } from '../../services/socketClient';

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { games } = useGames();
  const colors = useThemeColors();
  
  const { lobbyId, gameId } = route.params || {};
  
  const [lobby, setLobby] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const game = useMemo(() => games.find(g => g.id === gameId || g.slug === gameId), [games, gameId]);
  
  useEffect(() => {
    if (!lobbyId) {
      navigation.goBack();
      return;
    }

    const fetchLobby = async () => {
      try {
        const res = await apiClient.get(`/game/lobbies/${lobbyId}`);
        setLobby(res.data);
      } catch (error) {
        console.error('Failed to fetch lobby:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLobby();

    const handleLobbyUpdate = (data: any) => {
      if (data.id === lobbyId) {
        setLobby(data);
      }
    };

    const handleMatchStarted = (data: any) => {
      // The match started!
      // This will actually be handled globally by GamesScreen context, 
      // but we might want to pop this screen.
      navigation.goBack(); 
    };

    socketClient.on('matchmaking:lobbyUpdated', handleLobbyUpdate);
    socketClient.on('matchmaking:matched', handleMatchStarted);

    return () => {
      socketClient.off('matchmaking:lobbyUpdated', handleLobbyUpdate);
      socketClient.off('matchmaking:matched', handleMatchStarted);
    };
  }, [lobbyId]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
      </View>
    );
  }

  if (!lobby) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.text.primary }}>Lobby not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={{ color: colors.primaryLight }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isHost = lobby.hostUserId === user?.id;
  const maxPlayers = lobby.settings?.targetPlayers || game?.maxPlayers || 2;
  const players = lobby.players || [];
  const emptySlots = Math.max(0, maxPlayers - players.length);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>{game?.name} Lobby</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>
            {lobby.settings?.visibility === 'PRIVATE' ? 'Private Lobby' : 'Public Matchmaking'}
          </Text>
          {lobby.settings?.visibility === 'PRIVATE' && (
            <Text style={styles.lobbyCode}>Code: {lobby.id.split('-')[0].toUpperCase()}</Text>
          )}
          <Text style={styles.playerCount}>
            Players: {players.length} / {maxPlayers}
          </Text>
        </View>

        <View style={styles.playersList}>
          {players.map((p: any) => (
            <View key={p.id} style={styles.playerCard}>
              {p.avatar ? (
                <Image source={{ uri: p.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {(p.name || p.username || '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{p.name || p.username}</Text>
                {p.id === lobby.hostUserId && (
                  <Text style={styles.hostBadge}>👑 Host</Text>
                )}
              </View>
            </View>
          ))}

          {Array.from({ length: emptySlots }).map((_, i) => (
            <View key={`empty-${i}`} style={[styles.playerCard, styles.emptyCard]}>
              <View style={[styles.avatarPlaceholder, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed' }]} />
              <Text style={styles.emptyText}>Waiting for player...</Text>
            </View>
          ))}
        </View>

        {isHost && (
          <View style={styles.hostControls}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => {
                apiClient.post(`/game/lobbies/${lobbyId}/start`, { addBots: true });
            }}>
              <Text style={styles.primaryBtnText}>Start with Bots</Text>
            </TouchableOpacity>
            {lobby.settings?.visibility === 'PRIVATE' && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => {
                apiClient.patch(`/game/lobbies/${lobbyId}`, { visibility: 'PUBLIC' });
              }}>
                <Text style={styles.secondaryBtnText}>Open to Public</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  iconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16 },
  statusCard: { backgroundColor: '#1E293B', padding: 20, borderRadius: 16, marginBottom: 24, alignItems: 'center' },
  statusTitle: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  lobbyCode: { color: '#FFF', fontSize: 32, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  playerCount: { color: '#38BDF8', fontSize: 16, fontWeight: '700' },
  playersList: { gap: 12 },
  playerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1E293B' },
  emptyCard: { opacity: 0.5 },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#334155', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  playerInfo: { flex: 1 },
  playerName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  hostBadge: { color: '#FBBF24', fontSize: 12, fontWeight: '700', marginTop: 4 },
  emptyText: { color: '#64748B', fontSize: 16, fontStyle: 'italic' },
  hostControls: { marginTop: 32, gap: 12 },
  primaryBtn: { backgroundColor: '#3B82F6', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#1E293B', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  secondaryBtnText: { color: '#94A3B8', fontSize: 16, fontWeight: '700' },
});
