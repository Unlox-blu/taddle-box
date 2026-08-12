'use strict';

const { getPaginationParams } = require('../../utils/pagination.util');

// Result groups the universal search can return, in the order they are
// interleaved for a non-empty query. The server owns the ORDER — the client
// renders the `results` array verbatim.
const UNIVERSAL_TYPES = ['posts', 'comments', 'media', 'people', 'communities', 'text'];
// Saved-content (bookmarked) mode — only content the user saved: posts,
// comments/media on those posts, and their saved events.
const BOOKMARKED_TYPES = ['posts', 'comments', 'media', 'events'];
// Discovery (empty query) keeps the classic section feel — people/communities/
// events/games first, then posts.
const DISCOVERY_TYPES = ['people', 'communities', 'events', 'games', 'posts', 'text'];

// Display labels for the result-type pills — returned alongside each type so
// the client renders the pill row verbatim (no client-side label map).
const TYPE_LABELS = {
  all: 'All',
  posts: 'Posts',
  comments: 'Comments',
  media: 'Media',
  people: 'People',
  communities: 'Communities',
  events: 'Events',
  games: 'Games',
  text: 'Hashtags',
};

// Shapes a result type as a labeled pill for the response.
const pill = (type) => ({ type, label: TYPE_LABELS[type] || type });
// Discovery inside Bookmarks — just the user's saved posts and events.
const DISCOVERY_BOOKMARKED_TYPES = ['posts', 'events'];

// Maps the TIME filter to a cutoff timestamp (null = all time).
const timeToCutoff = (time) => {
  const hours = {
    recent: 24,
    past_week: 24 * 7,
    past_month: 24 * 30,
    past_year: 24 * 365,
  }[String(time || '').trim().toLowerCase()];
  return hours ? new Date(Date.now() - hours * 3600 * 1000) : null;
};

// Parses the combined `filter` query param into its scoped parts. Accepts
// comma-separated tokens, optionally wrapped in [ ]:
//   "[c/community1, c/c2, @xkdj, @edfek, #dskm, hashtag2]"
// Tokens: c/<slug> → community, @<username> → person, #<tag> or a bare word
// → hashtag. All three combine (a post matches when it lives in one of the
// communities AND involves one of the people AND carries one of the tags).
const parseFilter = (filter = '') => {
  const raw = String(filter || '')
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/^"|"$/g, '');
  const communities = [];
  const people = [];
  const tags = [];
  raw.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((token) => {
      if (token.startsWith('c/')) communities.push(token.slice(2).trim());
      else if (token.startsWith('@')) people.push(token.slice(1).trim());
      else if (token.startsWith('#')) tags.push(token.slice(1).trim().toLowerCase());
      else tags.push(token.toLowerCase());
    });
  return {
    communities: [...new Set(communities.filter(Boolean))],
    people: [...new Set(people.filter(Boolean))],
    tags: [...new Set(tags.filter(Boolean))],
  };
};

// Normalizes the `type` pill param: '' / 'all' → mixed view, otherwise one of
// the known groups (falling back to mixed for unknown values).
const normalizeUniversalType = (type) => {
  const t = String(type || '').trim().toLowerCase();
  if (!t || t === 'all') return 'all';
  return UNIVERSAL_TYPES.includes(t) || DISCOVERY_TYPES.includes(t) ? t : 'all';
};

// Round-robin interleave across the non-empty groups, preserving each group's
// internal ranking. The result is the EXACT order the client renders.
const interleave = (groups) => {
  const out = [];
  let idx = 0;
  let remaining = groups.filter((g) => g.rows.length > 0);
  while (remaining.length) {
    const keep = [];
    for (const g of remaining) {
      if (idx < g.rows.length) out.push(g.rows[idx]);
      else continue;
      keep.push(g);
    }
    remaining = keep;
    idx += 1;
  }
  return out;
};

const tagRows = (rows, type) =>
  rows.map((r) => ({ ...r, itemType: type }));

class SearchService {
  constructor({ searchRepository }) {
    this.searchRepo = searchRepository;
  }

  // Unified search driven by the URL shape `search/?q=&sort=&filter=&type=`.
  // `filter` carries every scope in ONE comma-separated list — c/<slug> for
  // communities, @<user> for people, #<tag> or a bare word for hashtags.
  // The response returns the available result `types` (rendered as pills) and
  // a flat, ordered `results` array that may mix posts, comments, media,
  // people, communities and text rows — the client renders it verbatim.
  async universalSearch({
    q,
    sort = 'relevance',
    time = 'all_time',
    filter = '',
    type = 'all',
    page = 1,
    limit = 10,
    offset = 0,
    userId = null,
    bookmarked = null,
  }) {
    try {
      const query = String(q || '').trim();
      const { communities, people, tags } = parseFilter(filter);
      // The validator enforces the sort enum — no fallback needed here.
      const sortBy = sort;
      const timeCutoff = timeToCutoff(time);
      const requestedType = normalizeUniversalType(type);
      const bm = bookmarked === true || bookmarked === '1' || bookmarked === 1;
      const isDiscovery =
        !query &&
        communities.length === 0 &&
        people.length === 0 &&
        tags.length === 0;
      const order = isDiscovery
        ? bm
          ? DISCOVERY_BOOKMARKED_TYPES
          : DISCOVERY_TYPES
        : bm
          ? BOOKMARKED_TYPES
          : UNIVERSAL_TYPES;
      // Every group is sliced with the SAME limit+offset as the request so
      // pages are gapless and `hasNext` (page*limit < total) stays consistent.
      // (The old cap of 8/type made page 2 start at offset 10 with LIMIT 8,
      // skipping rows 8-9 of every type.)
      const perTypeLimit = limit;

      const searchGroup = async (group, lmt, off) => {
        try {
          switch (group) {
            case 'posts': {
              if (isDiscovery && !bm) {
                const d = await this.discoverPost({ userId, limit: lmt, offset: off });
                return { rows: d.data, total: d.total };
              }
              const { rows, total } = await this.searchRepo.searchPost(
                query,
                lmt,
                off,
                userId,
                communities,
                people,
                null,
                tags,
                bm ? true : null,
                null,
                sortBy,
                'contents',
                timeCutoff
              );
              return { rows, total };
            }
            case 'comments': {
              if (isDiscovery) return { rows: [], total: 0 };
              const { rows, total } = await this.searchRepo.searchComment(
                query,
                lmt,
                off,
                userId,
                {
                  community: communities,
                  author: people,
                  tag: tags,
                  sortBy,
                  bookmarked: bm ? true : null,
                  timeCutoff,
                }
              );
              return { rows, total };
            }
            case 'media': {
              if (isDiscovery) return { rows: [], total: 0 };
              const { rows, total } = await this.searchRepo.searchMedia(
                query,
                lmt,
                off,
                userId,
                {
                  community: communities,
                  author: people,
                  tag: tags,
                  sortBy,
                  bookmarked: bm ? true : null,
                  timeCutoff,
                }
              );
              return { rows, total };
            }
            case 'people': {
              // A person filter (@user) already scopes content to those people
              // — searching for people themselves is redundant.
              if (people.length) return { rows: [], total: 0 };
              if (isDiscovery) {
                const d = await this.discoverPeople({ userId, page, limit: lmt, offset: off });
                return { rows: d.data, total: d.total };
              }
              const { rows, total } = await this.searchRepo.searchUser(query, lmt, off);
              return { rows, total };
            }
            case 'communities': {
              // A community filter (c/<slug>) scopes content to those
              // communities — searching for the communities themselves is
              // redundant.
              if (communities.length) return { rows: [], total: 0 };
              if (isDiscovery) {
                const d = await this.discoverCommunity({ userId, page, limit: lmt, offset: off });
                return { rows: d.data, total: d.total };
              }
              const { rows, total } = await this.searchRepo.searchCommunity(
                query,
                null,
                lmt,
                off
              );
              return { rows, total };
            }
            case 'events': {
              if (isDiscovery && !bm) {
                const d = await this.discoverEvents({ limit: lmt, offset: off });
                return { rows: d.data, total: d.total };
              }
              // Saved-events scope (search from Bookmarks).
              if (bm) {
                const { rows, total } = await this.searchRepo.searchEvent(
                  query,
                  null,
                  lmt,
                  off,
                  true,
                  userId
                );
                return { rows, total };
              }
              return { rows: [], total: 0 };
            }
            case 'games': {
              if (isDiscovery) {
                const d = await this.discoverGames({ limit: lmt, offset: off });
                return { rows: d.data, total: d.total };
              }
              return { rows: [], total: 0 };
            }
            case 'text': {
              if (isDiscovery) return { rows: [], total: 0 };
              const hashtags = await this.searchRepo.getHashtags(query);
              return {
                rows: hashtags.slice(0, lmt).map((h) => ({ text: h })),
                total: hashtags.length,
              };
            }
            default:
              return { rows: [], total: 0 };
          }
        } catch (error) {
          throw error;
        }
      };

      // A specific pill is selected → results come from that group only (full
      // pagination); the other groups are probed (1 row each) so the pill list
      // still reflects what exists for this query.
      if (requestedType !== 'all') {
        const { rows, total } = await searchGroup(requestedType, limit, offset);
        const probes = await Promise.all(
          order
            .filter((g) => g !== requestedType)
            .map(async (g) => ({
              type: g,
              has: (await searchGroup(g, 1, 0)).total > 0,
            }))
        );
        // 'all' is always the first pill — the client renders the server's
        // `types` verbatim (no client-side defaults or label map).
        return {
          dataType: 'universal',
          data: {
            types: [
              'all',
              requestedType,
              ...probes.filter((p) => p.has).map((p) => p.type),
            ].map(pill),
            results: tagRows(rows, requestedType),
            filter: { communities, people, tags },
          },
          total,
          hasNext: total > page * limit,
        };
      }

      // Mixed view — fetch every group in parallel (one page per type) and
      // interleave the rows round-robin. The server owns the ordering.
      const groups = await Promise.all(
        order.map(async (g) => {
          const r = await searchGroup(g, perTypeLimit, offset);
          return { type: g, rows: r.rows, total: r.total };
        })
      );
      const nonEmpty = groups.filter((g) => g.rows.length > 0);
      const results = interleave(
        nonEmpty.map((g) => ({ type: g.type, rows: tagRows(g.rows, g.type) }))
      );
      // 'all' is always the first pill — the client renders the server's
      // `types` verbatim (no client-side defaults or label map).
      const types = ['all', ...nonEmpty.map((g) => g.type)].map(pill);
      const total = groups.reduce((sum, g) => sum + g.total, 0);
      // hasNext is per-GROUP (any type still has rows beyond this page), not
      // the summed total — the sum would keep "has next" alive after a type
      // is exhausted, sending the client on wasted empty pages.
      const hasNext = groups.some((g) => g.total > page * perTypeLimit);
      return {
        dataType: 'universal',
        data: {
          types,
          results,
          filter: { communities, people, tags },
        },
        total,
        hasNext,
      };
    } catch (error) {
      throw error;
    }
  }

  // Mention-autocomplete suggestions — a DEDICATED people endpoint for the
  // composer's @mention autocomplete.
  async suggestPeople(query, limit = 10) {
    try {
      const { rows } = await this.searchRepo.searchUser(
        String(query || ''),
        limit,
        0
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  async discoverPost({ userId, limit, offset }) {
    try {
      const userInterests = await this.searchRepo.getUserInterests(userId);
      const interests = userInterests.map((item) =>
        item.replace(/^\p{Extended_Pictographic}\s*/u, '')
      );

      const { rows, total } = await this.searchRepo.discoverPost({
        userId,
        interests,
        limit,
        offset,
      });
      return { dataType: 'posts', data: rows, total };
    } catch (error) {
      throw error;
    }
  }

  async discoverCommunity({ userId, page, limit, offset }) {
    try {
      const userInterests = await this.searchRepo.getUserInterests(userId);
      const interests = userInterests.map((item) =>
        item.replace(/^\p{Extended_Pictographic}\s*/u, '')
      );
      const communityId = await this.getFollowingCommunityIds({ userId, page });

      const { rows, total } = await this.searchRepo.discoverCommunity({
        interests,
        communityId,
        limit,
        offset,
      });
      return { dataType: 'communities', data: rows, total };
    } catch (error) {
      throw error;
    }
  }

  async discoverPeople({ userId, page, limit, offset }) {
    try {
      const userInterests = await this.searchRepo.getUserInterests(userId);
      const interests = userInterests.map((item) =>
        item.replace(/^\p{Extended_Pictographic}\s*/u, '')
      );
      const followingId = await this.getFollowingUserIds({ userId, page });

      const { rows, total } = await this.searchRepo.discoverPeople({
        interests,
        userId,
        followingId,
        limit,
        offset,
      });
      return { dataType: 'people', data: rows, total };
    } catch (error) {
      throw error;
    }
  }

  async discoverEvents({ limit, offset }) {
    try {
      const { rows, total } = await this.searchRepo.searchEvent('', '', limit, offset);
      return { dataType: 'events', data: rows, total };
    } catch (error) {
      throw error;
    }
  }

  async discoverGames({ limit, offset }) {
    try {
      const { rows, total } = await this.searchRepo.searchGame('', limit, offset);
      return { dataType: 'games', data: rows, total };
    } catch (error) {
      throw error;
    }
  }

  async getHashtags(q = '') {
    try {
      return await this.searchRepo.getHashtags(q);
    } catch (error) {
      throw error;
    }
  }

  async getFollowingUserIds({ userId, page }) {
    try {
      const { limit, offset } = getPaginationParams({ page });
      const { total, followings } = await this.searchRepo.findFollowers(userId, limit, offset);
      const followingId = followings.map((ele) => ele.followingid);
      return followingId;
    } catch (error) {
      throw error;
    }
  }

  async getFollowingCommunityIds({ userId, page }) {
    try {
      const { limit, offset } = getPaginationParams({ page });
      const { total, communities } = await this.searchRepo.findFollowingCommunity(
        userId,
        limit,
        offset
      );
      const communityId = communities.map((ele) => ele.communityid);
      return communityId;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = SearchService;
