export interface Event {
  id: string;
  title: string;
  type: 'hackathon' | 'webinar' | 'meetup' | 'competition' | 'workshop';
  banner: string;
  date: string;
  rawDate?: string;
  time?: string;
  location: string;
  xpReward: number;
  cashPrize?: number;
  registrations: number;
  isLive: boolean;
  isFeatured: boolean;
  isRegistered: boolean;
  isFree: boolean;
  description?: string;
  priceCents?: number;
  /** Paid-event ticket price expressed in XP (server-computed). */
  xpPrice?: number;
}