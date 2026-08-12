'use strict';

const pool = require('../../config/database');
const HighlightModel = require('./highlight.model');


const getSpotLight = async (limit, offset) => {
  try {
    // Event spotlights must point at FEATURED, non-deleted events — non-featured
    // events (or deleted/expired ones) are never allowed in the spotlight. The
    // LEFT JOIN on events lets us enforce that at query time instead of leaking
    // stale rows to the app. Community spotlights are unaffected.
    //
    // Native imagery: event spotlights carry the event's cover image and
    // community spotlights carry the community banner (resolved via the media
    // table), so the home spotlight renders real artwork instead of emoji.
    const {rows} = await pool.query(`
      SELECT s.id, s.title, s.description, s.type, s.source_id, s.created_at, s.updated_at,
             CASE
               WHEN s.type = 'event' THEN e.cover_image_url
               WHEN s.type = 'community' THEN banner_media.cloudfront_url
               ELSE NULL
             END AS image_url,
             COUNT(*) OVER() AS total
      FROM ${HighlightModel.SPOTLIGHT_TABLE} s
      LEFT JOIN events e ON s.type = 'event' AND e.id = s.source_id
      LEFT JOIN communities c ON s.type = 'community' AND c.id = s.source_id
      LEFT JOIN media banner_media ON s.type = 'community' AND banner_media.id = c.banner_url
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
