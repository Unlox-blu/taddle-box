'use strict';

const TABLE = 'save';

const LIST_FIELDS = [
  's.user_id',
  's.event_id',
  's.created_at'
].join(', ');

/** Converts snake_case DB row → camelCase API response */
const format = (row) => {
  if (!row) return null;
  return {
    userId: row.user_id,
    eventId: row.event_id,
    createdAt: row.created_at
  };
};


module.exports= {TABLE, LIST_FIELDS, format}