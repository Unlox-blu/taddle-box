require('dotenv').config();
const pool = require('./src/config/database');
const { v4: uuidv4 } = require('uuid');

async function seedEvents() {
  const adminId = 'fcac581d-3971-4e1a-8e85-c4b5e0090f71';

  // Clear old events first
  await pool.query("DELETE FROM events WHERE title = 'First event'");

  const events = [
    {
      id: uuidv4(),
      organizer_id: adminId,
      title: 'Global Tech Hackathon 2026',
      description: 'Join developers worldwide for a 48-hour hackathon focusing on AI and Web3.',
      event_type: 'online',
      start_time: new Date(Date.now() + 86400000 * 2), // 2 days from now
      end_time: new Date(Date.now() + 86400000 * 4),
      status: 'upcoming',
      is_free: true,
      ticket_price_cents: 0,
      max_attendees: 5000,
      tags: ['hackathon', 'AI', 'Web3'],
      is_featured: true,
      location: { type: 'virtual', link: 'https://zoom.us/j/123456789' },
      xp_reward: 1500,
      cash_prize_cents: 1000000 // 10,000 INR
    },
    {
      id: uuidv4(),
      organizer_id: adminId,
      title: 'React Native Workshop',
      description: 'Learn advanced React Native animations and performance optimizations.',
      event_type: 'online',
      start_time: new Date(Date.now() + 86400000 * 5),
      end_time: new Date(Date.now() + 86400000 * 5 + 7200000), // 2 hours long
      status: 'upcoming',
      is_free: false,
      ticket_price_cents: 15000, // 150 INR
      max_attendees: 100,
      tags: ['workshop', 'React Native', 'Mobile'],
      is_featured: false,
      location: { type: 'virtual', link: 'https://zoom.us/j/987654321' },
      xp_reward: 250,
      cash_prize_cents: 0
    },
    {
      id: uuidv4(),
      organizer_id: adminId,
      title: 'Local Developer Meetup',
      description: 'Networking and lightning talks for local developers.',
      event_type: 'offline',
      start_time: new Date(Date.now() + 86400000 * 10),
      end_time: new Date(Date.now() + 86400000 * 10 + 10800000),
      status: 'upcoming',
      is_free: true,
      ticket_price_cents: 0,
      max_attendees: 50,
      tags: ['meetup', 'Networking'],
      is_featured: false,
      location: { type: 'physical', address: '123 Tech Lane, San Francisco, CA' },
      xp_reward: 100,
      cash_prize_cents: 0
    }
  ];

  for (const ev of events) {
    try {
      await pool.query(
        `INSERT INTO events 
         (id, organizer_id, title, description, event_type, start_time, end_time, status, is_free, ticket_price_cents, max_attendees, tags, is_featured, location, xp_reward, cash_prize_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [ev.id, ev.organizer_id, ev.title, ev.description, ev.event_type, ev.start_time, ev.end_time, ev.status, ev.is_free, ev.ticket_price_cents, ev.max_attendees, ev.tags, ev.is_featured, ev.location, ev.xp_reward, ev.cash_prize_cents]
      );
      console.log(`Seeded event: ${ev.title}`);
    } catch (e) {
      console.error(`Failed to seed ${ev.title}:`, e.message);
    }
  }

  process.exit(0);
}

seedEvents();
