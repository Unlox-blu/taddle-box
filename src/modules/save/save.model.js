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
    organizerId: row.organizer_id,
    communityId: row.community_id,
    title: row.title,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    eventType: row.event_type,
    status: row.status,
    startTime: row.start_time,
    endTime: row.end_time,
    timezone: row.timezone,
    location: row.location,
    isFree: row.is_free,
    ticketPriceCents: row.ticket_price_cents,
    currency: row.currency,
    attendeeCount: row.attendee_count,
    maxAttendees: row.max_attendees,
    tags: row.tags || [],
    isFeatured: row.is_featured,
    registrationDeadline: row.registration_deadline,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};


module.exports= {TABLE, LIST_FIELDS, format}