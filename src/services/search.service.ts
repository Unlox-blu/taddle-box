import { apiClient } from "./apiClient";

export type SearchType =
  | "all"
  | "posts"
  | "people"
  | "communities"
  | "events"
  | "games"
  | "hashtags";

export type UniversalResultType =
  | "posts"
  | "comments"
  | "media"
  | "people"
  | "communities"
  | "events"
  | "games"
  | "text";

export type UniversalSearchResults = {
  /** Result-type pills the server computed for this query, each carrying its
      display label — the client renders them verbatim, no label map needed. */
  types: { type: string; label: string }[];
  /** Flat, ordered, heterogeneous result rows. Each item carries an `itemType`
      (posts | comments | media | people | communities | events | games | text)
      so the client can render it — the client never reorders this list. */
  results: any[];
  total: number;
  hasNext: boolean;
  page: number;
};

export const searchService = {
  /** Unified search — the ONLY search the app uses. URL param order:
      `search/?filter=&q=&sort=&time=&type=&bookmarked=&page=&limit=` where
      `sort` is relevance | top | latest | hot, the TIME window is
      `time=recent | past_week | past_month | past_year | all_time`, `filter`
      is ONE comma-separated list of scoped tokens (c/<slug> for communities,
      @<user> for people, #<tag> or a bare word for hashtags) and `type` is the
      active result pill ("all" = mixed view). The server returns the available
      `types` (pills) plus an ordered `results` array that may mix posts,
      comments, media, people, communities, events and text rows. */
  universalSearch: async ({
    q,
    sort,
    time,
    filter,
    type,
    bookmarked,
    page,
    limit,
  }: {
    q?: string;
    sort?: string;
    time?: string;
    filter?: string;
    type?: string;
    bookmarked?: string;
    page?: number;
    limit?: number;
  }): Promise<UniversalSearchResults> => {
    // Built manually (not URLSearchParams) to keep the param order stable.
    // Order: filter → q → sort → time → type → bookmarked → page → limit.
    // No version marker — there is no legacy search anymore.
    const parts: string[] = [];
    if (filter) parts.push(`filter=${encodeURIComponent(filter)}`);
    if (q) parts.push(`q=${encodeURIComponent(q)}`);
    if (sort) parts.push(`sort=${encodeURIComponent(sort)}`);
    // TIME window as the explicit param: &time=recent | &time=past_week |
    // &time=past_month | &time=past_year | &time=all_time.
    if (time) parts.push(`time=${encodeURIComponent(time)}`);
    // "all" is the backend's default mixed view — omit it so the default URL
    // stays clean (?sort=relevance&time=all_time&page=1&limit=10). Only real type
    // filters (events, games, communities, …) are sent.
    if (type && type !== "all") parts.push(`type=${encodeURIComponent(type)}`);
    if (bookmarked) parts.push(`bookmarked=${encodeURIComponent(bookmarked)}`);
    parts.push(`page=${page || 1}`);
    parts.push(`limit=${limit || 10}`);
    const res = await apiClient.get(`/search?${parts.join("&")}`);
    // Response shape: { data: { dataType, data: { types, results } } }
    const data = res?.data?.data?.data || {};
    const meta = res?.data?.meta;
    return {
      types: Array.isArray(data.types) ? data.types : [],
      results: Array.isArray(data.results) ? data.results : [],
      total: meta?.total ?? 0,
      hasNext: meta?.hasNext ?? false,
      page: meta?.page ?? page ?? 1,
    };
  },
};
