'use strict';

const SPOTLIGHT_TABLE = 'spotlight';


const SPOTLIGHT_FIELDS = [
    'id', 'title', 'description', 'created_at', 'updated_at'
].join(', ');

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

module.exports = {SPOTLIGHT_TABLE, SPOTLIGHT_FIELDS, format }