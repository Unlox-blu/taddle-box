'use strict';

const pool = require('../../config/database');
const HighlightModel = require('./highlight.model');


const getSpotLight = async (limit, offset) => {
  try {
    // Event spotlights must point at FEATURED, non-deleted events — non-featured
    // events (or deleted/expired ones) are never allowed in the spotlight. The
    // LEFT JOIN on events lets us enforce that at query time instead of leaking
    // stale rows to the app. Community spotlights are unaffected.
    const {rows} = await pool.query(`
      SELECT s.id, s.title, s.description, s.type, s.source_id, s.created_at, s.updated_at,
             COUNT(*) OVER() AS total
      FROM ${HighlightModel.SPOTLIGHT_TABLE} s
      LEFT JOIN events e ON s.type = 'event' AND e.id = s.source_id
      WHERE s.expire_in > NOW()
        AND (s.type != 'event' OR (e.id IS NOT NULL AND e.is_featured = TRUE AND e.deleted_at IS NULL))
      ORDER BY s.updated_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]);
    const total = rows[0]?.total || 0;
    const spotligth = rows.map( ele => HighlightModel.format(ele) )

    return { spotligth, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getSpotLight,
};
