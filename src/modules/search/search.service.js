'use strict';

const { getPaginationParams } = require('../../utils/pagination.util');
const { timeToCutoff } = require('../../utils/time.util');
const notificationRepository = require('../notification/notification.repository');
const { NOTIFICATION_TYPE_BUCKETS } = require('../notification/notification.constants');
const PostModel = require('../post/post.model');
const UserModel = require('../user/user.model');
const CommunityModel = require('../community/community.model');
const CommentModel = require('../comment/comment.model');
const EventModel = require('../event/event.model');
const GameModel = require('../game/game.model');

const UNIVERSAL_TYPES = ['posts', 'people', 'communities', 'events', 'polls', 'comments', 'media', 'games', 'text'];

const BOOKMARKED_TYPES = ['posts', 'people', 'communities'];

const MESSAGES_TYPES = ['messages'];

const DISCOVERY_TYPES = ['posts', 'people', 'communities', 'events', 'polls', 'comments', 'media', 'games', 'text'];

const FILTER_TYPES = ['posts', 'media', 'comments', 'text']

const NOTIFICATIONS_TYPES = ['likes', 'comments', 'follows'];

const DISCOVERY_BOOKMARKED_TYPES = ['people', 'communities', 'posts', 'events'];


const TYPE_LABELS = {
  all: 'All',
  posts: 'Posts',
  polls: 'Polls',
  comments: 'Comments',
  media: 'Media',
  people: 'People',
  communities: 'Communities',
  events: 'Events',
  games: 'Games',
  text: 'Hashtags',
  likes: 'Likes',
  follows: 'Follows',
  messages: 'Messages',
};

const pill = (type, count) => ({
  type,
  label: TYPE_LABELS[type] || type,
  ...(count !== undefined ? { count } : {}),
});



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

const normalizeUniversalType = (type) => {
  const t = String(type || '').trim().toLowerCase();
  if (!t || t === 'all') return 'all';
  return UNIVERSAL_TYPES.includes(t) ||
    DISCOVERY_TYPES.includes(t) ||
    NOTIFICATIONS_TYPES.includes(t)
    ? t
    : 'all';
};

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

const { envelopeItem } = require('../../utils/envelope.util');

const SINGULAR_MAP = {
  posts: 'post',
  people: 'person',
  communities: 'community',
  events: 'event',
  polls: 'poll',
  comments: 'comment',
  media: 'media',
  games: 'game',
  text: 'text',
  messages: 'message'
};

const tagRows = (rows, type) =>
  rows.map((r) => {
    if (r.itemType) return r; // already wrapped by the query (e.g. injected headers)
    const { total, score, highlight, highlight_content, ...rest } = r;
    // Some legacy highlight structure might use highlight_content, wrap it properly if so
    const finalHighlight = highlight || (highlight_content ? { content: highlight_content } : undefined);
    return envelopeItem(SINGULAR_MAP[type] || type, rest, { 
      ...(score !== undefined && { score }),
      ...(finalHighlight && { highlight: finalHighlight }) 
    });
  });

class SearchService {
  constructor({ searchRepository, bookmarkService, notificationService }) {
    this.searchRepo = searchRepository;
    this.bookmarkSvc = bookmarkService;
    this.notificationSvc = notificationService;
  }


  async universalSearch({
      scope = 'global',
      q,
      sort = 'relevance',
      time = 'all_time',
      filter = '',
      type = 'all',
      page = 1,
      limit = 10,
      offset = 0,
      userId = null,
    }) {
      try {
        const query = String(q || '').trim();
        const { communities, people, tags } = parseFilter(filter);
        const sortBy = sort;
        const timeCutoff = timeToCutoff(time);
        const requestedType = normalizeUniversalType(type);
        const isBookmarks = scope === 'bookmarks';
        const isNotifications = scope === 'notifications';
        const isMessages = scope === 'messages';
        const bm = isBookmarks;
        const isDiscovery =
          !isNotifications &&
          !isMessages &&
          !bm &&
          !query &&
          communities.length === 0 &&
          people.length === 0 &&
          tags.length === 0;
        const order = isNotifications
          ? NOTIFICATIONS_TYPES
          : isDiscovery
            ? bm
              ? BOOKMARKED_TYPES
              : DISCOVERY_TYPES
            : bm
              ? BOOKMARKED_TYPES
              : UNIVERSAL_TYPES;
              
        const perTypeLimit = limit;

        if(isBookmarks) {
          const bookmarkResult = await this.bookmarkSvc.searchBookmark({
            userId,
            query,
            communities,
            people,
            tags,
            sortBy,
            timeCutoff,
            requestedType,
            limit,
            offset,
          });
          const selected = bookmarkResult.results.flatMap((group) => tagRows(group.rows, group.type));
          return {
            dataType: 'universal',
            data: {
              types: bookmarkResult.types.map((bookmarkType) => pill(bookmarkType)),
              results: selected,
              filter: { communities, people, tags },
            },
            total: bookmarkResult.total,
            hasNext: selected.length === limit,
          };
        }

        if(isNotifications) {
          const { notifications, total, filteredCount } = await this.notificationSvc.searchNotification({
                userId, 
                limit, 
                offset, 
                unreadOnly: false, 
                sourceType: requestedType, 
                query: query, 
                timeCutoff, 
                sortBy, 
                communities, 
                people
              });
              
          return {
            dataType: 'universal',
            data: {
              types: ['all', ...order].map((t) =>
                pill(
                  t,
                  isNotifications
                    ? filteredCount[t]
                    : undefined
                )
              ),
              results: tagRows(notifications, requestedType),
              filter: { communities, people, tags },
            },
            total,
            hasNext: total > page * limit,
          };
        }

        if(isMessages) {
          const { rows, total } = await this.searchRepo.searchMessages(
            query, limit, offset, userId,
            { people, sortBy, timeCutoff }
          );
          return {
            dataType: 'universal',
            data: {
              types: ['all', ...MESSAGES_TYPES].map((t) => pill(t)),
              results: tagRows(rows, 'messages'),
              filter: { communities, people, tags },
            },
            total,
            hasNext: total > page * limit,
          };
        }

        const searchGroup = async (group, lmt, off) => {
          try {
            switch (group) {
              case 'posts': {
                if (isDiscovery) {
                  const d = await this.discoverPost({
                    userId,
                    limit: lmt,
                    offset: off,
                    sortBy,
                    timeCutoff,
                  });
                  return { rows: d.data.map(PostModel.format), total: d.total };
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
                return { rows: rows.map(PostModel.format), total };
              }
              case 'polls': {
                if (isDiscovery) return { rows: [], total: 0 };
                const { rows, total } = await this.searchRepo.searchPoll(
                  query,
                  lmt,
                  off,
                  userId,
                  {
                    community: communities,
                    author: people,
                    tag: tags,
                    sortBy,
                    timeCutoff,
                  }
                );
                return { rows: rows.map(PostModel.format), total };
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
                return { rows: rows.map(CommentModel.format), total };
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
                // Media returns posts (its parent context) right now, but we just leave it as is if it doesn't match a model precisely.
                // Wait, searchMedia returns rows that are mostly posts, so PostModel.format should be applied.
                return { rows: rows.map(PostModel.format), total };
              }
              case 'people': {
                if (people.length) return { rows: [], total: 0 };
                if (isDiscovery) {
                  const d = await this.discoverPeople({ userId, page, limit: lmt, offset: off });
                  return { rows: d.data.map(r => r.itemType ? r : UserModel.format(r)), total: d.total };
                }
                const { rows, total } = await this.searchRepo.searchUser(query, lmt, off, userId, bm ? true : null);
                return { rows: rows.map(r => r.itemType ? r : UserModel.format(r)), total };
              }
              case 'communities': {
                if (communities.length) return { rows: [], total: 0 };
                if (isDiscovery) {
                  const d = await this.discoverCommunity({ userId, page, limit: lmt, offset: off });
                  return { rows: d.data.map(CommunityModel.format), total: d.total };
                }
                const { rows, total } = await this.searchRepo.searchCommunity(
                  query,
                  null,
                  lmt,
                  off,
                  userId,
                  bm ? true : null
                );
                return { rows: rows.map(CommunityModel.format), total };
              }
              case 'events': {
                if (isDiscovery) {
                  const d = await this.discoverEvents({
                    limit: lmt,
                    offset: off,
                    timeCutoff,
                  });
                  return { rows: d.data.map(EventModel.format), total: d.total };
                }
                
                if (bm) {
                  const { rows, total } = await this.searchRepo.searchEvent(
                    query,
                    null,
                    lmt,
                    off,
                    true,
                    userId,
                    timeCutoff
                  );
                  return { rows: rows.map(EventModel.format), total };
                }
                return { rows: [], total: 0 };
              }
              case 'games': {
                if (isDiscovery) {
                  const d = await this.discoverGames({ limit: lmt, offset: off });
                  return { rows: d.data.map(GameModel.formatGame || GameModel.format || (r => r)), total: d.total };
                }
                return { rows: [], total: 0 };
              }
              case 'text': {
                if (isDiscovery) {
                  const hashtags = await this.getHashtags();
                  return {
                      rows: hashtags.slice(0, lmt).map((h) => ({ text: h })),
                      total: hashtags.length,
                    }
                }
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

        // console.log(order)

        if (requestedType !== 'all') {
          const { rows, total } = await searchGroup(requestedType, limit, offset);
          const probes = await Promise.all(
            order
              .filter((g) => g !== requestedType)
              .map(async (g) => {
                const probe = await searchGroup(g, 1, 0);
                return { type: g, total: probe.total };
              })
          );
          
          return {
            dataType: 'universal',
            data: {
              types: ['all', ...order.filter((g) => g === requestedType || probes.find((p) => p.type === g)?.total > 0)].map((t) =>
                pill(
                  t,
                  isNotifications
                    ? t === 'all'
                      ? total
                      : t === requestedType
                        ? total
                        : probes.find((p) => p.type === t)?.total
                    : undefined
                )
              ),
              results: tagRows(rows, requestedType),
              filter: { communities, people, tags },
            },
            total,
            hasNext: total > page * limit,
          };
        }

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
        const total = groups.reduce((sum, g) => sum + g.total, 0);
        
        const types = ['all', ...order].map((t) =>
          pill(
            t,
            isNotifications
              ? t === 'all'
                ? total
                : groups.find((g) => g.type === t)?.total
              : undefined
          )
        );
        
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
        throw error
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

  async discoverPost({ userId, limit, offset, sortBy = 'relevance', timeCutoff = null }) {
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
        sortBy,
        timeCutoff,
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
      
      // Inject mock header at the top for testing
      if (page === 1) {
        rows.unshift({
          itemType: 'header',
          id: 'people-you-may-know-header',
          data: {
            title: 'People You May Know',
            subtitle: 'Based on your activity'
          }
        });
      }

      return { dataType: 'people', data: rows, total };
    } catch (error) {
      throw error;
    }
  }

  async discoverEvents({ limit, offset, timeCutoff = null }) {
    try {
      const { rows, total } = await this.searchRepo.searchEvent(
        '',
        '',
        limit,
        offset,
        null,
        null,
        timeCutoff
      );
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
