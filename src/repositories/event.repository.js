'use strict';

const pool = require('../config/database');
const EventModel = require('../models/event.model');

const findById = async (eventId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${EventModel.DETAIL_FIELDS} FROM ${EventModel.TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [eventId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const browse = async (filters, limit, offset) => {
  try {
    const q = filters.q || '';
    const eventType = filters.eventType || null;
    const { rows } = await pool.query(
      `SELECT ${EventModel.LIST_FIELDS}, COUNT(*) OVER() AS total
     FROM ${EventModel.TABLE}
     WHERE deleted_at IS NULL AND status IN ('upcoming', 'ongoing')
       AND ($1 = '' OR title ILIKE $1 OR description ILIKE $1)
       AND ($2::text IS NULL OR event_type = $2)
     ORDER BY start_time ASC
     LIMIT $3 OFFSET $4`,
      [`%${q}%`, eventType, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const create = async (data) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${EventModel.TABLE}
       (organizer_id, community_id, title, description, cover_image_url, event_type,
        start_time, end_time, timezone, location, is_free, ticket_price_cents,
        currency, max_attendees, registration_deadline, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16::text[])
     RETURNING ${EventModel.DETAIL_FIELDS}`,
      [
        data.organizerId,
        data.communityId || null,
        data.title,
        data.description || null,
        data.coverImageUrl || null,
        data.eventType || 'online',
        data.startTime,
        data.endTime,
        data.timezone || 'Asia/Kolkata',
        JSON.stringify(data.location || {}),
        data.isFree !== false,
        data.ticketPriceCents || 0,
        data.currency || 'INR',
        data.maxAttendees || null,
        data.registrationDeadline || null,
        data.tags || [],
      ]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const update = async (eventId, fields) => {
  try {
    const allowed = [
      'title',
      'description',
      'start_time',
      'end_time',
      'location',
      'status',
      'max_attendees',
      'tags',
      'is_featured',
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
    if (!updates.length) return findById(eventId);
    values.push(eventId);
    const { rows } = await pool.query(
      `UPDATE ${EventModel.TABLE} SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING ${EventModel.DETAIL_FIELDS}`,
      values
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const softDelete = async (eventId) => {
  try {
    await pool.query(
      `UPDATE ${EventModel.TABLE} SET deleted_at = NOW(), status = 'cancelled' WHERE id = $1`,
      [eventId]
    );
  } catch (error) {
    throw error;
  }
};

const addAttendee = async (eventId, userId, data) => {
  try {
    await pool.query(
      `INSERT INTO ${EventModel.ATTENDEES_TABLE} (event_id, user_id, status, razorpay_order_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT (event_id, user_id) DO UPDATE SET status = $3`,
      [eventId, userId, data.status || 'registered', data.razorpayOrderId || null]
    );
  } catch (error) {
    throw error;
  }
};

const removeAttendee = async (eventId, userId) => {
  try {
    await pool.query(
      `DELETE FROM ${EventModel.ATTENDEES_TABLE} WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );
  } catch (error) {
    throw error;
  }
};

const getAttendee = async (eventId, userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${EventModel.ATTENDEES_TABLE} WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const getAttendees = async (eventId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT ea.*, u.name, u.username, u.avatar_url, COUNT(*) OVER() AS total
     FROM ${EventModel.ATTENDEES_TABLE} ea JOIN users u ON u.id = ea.user_id
     WHERE ea.event_id = $1 ORDER BY ea.registered_at DESC LIMIT $2 OFFSET $3`,
      [eventId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const incrementAttendeeCount = async (id) => {
  try {
    pool.query(`UPDATE ${EventModel.TABLE} SET attendee_count = attendee_count + 1 WHERE id = $1`, [
      id,
    ]);
  } catch (error) {
    throw error;
  }
};

const decrementAttendeeCount = async (id) => {
  try {
    pool.query(
      `UPDATE ${EventModel.TABLE} SET attendee_count = GREATEST(0, attendee_count - 1) WHERE id = $1`,
      [id]
    );
  } catch (error) {
    throw error;
  }
};
const updateAttendeeStatus = async (eventId, userId, status) => {
  try {
    pool.query(
      `UPDATE ${EventModel.ATTENDEES_TABLE} SET status = $1 WHERE event_id = $2 AND user_id = $3`,
      [status, eventId, userId]
    );
  } catch (error) {
    throw error;
  }
};

const confirmPayment = async (eventId, userId, rp) => {
  try {
    pool.query(
      `UPDATE ${EventModel.ATTENDEES_TABLE} SET razorpay_payment_id = $1, status = 'registered' WHERE event_id = $2 AND user_id = $3`,
      [rp.paymentId, eventId, userId]
    );
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findById,
  browse,
  create,
  update,
  softDelete,
  addAttendee,
  removeAttendee,
  getAttendee,
  getAttendees,
  incrementAttendeeCount,
  decrementAttendeeCount,
  updateAttendeeStatus,
  confirmPayment,
};
