import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import { apiClient } from '../../services/apiClient';
import type { HomeStackParamList, Post, User, Community } from '../../types';
import PostCard from '../../components/home/PostCard';
import { usePosts } from '../../context/PostsContext';

type Props = NativeStackScreenProps<HomeStackParamList, 'Search'>;

type SearchTab = 'posts' | 'people' | 'communities' | 'events' | 'hashtags';

export default function SearchScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // If passed from hashtag click
  const initialQuery = (route.params as any)?.query || '';

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchTab>('posts');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const { toggleLike, toggleSave } = usePosts();

  const fetchResults = useCallback(async (q: string, tab: SearchTab) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      if (tab === 'hashtags') {
        const res = await apiClient.get(`/search/hashtags?q=${encodeURIComponent(q)}`);
        if (res.data?.data && Array.isArray(res.data.data)) {
            setResults(res.data.data);
        } else if (res.data?.data && Array.isArray(res.data.data.data)) {
            setResults(res.data.data.data);
        } else {
            setResults([]);
        }
      } else {
        const res = await apiClient.get(`/search?type=${tab}&q=${encodeURIComponent(q)}`);
        if (res.data?.data && Array.isArray(res.data.data)) {
            setResults(res.data.data);
        } else if (res.data?.data?.data && Array.isArray(res.data.data.data)) {
            setResults(res.data.data.data);
        } else {
            setResults([]);
        }
      }
    } catch (e) {
      console.warn("Search failed", e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchResults(query, activeTab);
    }, 500);
    return () => clearTimeout(handler);
  }, [query, activeTab, fetchResults]);

  const renderTab = (tab: SearchTab, label: string) => (
    <TouchableOpacity
      style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
      onPress={() => setActiveTab(tab)}
    >
      <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: any }) => {
    if (activeTab === 'posts') {
      return (
        <PostCard
          post={item as Post}
          onLike={() => toggleLike(item.id)}
          onSave={() => toggleSave(item.id)}
          onComment={() => navigation.navigate('Comments', { post: item })}
          onShare={() => {}}
        />
      );
    }
    
    if (activeTab === 'people') {
      return (
        <TouchableOpacity
          style={styles.peopleRow}
          onPress={() => navigation.navigate('UserProfile', { user: item })}
        >
          <View style={styles.avatarBubble}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
            ) : (
              <Text style={{ fontSize: 18 }}>👾</Text>
            )}
          </View>
          <View style={styles.peopleInfo}>
            <Text style={styles.peopleName}>{item.name}</Text>
            <Text style={styles.peopleHandle}>@{item.username}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (activeTab === 'hashtags') {
      return (
        <TouchableOpacity style={styles.hashtagRow}>
            <View style={styles.hashIconBubble}>
                <Text style={styles.hashIcon}>#</Text>
            </View>
            <Text style={styles.hashtagText}>{item}</Text>
        </TouchableOpacity>
      )
    }

    return (
      <View style={styles.genericRow}>
        <Text style={{ color: colors.text.primary }}>
          {item.name || item.title || 'Result'}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header Search Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Taddlebox..."
            placeholderTextColor={colors.text.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View>
        <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={['posts', 'people', 'communities', 'events', 'hashtags'] as SearchTab[]}
            keyExtractor={item => item}
            contentContainerStyle={styles.tabsContainer}
            renderItem={({ item }) => renderTab(item, item.charAt(0).toUpperCase() + item.slice(1))}
        />
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primaryLight} />
        </View>
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          keyExtractor={(item, index) => item.id || `res-${index}`}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      ) : query.trim().length > 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>No results found for "{query}" in {activeTab}</Text>
        </View>
      ) : (
        <View style={styles.centerBox}>
          <Ionicons name="search-outline" size={64} color={colors.border} />
          <Text style={styles.emptyText}>Type something to start searching.</Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg.base,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.bg.surface,
    },
    backBtn: {
      padding: spacing.sm,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg.elevated,
      borderRadius: radii.full,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      marginRight: 8,
      fontSize: fontSizes.md,
      color: c.text.primary,
    },
    tabsContainer: {
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    tabBtn: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: radii.full,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    tabBtnActive: {
      backgroundColor: c.primaryLight,
      borderColor: c.primaryLight,
    },
    tabText: {
      fontSize: fontSizes.sm,
      fontWeight: '600',
      color: c.text.secondary,
    },
    tabTextActive: {
      color: '#fff',
    },
    listContent: {
      padding: spacing.md,
    },
    centerBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
    },
    emptyText: {
      marginTop: 16,
      fontSize: fontSizes.md,
      color: c.text.muted,
      textAlign: 'center',
    },
    peopleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg.card,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    avatarBubble: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      overflow: 'hidden',
    },
    avatarImg: {
      width: '100%',
      height: '100%',
    },
    peopleInfo: {
      flex: 1,
    },
    peopleName: {
      fontSize: fontSizes.md,
      fontWeight: '700',
      color: c.text.primary,
    },
    peopleHandle: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      marginTop: 2,
    },
    genericRow: {
      backgroundColor: c.bg.card,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    hashtagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg.card,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    hashIconBubble: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: c.bg.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    hashIcon: {
        color: c.text.secondary,
        fontWeight: 'bold',
    },
    hashtagText: {
        fontSize: fontSizes.md,
        fontWeight: '600',
        color: c.text.primary,
    }
  });
}
