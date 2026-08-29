import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '../../../context/ThemeContext';
import { Image } from 'expo-image';
import { fontSizes, radii, spacing } from '../../../theme';
import type { Game } from '../../../types';

interface GamesMatchmakingModalProps {
  visible: boolean;
  onClose: () => void;
  games: Game[];
  reconnectSession: any;
  onPlayClick: (game: Game, isRejoin: boolean) => void;
}

export default function GamesMatchmakingModal({
  visible,
  onClose,
  games,
  reconnectSession,
  onPlayClick
}: GamesMatchmakingModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
            <Text style={styles.title}>Select a Game</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {games.map(game => {
              const isRejoin = !!reconnectSession && reconnectSession.gameId === game.id;

              return (
                <TouchableOpacity
                  key={game.id}
                  style={styles.gameCard}
                  activeOpacity={0.8}
                  onPress={() => {
                    onClose();
                    onPlayClick(game, isRejoin);
                  }}
                >
                  <LinearGradient
                    colors={game.gradient || ['#1E1E1E', '#2D2D2D']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gameIconWrapper}
                  >
                    <Image source={{ uri: (game as any).imageUrl || (game as any).thumbnail }} style={styles.gameIcon} contentFit="contain" />
                  </LinearGradient>
                  
                  <View style={styles.gameInfo}>
                    <Text style={styles.gameName}>{game.name}</Text>
                    <Text style={styles.gameMeta}>
                      {game.averageDurationLabel || '5-10 mins'} • {game.entryFee || 0} XP
                    </Text>
                  </View>

                  <View style={[styles.playBtn, isRejoin && styles.resumeBtn]}>
                    <Text style={styles.playBtnText}>{isRejoin ? 'Resume' : 'Play'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
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
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bg.card,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  gameIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  gameIcon: {
    width: 32,
    height: 32,
  },
  gameInfo: {
    flex: 1,
  },
  gameName: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: c.text.primary,
  },
  gameMeta: {
    fontSize: fontSizes.xs,
    color: c.text.muted,
    marginTop: 2,
    fontWeight: '600',
  },
  playBtn: {
    backgroundColor: c.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  resumeBtn: {
    backgroundColor: c.warning || '#F59E0B',
  },
  playBtnText: {
    color: '#fff',
    fontSize: fontSizes.sm,
    fontWeight: '800',
  }
});
