import { apiClient } from './apiClient';
import type { Event } from '../types';

export const mapEvent = (ev: any): Event => {
  if (!ev) return ev;
  const startTime = ev.startTime || ev.start_time || ev.rawDate;
  const validDate = startTime ? new Date(startTime) : null;
  const formattedDate = validDate && !isNaN(validDate.getTime())
    ? validDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : (ev.date || 'TBD');
  const formattedTime = validDate && !isNaN(validDate.getTime())
    ? validDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : (ev.time || '');

  let loc = 'Online';
  if (typeof ev.location === 'object' && ev.location !== null) {
    loc = ev.location.type === 'virtual' ? 'Online' : (ev.location.address || 'Online');
  } else if (typeof ev.location === 'string' && ev.location.trim()) {
    loc = ev.location;
  }

  const isFree = ev.isFree !== undefined ? !!ev.isFree : (ev.is_free !== undefined ? !!ev.is_free : true);
  const ticketPriceCents = ev.priceCents ?? ev.ticketPriceCents ?? ev.ticket_price_cents ?? 0;
  const xpPrice = ev.xpPrice ?? ev.xp_price ?? (isFree ? 0 : Math.round((ticketPriceCents / 100) * 100));

  return {
    id: ev.id,
    title: ev.title || '',
    type: (ev.tags && ev.tags[0]) || ev.type || ev.eventType || ev.event_type || 'Event',
    banner: ev.banner || ev.coverImageUrl || ev.cover_image_url || '',
    date: formattedDate,
    rawDate: startTime,
    time: formattedTime,
    location: loc,
    description: ev.description || '',
    xpReward: ev.xpReward ?? ev.xp_reward ?? 0,
    cashPrize: ev.cashPrize !== undefined ? ev.cashPrize : (ev.cashPrizeCents ? ev.cashPrizeCents / 100 : (ev.cash_prize_cents ? ev.cash_prize_cents / 100 : undefined)),
    registrations: ev.registrations ?? ev.attendeeCount ?? ev.attendee_count ?? 0,
    isLive: ev.isLive !== undefined ? !!ev.isLive : (ev.status === 'ongoing'),
    isFeatured: !!ev.isFeatured || !!ev.is_featured,
    isRegistered: !!ev.isRegistered || !!ev.is_registered,
    isFree,
    priceCents: ticketPriceCents,
    xpPrice,
  };
};

export const eventService = {
  discoverEvents: async (params?: { q?: string; filter?: string; limit?: number; page?: number; scope?: string }) => {
    const query = new URLSearchParams();
    if (params?.q) query.append('q', params.q);
    if (params?.filter) query.append('filter', params.filter);
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.page) query.append('page', String(params.page));
    if (params?.scope) query.append('scope', params.scope);

    const response = await apiClient.get(`/events/discover?${query.toString()}`);
    const data = response.data;
    
    const mappedEvents = (data.data || []).map(mapEvent);
    
    return { ...data, data: mappedEvents };
  },

  getEventById: async (id: string): Promise<Event> => {
    const response = await apiClient.get(`/events/${id}`);
    const raw = response.data?.data || response.data;
    return mapEvent(raw);
  },

  register: async (id: string) => {
    const response = await apiClient.post(`/events/${id}/register`);
    return response.data;
  },

  async cancelRegistration(id: string) {
    const { data } = await apiClient.delete(`/events/${id}/register`);
    return data;
  },

  saveEvent: async (id: string) => {
    const response = await apiClient.post(`/events/${id}/save`);
    return response.data;
  },

  removeSavedEvent: async (id: string) => {
    const response = await apiClient.delete(`/events/${id}/save`);
    return response.data;
  }
};
