'use strict';

const pool = require('../config/database');
const CommunityModel = require('../models/community.model');

const findById = async (communityId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CommunityModel.DETAIL_FIELDS} FROM ${CommunityModel.TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [communityId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const findBySlug = async (slug) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CommunityModel.DETAIL_FIELDS} FROM ${CommunityModel.TABLE} WHERE slug = $1 AND deleted_at IS NULL`,
      [slug]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const create = async (data) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${CommunityModel.TABLE} (name, slug, description, privacy, category, rules, owner_id)
     VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb, $7)
     RETURNING ${CommunityModel.DETAIL_FIELDS}`,
      [
        data.name,
        data.slug,
        data.description || null,
        data.privacy || 'public',
        data.category || [],
        JSON.stringify(data.rules || []),
        data.ownerId,
      ]
    );
    return rows[0];
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
     WHERE id = $${values.length} RETURNING ${CommunityModel.DETAIL_FIELDS}`,
      values
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const updateAvatar = async (communityId, fileUrl) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET avatar_url = $1, updated_at = NOW()
     WHERE id = $2 RETURNING avatar_url`,
      [fileUrl, communityId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const updateBanner = async (communityId, fileUrl) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${CommunityModel.TABLE} SET banner_url = $1, updated_at = NOW()
     WHERE id = $2 RETURNING avatar_url`,
      [fileUrl, communityId]
    );
    return rows[0];
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

const getMembers = async (communityId, status, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT cm.*, u.name, u.username, u.avatar_url, u.is_verified, COUNT(*) OVER() AS total
     FROM ${CommunityModel.MEMBERS_TABLE} cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.community_id = $1 AND cm.status = $2
     ORDER BY cm.joined_at DESC
     LIMIT $3 OFFSET $4`,
      [communityId, status, limit, offset]
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

const search = async (query, filter, limit, offset) => {
  try {
    const q = query || '';
    const category = filter || null;
    const { rows } = await pool.query(
      `SELECT ${CommunityModel.LIST_FIELDS}, COUNT(*) OVER() AS total
     FROM ${CommunityModel.TABLE}
     WHERE deleted_at IS NULL AND is_active = TRUE AND privacy IN ('public', 'restricted')
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
  create,
  update,
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
  incrementMemberCount,
  decrementMemberCount,
  search,
  isMember,
};
