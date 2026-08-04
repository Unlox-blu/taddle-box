import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { Post } from '../types';
import { postsService } from '../services/posts.service';

// ─── State & Actions ────────────────────────────────────────────────────────

type State = {
  posts: Post[];
  isLoading: boolean;
  page: number;
  hasMore: boolean;
};

type Action =
  | { type: 'SET_POSTS';   posts: Post[]; page: number; hasMore: boolean }
  | { type: 'APPEND_POSTS'; posts: Post[]; page: number; hasMore: boolean }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'ADD_POST';    post: Post }
  | { type: 'TOGGLE_LIKE'; id: string }
  | { type: 'TOGGLE_SAVE'; id: string }
  | { type: 'DELETE_POST'; id: string }
  | { type: 'UPDATE_COMMENT_COUNT'; id: string; delta: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_POSTS':
      return { ...state, posts: action.posts, page: action.page, hasMore: action.hasMore, isLoading: false };

    case 'APPEND_POSTS':
      return { ...state, posts: [...state.posts, ...action.posts], page: action.page, hasMore: action.hasMore, isLoading: false };

    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };

    case 'ADD_POST':
      return { ...state, posts: [action.post, ...state.posts] };

    case 'TOGGLE_LIKE':
      return {
        ...state,
        posts: state.posts.map(p => {
          if (p.id !== action.id) return p;
          const currentLikes = p.likes ?? (p as any).likesCount ?? 0;
          const newLikes = p.isLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
          return {
            ...p,
            isLiked: !p.isLiked,
            likes: newLikes,
            likesCount: newLikes,
          };
        }),
      };

    case 'TOGGLE_SAVE':
      return {
        ...state,
        posts: state.posts.map(p =>
          p.id !== action.id ? p : { ...p, isSaved: !p.isSaved }
        ),
      };

    case 'DELETE_POST':
      return { ...state, posts: state.posts.filter(p => p.id !== action.id) };

    case 'UPDATE_COMMENT_COUNT':
      return {
        ...state,
        posts: state.posts.map(p => {
          if (p.id !== action.id) return p;
          const current = p.comments ?? (p as any).commentsCount ?? 0;
          const next = Math.max(0, current + action.delta);
          return { ...p, comments: next, commentsCount: next };
        }),
      };

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

type PostsContextType = {
  posts: Post[];
  isLoading: boolean;
  hasMore: boolean;
  fetchFeed: (refresh?: boolean) => Promise<void>;
  addPost:    (postData: any) => Promise<void>;
  toggleLike: (id: string) => Promise<void>;
  toggleSave: (id: string) => Promise<void>;
  deletePost: (id: string) => Promise<void>;
  /** Optimistically bump a post's displayed comment count by delta (±1). */
  updateCommentCount: (id: string, delta: number) => void;
};

const PostsContext = createContext<PostsContextType>({
  posts:      [],
  isLoading:  false,
  hasMore:    true,
  fetchFeed:  async () => {},
  addPost:    async () => {},
  toggleLike: async () => {},
  toggleSave: async () => {},
  deletePost: async () => {},
  updateCommentCount: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function PostsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { posts: [], isLoading: false, page: 1, hasMore: true });

  const fetchFeed = useCallback(async (refresh = false) => {
    if (state.isLoading || (!state.hasMore && !refresh)) return;

    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      const nextPage = refresh ? 1 : state.page + 1;
      const res = await postsService.getFeed(nextPage, 20);
      const newPosts = Array.isArray(res) ? res : (res.data || []);
      const hasMore = newPosts.length === 20;

      if (refresh) {
        dispatch({ type: 'SET_POSTS', posts: newPosts, page: 1, hasMore });
      } else {
        dispatch({ type: 'APPEND_POSTS', posts: newPosts, page: nextPage, hasMore });
      }
    } catch (e) {
      console.error('Failed to fetch feed:', e);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, [state.isLoading, state.hasMore, state.page]);

  const value: PostsContextType = {
    posts: state.posts,
    isLoading: state.isLoading,
    hasMore: state.hasMore,
    fetchFeed,

    addPost: async (postData) => {
      try {
        const res = await postsService.createPost(postData);
        if (res.data) {
          dispatch({ type: 'ADD_POST', post: res.data });
        }
      } catch (e) {
        console.error('Failed to create post:', e);
        throw e;
      }
    },

    toggleLike: async (id) => {
      // Find current state
      const post = state.posts.find(p => p.id === id);
      if (!post) return;
      const isCurrentlyLiked = !!post.isLiked;

      // Optimistic UI update
      dispatch({ type: 'TOGGLE_LIKE', id });
      try {
        await postsService.toggleLike(id, isCurrentlyLiked);
      } catch (e) {
        // Revert on failure
        dispatch({ type: 'TOGGLE_LIKE', id });
        console.error('Failed to toggle like:', e);
      }
    },

    toggleSave: async (id) => {
      // Find current state
      const post = state.posts.find(p => p.id === id);
      if (!post) return;
      const isCurrentlySaved = !!post.isSaved;

      // Optimistic UI update
      dispatch({ type: 'TOGGLE_SAVE', id });
      try {
        await postsService.toggleSave(id, isCurrentlySaved);
      } catch (e) {
        // Revert on failure
        dispatch({ type: 'TOGGLE_SAVE', id });
        console.error('Failed to toggle save:', e);
      }
    },

    deletePost: async (id) => {
      // Optimistic UI update
      const backup = state.posts.find(p => p.id === id);
      dispatch({ type: 'DELETE_POST', id });
      try {
        await postsService.deletePost(id);
      } catch (e) {
        // Revert on failure
        if (backup) {
          dispatch({ type: 'ADD_POST', post: backup });
        }
        console.error('Failed to delete post:', e);
      }
    },

    updateCommentCount: (id, delta) => {
      dispatch({ type: 'UPDATE_COMMENT_COUNT', id, delta });
    },
  };

  return <PostsContext.Provider value={value}>{children}</PostsContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export const usePosts = () => useContext(PostsContext);
