import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { Community } from '../types';
import { communityService } from '../services/community.service';

// ─── State & Actions ─────────────────────────────────────────────

type State = { 
  communities: Community[];
  isLoading: boolean;
  page: number;
  hasMore: boolean;
};

type Action =
  | { type: 'SET_COMMUNITIES'; communities: Community[]; page: number; hasMore: boolean }
  | { type: 'APPEND_COMMUNITIES'; communities: Community[]; page: number; hasMore: boolean }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'TOGGLE_JOIN'; id: string }
  | { type: 'ADD_COMMUNITY'; community: Community };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_COMMUNITIES':
      return { ...state, communities: action.communities, page: action.page, hasMore: action.hasMore, isLoading: false };
    case 'APPEND_COMMUNITIES':
      return { ...state, communities: [...state.communities, ...action.communities], page: action.page, hasMore: action.hasMore, isLoading: false };
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    case 'TOGGLE_JOIN':
      return {
        ...state,
        communities: state.communities.map(c =>
          c.id !== action.id ? c : {
            ...c,
            isJoined: !c.isJoined,
            memberCount: c.isJoined ? Math.max(0, c.memberCount - 1) : c.memberCount + 1,
          }
        ),
      };
    case 'ADD_COMMUNITY':
      return { ...state, communities: [action.community, ...state.communities] };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────

type CommunityContextType = {
  communities:   Community[];
  isLoading:     boolean;
  hasMore:       boolean;
  fetchCommunities: (refresh?: boolean) => Promise<void>;
  toggleJoin:    (id: string) => Promise<void>;
  addCommunity:  (communityData: any) => Promise<void>; // Or replace with specific service if needed
};

const CommunityContext = createContext<CommunityContextType>({
  communities:  [],
  isLoading:    false,
  hasMore:      true,
  fetchCommunities: async () => {},
  toggleJoin:   async () => {},
  addCommunity: async () => {},
});

// ─── Provider ────────────────────────────────────────────────────

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { communities: [], isLoading: false, page: 1, hasMore: true });

  const fetchCommunities = useCallback(async (refresh = false) => {
    if (state.isLoading || (!state.hasMore && !refresh)) return;

    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      const nextPage = refresh ? 1 : state.page + 1;
      const res = await communityService.getCommunities(nextPage, 20);
      const newCommunities = res.data || [];
      const hasMore = newCommunities.length === 20;

      if (refresh) {
        dispatch({ type: 'SET_COMMUNITIES', communities: newCommunities, page: 1, hasMore });
      } else {
        dispatch({ type: 'APPEND_COMMUNITIES', communities: newCommunities, page: nextPage, hasMore });
      }
    } catch (e) {
      console.error('Failed to fetch communities:', e);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, [state.isLoading, state.hasMore, state.page]);

  const toggleJoin = async (id: string) => {
    const community = state.communities.find(c => c.id === id);
    if (!community) return;

    // Optimistic UI update
    dispatch({ type: 'TOGGLE_JOIN', id });
    try {
      if (community.isJoined) {
        await communityService.leaveCommunity(id);
      } else {
        await communityService.joinCommunity(id);
      }
    } catch (e) {
      // Revert on failure
      dispatch({ type: 'TOGGLE_JOIN', id });
      console.error('Failed to toggle community join status:', e);
    }
  };

  const value: CommunityContextType = {
    communities:  state.communities,
    isLoading:    state.isLoading,
    hasMore:      state.hasMore,
    fetchCommunities,
    toggleJoin,
    addCommunity: async (communityData: any) => {
      try {
        const res = await communityService.createCommunity(communityData);
        if (res.data) {
          dispatch({ type: 'ADD_COMMUNITY', community: res.data });
        }
      } catch (e) {
        console.error('Failed to create community:', e);
        throw e;
      }
    },
  };

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────

export const useCommunities = () => useContext(CommunityContext);
