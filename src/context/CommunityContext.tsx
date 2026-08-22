import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import type { Community } from '../types';
import { communityService } from '../services/community.service';
import { error } from '../utils/logger';

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
  | { type: 'SET_PENDING'; id: string }
  | { type: 'CLEAR_PENDING'; id: string }
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
            isPending: false,
            memberCount: c.isJoined ? Math.max(0, c.memberCount - 1) : c.memberCount + 1,
          }
        ),
      };
    case 'SET_PENDING':
      return {
        ...state,
        communities: state.communities.map(c =>
          c.id !== action.id ? c : { ...c, isPending: true, isJoined: false },
        ),
      };
    case 'CLEAR_PENDING':
      return {
        ...state,
        communities: state.communities.map(c =>
          c.id !== action.id ? c : { ...c, isPending: false },
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
  /** Join/leave (or send/cancel a join request). Accepts the community itself
      so screens that hold a Community object work even when the context list
      isn't loaded yet (e.g. the community detail screen opened from search). */
  toggleJoin:    (id: string | Community) => Promise<void>;
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
      error('Failed to fetch communities:', e);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, [state.isLoading, state.hasMore, state.page]);

  const toggleJoin = async (idOrCommunity: string | Community) => {
    const community =
      typeof idOrCommunity === 'string'
        ? state.communities.find(c => c.id === idOrCommunity)
        : idOrCommunity;
    if (!community) return;
    const id = community.id;

    // Private communities: not-joined → send a join REQUEST (pending), and a
    // pending request can be cancelled. Active membership joins/leaves as before.
    const isPrivate = community.privacy === 'private';

    if (community.isPending) {
      // Cancel the pending request (a pending member was never counted).
      dispatch({ type: 'CLEAR_PENDING', id });
      try {
        await communityService.leaveCommunity(id);
      } catch (e) {
        dispatch({ type: 'SET_PENDING', id });
        error('Failed to cancel join request:', e);
      }
    } else if (community.isJoined) {
      dispatch({ type: 'TOGGLE_JOIN', id });
      try {
        await communityService.leaveCommunity(id);
      } catch (e) {
        dispatch({ type: 'TOGGLE_JOIN', id });
        error('Failed to leave community:', e);
      }
    } else if (isPrivate) {
      dispatch({ type: 'SET_PENDING', id });
      try {
        await communityService.joinCommunity(id);
      } catch (e) {
        dispatch({ type: 'CLEAR_PENDING', id });
        error('Failed to request community join:', e);
      }
    } else {
      dispatch({ type: 'TOGGLE_JOIN', id });
      try {
        await communityService.joinCommunity(id);
      } catch (e) {
        dispatch({ type: 'TOGGLE_JOIN', id });
        error('Failed to join community:', e);
      }
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
        error('Failed to create community:', e);
        throw e;
      }
    },
  };

  return <CommunityContext.Provider value={useMemo(() => value, [state.communities, state.isLoading, state.hasMore])}>{children}</CommunityContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────

export const useCommunities = () => useContext(CommunityContext);
