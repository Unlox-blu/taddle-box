'use strict';

const pool = require('../../config/database');
const HighlightModel = require('./highlight.model');


const getSpotLight = async (limit, offset) => {
  try {
    const {rows} = await pool.query(`
      SELECT ${HighlightModel.SPOTLIGHT_FIELDS}, COUNT(*) OVER() AS total
      FROM ${HighlightModel.SPOTLIGHT_TABLE}
      ORDER BY updated_at DESC
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
