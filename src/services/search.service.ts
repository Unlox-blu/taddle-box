import { apiClient } from "./apiClient";

export type SearchType = string;
export type UniversalResultType = string;

export type UniversalSearchResults = {
  /** Result-type pills the server computed for this query, each carrying its
      display label — the client renders them verbatim, no label map needed.
      The notifications scope also carries a per-bucket `count`. */
  types: { type: string; label: string; count?: number }[];
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
    scope,
    q,
    sort,
    time,
    filter,
    type,
    page,
    limit,
  }: {
    scope?: 'global' | 'bookmarks' | 'notifications' | 'messages';
    q?: string;
    sort?: string;
    time?: string;
    filter?: string;
    type?: string;
    page?: number;
    limit?: number;
  }): Promise<UniversalSearchResults> => {
    // Built manually (not URLSearchParams) to keep the param order stable.
    // Order: scope → filter → q → sort → time → type → page → limit.
    // No version marker — there is no legacy search anymore.
    const parts: string[] = [];
    if (scope && scope !== 'global') parts.push(`scope=${encodeURIComponent(scope)}`);
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
    parts.push(`page=${page || 1}`);
    parts.push(`limit=${limit || 10}`);
    const res = await apiClient.get(`/search?${parts.join("&")}`);
    // Response shape: { success: true, data: { items, types, pagination, query, filter } }
    const responseData = res?.data?.data || {};
    return {
      types: Array.isArray(responseData.types) ? responseData.types : [],
      results: Array.isArray(responseData.items) ? responseData.items : [],
      total: responseData.pagination?.total ?? 0,
      hasNext: responseData.pagination?.hasNext ?? false,
      page: responseData.pagination?.page ?? page ?? 1,
    };
  },
};
