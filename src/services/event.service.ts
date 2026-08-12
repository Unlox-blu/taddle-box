import { apiClient } from './apiClient';
import type { Event } from '../types';

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
    
    // Map backend model to frontend Event interface
    const mappedEvents = (data.data || []).map((ev: any): Event => ({
      id: ev.id,
      title: ev.title,
      type: (ev.tags && ev.tags[0]),
      banner: ev.coverImageUrl,
      date: new Date(ev.startTime).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
      rawDate: ev.startTime,
      time: new Date(ev.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      location: ev.location?.type === 'virtual' ? 'Online' : ev.location?.address,
      xpReward: ev.xpReward,
      cashPrize: ev.cashPrizeCents ? ev.cashPrizeCents / 100 : undefined,
      registrations: ev.attendeeCount,
      isLive: ev.status === 'ongoing',
      isFeatured: !!ev.isFeatured,
      isRegistered: ev.isRegistered,
      isFree: ev.isFree,
      priceCents: ev.ticketPriceCents,
      // Paid events are payable in XP (server-computed from XP_PER_RUPEE).
      xpPrice: ev.xpPrice || (ev.isFree ? 0 : Math.round(((ev.ticketPriceCents || 0) / 100) * 100)),
    }));
    
    return { ...data, data: mappedEvents };
  },

  getEventById: async (id: string) => {
    const response = await apiClient.get(`/events/${id}`);
    return response.data;
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
