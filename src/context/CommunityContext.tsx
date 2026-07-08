import React, { createContext, useContext, useReducer } from 'react';
import type { Community } from '../types';
import { COMMUNITIES } from '../types/mockData';

// ─── State & Actions ─────────────────────────────────────────────

type State = { communities: Community[] };

type Action =
  | { type: 'TOGGLE_JOIN';    id: string }
  | { type: 'ADD_COMMUNITY';  community: Community };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'TOGGLE_JOIN':
      return {
        ...state,
        communities: state.communities.map(c =>
          c.id !== action.id ? c : {
            ...c,
            isJoined: !c.isJoined,
            members:  c.isJoined ? c.members - 1 : c.members + 1,
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
  toggleJoin:    (id: string) => void;
  addCommunity:  (community: Community) => void;
};

const CommunityContext = createContext<CommunityContextType>({
  communities:  [],
  toggleJoin:   () => {},
  addCommunity: () => {},
});

// ─── Provider ────────────────────────────────────────────────────

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { communities: COMMUNITIES });

  const value: CommunityContextType = {
    communities:  state.communities,
    toggleJoin:   (id)        => dispatch({ type: 'TOGGLE_JOIN', id }),
    addCommunity: (community) => dispatch({ type: 'ADD_COMMUNITY', community }),
  };

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────

export const useCommunities = () => useContext(CommunityContext);
