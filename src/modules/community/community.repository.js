'use strict';

const pool = require('../../config/database');
const CommunityModel = require('./community.model');

const findById = async (communityId, userId = null) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CommunityModel.DETAIL_FIELDS},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url,
      -- is_joined means an ACTIVE membership (pending requests do NOT count)
      (SELECT EXISTS(SELECT 1 FROM ${CommunityModel.MEMBERS_TABLE} cm
        WHERE cm.community_id = c.id AND cm.user_id = $2 AND cm.status = 'active')) AS is_joined,
      (SELECT status FROM ${CommunityModel.MEMBERS_TABLE} cm
        WHERE cm.community_id = c.id AND cm.user_id = $2 LIMIT 1) AS member_status,
      (SELECT role FROM ${CommunityModel.MEMBERS_TABLE} cm WHERE cm.community_id = c.id AND cm.user_id = $2 LIMIT 1) AS member_role
      FROM ${CommunityModel.TABLE} c
      LEFT JOIN media AS avatar_media ON avatar_media.id = c.avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = c.banner_url
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [communityId, userId]
    );
    return rows[0] ? CommunityModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findBySlug = async (slug, userId = null) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CommunityModel.DETAIL_FIELDS},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url,
      (SELECT EXISTS(SELECT 1 FROM ${CommunityModel.MEMBERS_TABLE} cm
        WHERE cm.community_id = c.id AND cm.user_id = $2 AND cm.status = 'active')) AS is_joined,
      (SELECT status FROM ${CommunityModel.MEMBERS_TABLE} cm
        WHERE cm.community_id = c.id AND cm.user_id = $2 LIMIT 1) AS member_status,
      (SELECT role FROM ${CommunityModel.MEMBERS_TABLE} cm WHERE cm.community_id = c.id AND cm.user_id = $2 LIMIT 1) AS member_role
      FROM ${CommunityModel.TABLE} c
      LEFT JOIN media AS avatar_media ON avatar_media.id = c.avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = c.banner_url 
      WHERE c.slug = $1 AND c.deleted_at IS NULL`,
      [slug, userId]
    );
    return rows[0] ? CommunityModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findManyCommunity = async ({limit, offset, userId = null, search = null, mine = false, category = null, filter = null}) => {
  try {
    let filterCondition = 'AND ($5::boolean = FALSE OR c.owner_id = $3 OR EXISTS (SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_id = $3 AND cm.status = \'active\'))';
    
    if (filter === 'created') {
      filterCondition = 'AND ($5::boolean IS NOT NULL) AND c.owner_id = $3';
    } else if (filter === 'joined') {
      filterCondition = 'AND ($5::boolean IS NOT NULL) AND c.owner_id != $3 AND EXISTS (SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_id = $3 AND cm.status = \'active\')';
    }

    const {rows} = await pool.query(
      `SELECT ${CommunityModel.LIST_FIELDS},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url,
      (SELECT EXISTS(SELECT 1 FROM ${CommunityModel.MEMBERS_TABLE} cm
        WHERE cm.community_id = c.id AND cm.user_id = $3 AND cm.status = 'active')) AS is_joined,
      (SELECT status FROM ${CommunityModel.MEMBERS_TABLE} cm
        WHERE cm.community_id = c.id AND cm.user_id = $3 LIMIT 1) AS member_status,
      (SELECT role FROM ${CommunityModel.MEMBERS_TABLE} cm WHERE cm.community_id = c.id AND cm.user_id = $3 LIMIT 1) AS member_role,
      COUNT(*) OVER() AS total 
      FROM ${CommunityModel.TABLE} c
      LEFT JOIN media AS avatar_media ON avatar_media.id = c.avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = c.banner_url
      WHERE c.deleted_at IS NULL AND c.is_active = TRUE
        AND ($4::text IS NULL OR c.name ILIKE '%' || $4 || '%')
        AND ($6::text IS NULL OR $6 = ANY(c.category))
        ${filterCondition}
      ORDER BY member_count DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset, userId, search, mine, category]
    )
    const total = rows[0] ? rows[0].total : 0
    const communities = rows.length ? rows.map(CommunityModel.format) : []

    return {communities, total: parseInt(total, 10) }

  } catch (error) {
    throw error
  }
}

const create = async (data) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${CommunityModel.TABLE}
        (name, slug, description, privacy, category, rules, avatar_url, banner_url, owner_id)
     VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb, $7, $8, $9)
     RETURNING *`,
      [
        data.name,
        data.slug,
        data.description || null,
        data.privacy || 'public',
        data.category || [],
        JSON.stringify(data.rules || []),
        data.avatarMediaId || null,
        data.bannerMediaId || null,
        data.ownerId,
      ]
    );
    return rows[0] ? CommunityModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const update = async (communityId, fields) => {
  try {
    const allowed = [
      'name',
      'description',
      'privacy',
      'avatar_url',
      'banner_url',
      'category',
      'rules',
      'allow_reposts',
    ];
    const updates = [];
    const values = [];
    Object.entries(fields).forEach(([k, v]) => {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowed.includes(col)) {
        values.push(v);
        updates.push(`${col} = $${values.length}`);
      }
    });
    if (!updates.length) return findById(communityId);
    values.push(communityId);
    const { rows } = await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] ? CommunityModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findAvatarAndBanner = async (communityId) => {
  try {
    const {rows} = await pool.query(
      `SELECT ${CommunityModel.MEDIA_FIELDS}
      FROM ${CommunityModel.TABLE} c
      WHERE c.id = $1`,
      [communityId]
    )
    return rows[0] ?  CommunityModel.format(rows[0]) : null;
  } catch (error) {
    throw error
  }
} 


const updateAvatar = async (communityId, fileUrl) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET avatar_url = $1, updated_at = NOW()
     WHERE id = $2 RETURNING avatar_url`,
      [fileUrl, communityId]
    );
    return rows[0] ?  CommunityModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const updateBanner = async (communityId, fileUrl) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET banner_url = $1, updated_at = NOW()
     WHERE id = $2 RETURNING banner_url`,
      [fileUrl, communityId]
    );
    return rows[0] ?  CommunityModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const softDelete = async (communityId) => {
  try {
    await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET deleted_at = NOW(), is_active = FALSE WHERE id = $1`,
      [communityId]
    );
  } catch (error) {
    throw error;
  }
};

const addMember = async (communityId, userId, role = 'member', status = 'active') => {
  try {
    await pool.query(
      `INSERT INTO ${CommunityModel.MEMBERS_TABLE} (community_id, user_id, role, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [communityId, userId, role, status]
    );
  } catch (error) {
    throw error;
  }
};

const removeMember = async (communityId, userId) => {
  try {
    await pool.query(
      `DELETE FROM ${CommunityModel.MEMBERS_TABLE} WHERE community_id = $1 AND user_id = $2`,
      [communityId, userId]
    );
  } catch (error) {
    throw error;
  }
};

const getMember = async (communityId, userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${CommunityModel.MEMBERS_TABLE} WHERE community_id = $1 AND user_id = $2`,
      [communityId, userId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const updateMemberStatus = async (communityId, userId, status) => {
  try {
    await pool.query(
      `UPDATE ${CommunityModel.MEMBERS_TABLE} SET status = $1 WHERE community_id = $2 AND user_id = $3`,
      [status, communityId, userId]
    );
  } catch (error) {
    throw error;
  }
};

const updateMemberRole = async (communityId, userId, role) => {
  try {
    await pool.query(
      `UPDATE ${CommunityModel.MEMBERS_TABLE} SET role = $1 WHERE community_id = $2 AND user_id = $3`,
      [role, communityId, userId]
    );
  } catch (error) {
    throw error;
  }
};

const updateOwner = async (communityId, ownerId) => {
  try {
    await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET owner_id = $1 WHERE id = $2`,
      [ownerId, communityId]
    );
  } catch (error) {
    throw error;
  }
};

// Atomic ownership hand-over: swap owner_id AND fix up the old owner's role in
// ONE transaction so a mid-transfer failure can never strand the old owner
// (owner swapped but their membership row never adjusted). The community's
// allow_reposts column is untouched — the toggle rides with the community,
// not the owner. updated_at is stamped because a transfer is a real edit.
const transferOwnership = async ({ communityId, newOwnerId, oldOwnerId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE ${CommunityModel.TABLE} SET owner_id = $1, updated_at = NOW() WHERE id = $2`,
      [newOwnerId, communityId]
    );
    // Old owner auto-becomes an admin (re-insert the row if it ever went
    // missing so they're never left outside their own community).
    const { rows } = await client.query(
      `SELECT 1 FROM ${CommunityModel.MEMBERS_TABLE} WHERE community_id = $1 AND user_id = $2`,
      [communityId, oldOwnerId]
    );
    if (rows[0]) {
      await client.query(
        `UPDATE ${CommunityModel.MEMBERS_TABLE} SET role = 'admin', status = 'active' WHERE community_id = $1 AND user_id = $2`,
        [communityId, oldOwnerId]
      );
    } else {
      await client.query(
        `INSERT INTO ${CommunityModel.MEMBERS_TABLE} (community_id, user_id, role, status) VALUES ($1, $2, 'admin', 'active') ON CONFLICT DO NOTHING`,
        [communityId, oldOwnerId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getMembers = async (communityId, status, limit, offset, search = '') => {
  try {
    const q = search ? `%${search}%` : '';
    const { rows } = await pool.query(
      `SELECT cm.*, u.name, u.username, ua.cloudfront_url AS avatar_url, COUNT(*) OVER() AS total
     FROM ${CommunityModel.MEMBERS_TABLE} cm
     JOIN users u ON u.id = cm.user_id
     LEFT JOIN media ua ON u.avatar_url = ua.id
     JOIN ${CommunityModel.TABLE} c ON c.id = cm.community_id
     WHERE cm.community_id = $1 AND cm.status = $2
     AND ($5 = '' OR u.username ILIKE $5 OR u.name ILIKE $5)
     -- Owner first, then admins/moderators, then everyone else — so the
     -- member list always leads with leadership regardless of page size.
     ORDER BY
       CASE WHEN cm.user_id = c.owner_id THEN 0
            WHEN cm.role IN ('admin','moderator') THEN 1
            ELSE 2 END,
       cm.joined_at ASC
     LIMIT $3 OFFSET $4`,
      [communityId, status, limit, offset, q]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

// Record a moderation action (kick, role change, ownership transfer, request
// decision, community-post removal) against the community's moderation log.
const logModeration = async ({ communityId, actorId, action, targetUserId = null, postId = null, details = {} }) => {
  try {
    await pool.query(
      `INSERT INTO community_moderation_log
        (community_id, actor_id, action, target_user_id, post_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [communityId, actorId, action, targetUserId, postId, JSON.stringify(details)]
    );
  } catch (error) {
    throw error;
  }
};

// Paginated moderation log, newest first. Joins the actor + target names so
// the app can render a readable "who did what to whom" row without extra calls.
const getModerationLog = async (communityId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.*,
              a.name AS actor_name, a.username AS actor_username,
              ua.cloudfront_url AS actor_avatar,
              t.name AS target_name, t.username AS target_username,
              COUNT(*) OVER() AS total
     FROM community_moderation_log l
     JOIN users a ON a.id = l.actor_id
     LEFT JOIN media ua ON ua.id = a.avatar_url
     LEFT JOIN users t ON t.id = l.target_user_id
     WHERE l.community_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2 OFFSET $3`,
      [communityId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const getAdminsId = async (communityId) => {
  try {
    const { rows } = await pool.query(
      `SELECT user_id FROM ${CommunityModel.MEMBERS_TABLE} 
      WHERE status = 'active' AND role = 'admin' AND community_id = $1 
      ORDER BY joined_at`,
      [communityId]
    );
    
    return rows;
  } catch (error) {
    throw error;
  }
};

const incrementMemberCount = async (communityId) => {
  try {
    await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET member_count = member_count + 1 WHERE id = $1`,
      [communityId]
    );
  } catch (error) {
    throw error;
  }
};

const decrementMemberCount = async (communityId) => {
  try {
    await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET member_count = GREATEST(0, member_count - 1) WHERE id = $1`,
      [communityId]
    );
  } catch (error) {
    throw error;
  }
};

const incrementPostCount = async (communityId) => {
  try {
    await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET post_count = post_count + 1 WHERE id = $1`,
      [communityId]
    );
  } catch (error) {
    throw error;
  }
};

const decrementPostCount = async (communityId) => {
  try {
    await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET post_count = GREATEST(0, post_count - 1) WHERE id = $1`,
      [communityId]
    );
  } catch (error) {
    throw error;
  }
};

const search = async (query, filter, limit, offset) => {
  try {
    const q = query || '';
    const category = filter || null;
    const { rows } = await pool.query(
      `SELECT ${CommunityModel.LIST_FIELDS}, COUNT(*) OVER() AS total
     FROM ${CommunityModel.TABLE}
     -- Private communities are discoverable too — the detail screen gates
     -- their posts/members to approved members.
     WHERE deleted_at IS NULL AND is_active = TRUE
       AND ($1 = '' OR name ILIKE $1 OR description ILIKE $1)
       AND ($2::text IS NULL OR $2 = ANY(category))
     ORDER BY member_count DESC
     LIMIT $3 OFFSET $4`,
      [`%${q}%`, category, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const isMember = async (communityId, userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT status FROM ${CommunityModel.MEMBERS_TABLE} WHERE community_id = $1 AND user_id = $2 `,
      [communityId, userId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findById,
  findBySlug,
  findManyCommunity,
  create,
  update,
  findAvatarAndBanner,
  updateAvatar,
  updateBanner,
  softDelete,
  addMember,
  removeMember,
  getMember,
  getAdminsId,
  updateMemberStatus,
  updateMemberRole,
  getMembers,
  logModeration,
  getModerationLog,
  updateOwner,
  transferOwnership,
  incrementMemberCount,
  decrementMemberCount,
  incrementPostCount,
  decrementPostCount,
  search,
  isMember,
};
