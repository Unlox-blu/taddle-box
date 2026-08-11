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
  /** Ordered sections from the server — the API owns the layout order and may
      repeat a type (each occurrence renders as its own section). Falls back to
      the flat keys in canonical order when absent (older servers). */
  sections?: { type: string; items: any[] }[];
};

// The backend wraps data as { dataType, data, ...meta }. Extract the inner list
// regardless of whether it's nested or flat, and tag each row with its item type.
const extractData = (res: any): any[] => {
  let data = res?.data?.data;
  if (Array.isArray(data?.data)) data = data.data;
  return Array.isArray(data) ? data : [];
};

export const searchService = {
  /** One request for everything (people, communities, events, games, posts, hashtags).
      `community` (a slug) scopes the POSTS section to that community, and
      `author` (a username) scopes it to that user's posts — they combine. */
  searchAll: async (
    q = "",
    limit = 6,
    community = "",
    author = "",
    tag = "",
    bookmarked = "",
    mine = "",
    sortBy = "",
    postFilter = "",
  ): Promise<AllSearchResults> => {
    const res = await apiClient.get(
      `/search/all?q=${encodeURIComponent(q)}&limit=${limit}${
        community ? `&community=${encodeURIComponent(community)}` : ""
      }${author ? `&author=${encodeURIComponent(author)}` : ""}${
        tag ? `&tag=${encodeURIComponent(tag)}` : ""
      }${bookmarked ? `&bookmarked=${encodeURIComponent(bookmarked)}` : ""}${
        mine ? `&mine=${encodeURIComponent(mine)}` : ""
      }${sortBy ? `&sortBy=${encodeURIComponent(sortBy)}` : ""}${
        postFilter ? `&post_filter=${encodeURIComponent(postFilter)}` : ""
      }`,
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
      sections: Array.isArray(data.sections) ? data.sections : undefined,
    };
  },

  /** Single-type search used by the individual tabs — paginated. Returns the
      rows plus the server's total/hasNext so the screen can infinite-scroll. */
  searchByType: async (
    type: Exclude<SearchType, "all">,
    q = "",
    page = 1,
    limit = 10,
    filter = "",
    community = "",
    author = "",
    involvement = "",
    tag = "",
    bookmarked = "",
    mine = "",
    sortBy = "",
    postFilter = "",
  ): Promise<{ items: any[]; total: number; hasNext: boolean; page: number }> => {
    const res = await apiClient.get(
      `/search?type=${type}&q=${encodeURIComponent(q)}&page=${page}&limit=${limit}${
        filter ? `&filter=${encodeURIComponent(filter)}` : ""
      }${community ? `&community=${encodeURIComponent(community)}` : ""}${
        author ? `&author=${encodeURIComponent(author)}` : ""
      }${involvement ? `&involvement=${encodeURIComponent(involvement)}` : ""}${
        tag ? `&tag=${encodeURIComponent(tag)}` : ""
      }${bookmarked ? `&bookmarked=${encodeURIComponent(bookmarked)}` : ""}${
        mine ? `&mine=${encodeURIComponent(mine)}` : ""
      }${sortBy ? `&sortBy=${encodeURIComponent(sortBy)}` : ""}${
        postFilter ? `&post_filter=${encodeURIComponent(postFilter)}` : ""
      }`,
    );
    const items = extractData(res).map((item: any) => ({ ...item, itemType: type }));
    const meta = res?.data?.meta;
    return {
      items,
      total: meta?.total ?? 0,
      hasNext: meta?.hasNext ?? items.length === limit,
      page: meta?.page ?? page,
    };
  },

  getHashtags: async (q = ""): Promise<string[]> => {
    const res = await apiClient.get(`/search/hashtags?q=${encodeURIComponent(q)}`);
    const data = extractData(res);
    return data.map((h: any) => (typeof h === "string" ? h : h?.hashtag || h?.text || ""));
  },
};
