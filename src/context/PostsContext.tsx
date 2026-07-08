import React, { createContext, useContext, useReducer } from 'react';
import type { Post } from '../types';
import { POSTS } from '../types/mockData';

// ─── State & Actions ────────────────────────────────────────────────────────

type State = {
  posts: Post[];
};

type Action =
  | { type: 'ADD_POST';    post: Post }
  | { type: 'TOGGLE_LIKE'; id: string }
  | { type: 'TOGGLE_SAVE'; id: string }
  | { type: 'DELETE_POST'; id: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_POST':
      // Prepend so it appears at top of feed
      return { ...state, posts: [action.post, ...state.posts] };

    case 'TOGGLE_LIKE':
      return {
        ...state,
        posts: state.posts.map(p =>
          p.id !== action.id ? p : {
            ...p,
            isLiked: !p.isLiked,
            likes: p.isLiked ? p.likes - 1 : p.likes + 1,
          }
        ),
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

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

type PostsContextType = {
  posts: Post[];
  addPost:    (post: Post) => void;
  toggleLike: (id: string) => void;
  toggleSave: (id: string) => void;
  deletePost: (id: string) => void;
};

const PostsContext = createContext<PostsContextType>({
  posts:      [],
  addPost:    () => {},
  toggleLike: () => {},
  toggleSave: () => {},
  deletePost: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function PostsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { posts: POSTS });

  const value: PostsContextType = {
    posts: state.posts,

    // When you add a real API: await api.createPost(post), then dispatch
    addPost: (post) => dispatch({ type: 'ADD_POST', post }),

    // When you add a real API: api.toggleLike(id) (optimistic update already done)
    toggleLike: (id) => dispatch({ type: 'TOGGLE_LIKE', id }),

    // When you add a real API: api.toggleSave(id)
    toggleSave: (id) => dispatch({ type: 'TOGGLE_SAVE', id }),

    deletePost: (id) => dispatch({ type: 'DELETE_POST', id }),
  };

  return <PostsContext.Provider value={value}>{children}</PostsContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export const usePosts = () => useContext(PostsContext);
