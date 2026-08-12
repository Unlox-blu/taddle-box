require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING
});

async function run() {
  try {
    const res = await pool.query('SELECT id FROM users LIMIT 1');
    const userId = res.rows[0]?.id;
    if (!userId) {
      console.log('No users found.');
      process.exit(1);
    }
    console.log('Found user:', userId);

    const events = [
      {
        organizer_id: userId,
        title: 'Global Hackathon 2026',
        description: 'Join the biggest hackathon of the year! Build amazing projects and win huge prizes.',
        cover_image_url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800',
        event_type: 'online',
        status: 'upcoming',
        start_time: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
        end_time: new Date(Date.now() + 1000 * 60 * 60 * 24 * 9).toISOString(),
        timezone: 'Asia/Kolkata',
        location: { type: 'virtual', url: 'https://meet.google.com/abc' },
        is_free: true,
        ticket_price_cents: 0,
        currency: 'INR',
        max_attendees: 1000,
        tags: ['hackathon', 'coding', 'ai'],
        is_featured: true,
        xp_reward: 500,
        cash_prize_cents: 15000000 // 150k INR
      },
      {
        organizer_id: userId,
        title: 'React Native Meetup',
        description: 'Local meetup for React Native developers. Food and drinks provided!',
        cover_image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
        event_type: 'offline',
        status: 'upcoming',
        start_time: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
        end_time: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3 + 1000 * 60 * 60 * 3).toISOString(),
        timezone: 'Asia/Kolkata',
        location: { type: 'physical', address: '123 Tech Park, Bangalore' },
        is_free: false,
        ticket_price_cents: 50000, // 500 INR -> 5000 XP
        currency: 'INR',
        max_attendees: 50,
        tags: ['react-native', 'meetup', 'networking'],
        is_featured: false,
        xp_reward: 0,
        cash_prize_cents: 0
      },
      {
        organizer_id: userId,
        title: 'Design System Workshop',
        description: 'Learn how to build scalable design systems from scratch.',
        cover_image_url: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800',
        event_type: 'online',
        status: 'upcoming',
        start_time: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
        end_time: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14 + 1000 * 60 * 60 * 4).toISOString(),
        timezone: 'Asia/Kolkata',
        location: { type: 'virtual', url: 'https://zoom.us/j/123' },
        is_free: false,
        ticket_price_cents: 10000, // 100 INR -> 1000 XP
        currency: 'INR',
        max_attendees: 200,
        tags: ['design', 'ui', 'ux'],
        is_featured: true,
        xp_reward: 100,
        cash_prize_cents: 0
      }
    ];

    for (const ev of events) {
      await pool.query(
        `INSERT INTO events 
         (organizer_id, title, description, cover_image_url, event_type, status,
          start_time, end_time, timezone, location, is_free, ticket_price_cents,
          currency, max_attendees, tags, is_featured, xp_reward, cash_prize_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15::text[],$16,$17,$18)`,
        [
          ev.organizer_id, ev.title, ev.description, ev.cover_image_url, ev.event_type, ev.status,
          ev.start_time, ev.end_time, ev.timezone, JSON.stringify(ev.location), ev.is_free, ev.ticket_price_cents,
          ev.currency, ev.max_attendees, ev.tags, ev.is_featured, ev.xp_reward, ev.cash_prize_cents
        ]
      );
    }
    console.log('Successfully seeded 3 events!');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

run();
