import { apiClient } from "./apiClient";

export type SearchType =
  | "all"
  | "posts"
  | "people"
  | "communities"
  | "events"
  | "games"
  | "hashtags";

export type AllSearchResults = {
  people: any[];
  communities: any[];
  events: any[];
  games: any[];
  posts: any[];
  hashtags: string[];
};

// The backend wraps data as { dataType, data, ...meta }. Extract the inner list
// regardless of whether it's nested or flat, and tag each row with its item type.
const extractData = (res: any): any[] => {
  let data = res?.data?.data;
  if (Array.isArray(data?.data)) data = data.data;
  return Array.isArray(data) ? data : [];
};

export const searchService = {
  /** One request for everything (people, communities, events, games, posts, hashtags). */
  searchAll: async (q = "", limit = 6): Promise<AllSearchResults> => {
    const res = await apiClient.get(
      `/search/all?q=${encodeURIComponent(q)}&limit=${limit}`,
    );
    // Response shape: { data: { dataType, data: { people, posts, ... } } }
    const data = res?.data?.data?.data || res?.data?.data || {};
    return {
      people: Array.isArray(data.people) ? data.people : [],
      communities: Array.isArray(data.communities) ? data.communities : [],
      events: Array.isArray(data.events) ? data.events : [],
      games: Array.isArray(data.games) ? data.games : [],
      posts: Array.isArray(data.posts) ? data.posts : [],
      hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
    };
  },

  /** Single-type search used by the individual tabs. */
  searchByType: async (type: Exclude<SearchType, "all">, q = "", filter = "") => {
    const res = await apiClient.get(
      `/search?type=${type}&q=${encodeURIComponent(q)}${
        filter ? `&filter=${encodeURIComponent(filter)}` : ""
      }`,
    );
    return extractData(res).map((item: any) => ({ ...item, itemType: type }));
  },

  getHashtags: async (q = ""): Promise<string[]> => {
    const res = await apiClient.get(`/search/hashtags?q=${encodeURIComponent(q)}`);
    const data = extractData(res);
    return data.map((h: any) => (typeof h === "string" ? h : h?.hashtag || h?.text || ""));
  },
};
