'use strict';

/**
 * Cursor-based pagination utility.
 *
 * Supports two cursor formats:
 *
 * 1. Ranked feed cursor: { score, publishedAt, id }
 *    Used when ORDER BY total_score DESC, published_at DESC
 *    The score is the computed total_score from the algorithm.
 *
 * 2. Chronological cursor: { createdAt, id }
 *    Used for simple chronological pagination (profile, bookmarks, etc.)
 *
 * Encoding: base64(JSON({ score, publishedAt, id }))
 * or:       base64(JSON({ createdAt, id }))
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Decode an opaque cursor string.
 * Returns { score, publishedAt, id } for ranked feeds
 * or { createdAt, id } for chronological feeds.
 * Returns null if cursor is missing or invalid.
 */
function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));

    // Ranked feed cursor (has score)
    if (decoded.score !== undefined && decoded.publishedAt && decoded.id) {
      return { score: decoded.score, publishedAt: decoded.publishedAt, id: decoded.id };
    }

    // Chronological cursor (createdAt + id)
    if (decoded.createdAt && decoded.id) {
      return { createdAt: decoded.createdAt, id: decoded.id };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Encode a cursor for a ranked feed.
 * @param {{ score: number, publishedAt: string, id: string }} params
 */
function encodeRankedCursor({ score, publishedAt, id }) {
  return Buffer.from(JSON.stringify({ score, publishedAt, id })).toString('base64');
}

/**
 * Encode a cursor for a chronological feed.
 * @param {{ createdAt: string, id: string }} params
 */
function encodeChronologicalCursor({ createdAt, id }) {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64');
}

/**
 * Legacy encode — defaults to chronological cursor.
 * @deprecated Use encodeRankedCursor or encodeChronologicalCursor
 */
function encodeCursor({ createdAt, id }) {
  return encodeChronologicalCursor({ createdAt, id });
}

/**
 * Parse pagination params from req.query.
 *
 * Supports:
 *   - Cursor-based: ?cursor=<base64>&limit=20
 *   - Page-based (legacy): ?page=2&limit=20
 *
 * Returns: { limit, offset, page, cursorData }
 *   - cursorData: { score, publishedAt, id } or { createdAt, id }
 */
function getPaginationParams(query = {}) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));

  // Try cursor first
  const cursorData = decodeCursor(query.cursor);
  if (cursorData) {
    return { limit, offset: 0, page: 1, cursorData };
  }

  // Fall back to page-based
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const offset = (page - 1) * limit;
  return { limit, offset, page, cursorData: null };
}

/**
 * Build pagination metadata for API response.
 *
 * For ranked cursor-based:
 *   - nextCursor: { score, publishedAt, id } encoded
 *
 * For chronological cursor-based:
 *   - nextCursor: { createdAt, id } encoded
 *
 * For page-based (legacy):
 *   - page, limit, totalPages, hasNext, hasPrev
 */
function paginationMeta(total, page, limit, useCursor = false, lastItem = null, ranked = false) {
  if (useCursor) {
    const hasMore = page * limit < total;

    let nextCursor = null;
    if (hasMore && lastItem) {
      if (ranked && lastItem.total_score !== undefined) {
        // Ranked feed cursor
        nextCursor = encodeRankedCursor({
          score: lastItem.total_score,
          publishedAt: lastItem.published_at || lastItem.created_at,
          id: lastItem.id,
        });
      } else {
        // Chronological cursor
        nextCursor = encodeChronologicalCursor({
          createdAt: lastItem.published_at || lastItem.created_at,
          id: lastItem.id,
        });
      }
    }

    return {
      total,
      limit,
      hasNext: hasMore,
      nextCursor,
    };
  }

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}

module.exports = {
  getPaginationParams,
  paginationMeta,
  decodeCursor,
  encodeCursor,
  encodeRankedCursor,
  encodeChronologicalCursor,
};
