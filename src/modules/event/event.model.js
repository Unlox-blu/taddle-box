'use strict';

const TABLE = 'events';
const ATTENDEES_TABLE = 'event_attendees';

const LIST_FIELDS = [
  'id', 'organizer_id', 'community_id', 'title', 'cover_image_url', 'description',
  'event_type', 'status', 'start_time', 'end_time', 'timezone',
  'location', 'is_free', 'ticket_price_cents', 'currency', 'registration_deadline',
  'attendee_count', 'max_attendees', 'tags', 'is_featured',
].join(', ');

const DETAIL_FIELDS = [
  'id', 'organizer_id', 'community_id', 'title', 'description', 'cover_image_url',
  'event_type', 'status', 'start_time', 'end_time', 'timezone', 'location',
  'is_free', 'ticket_price_cents', 'currency', 'registration_deadline',
  'attendee_count', 'max_attendees', 'tags', 'is_featured', 'metadata',
  'created_at', 'updated_at',
].join(', ');

const EVENT_TYPES = ['online', 'offline', 'hybrid'];
const EVENT_STATUSES = ['draft', 'upcoming', 'ongoing', 'completed', 'cancelled'];
const ATTENDEE_STATUSES = ['registered', 'waitlisted', 'cancelled', 'attended'];

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
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

module.exports = {
  TABLE, ATTENDEES_TABLE,
  LIST_FIELDS, DETAIL_FIELDS,
  EVENT_TYPES, EVENT_STATUSES, ATTENDEE_STATUSES,
  format,
};
