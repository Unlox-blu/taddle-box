require('dotenv').config({path: './.env'});
const pool = require('./src/config/database');

async function seedEventImages() {
  const images = [
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop', // tech conference
    'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?q=80&w=1200&auto=format&fit=crop', // meetup
    'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?q=80&w=1200&auto=format&fit=crop', // hackathon
    'https://images.unsplash.com/photo-1475721025505-c3157b85f2fa?q=80&w=1200&auto=format&fit=crop' // gaming event
  ];

  try {
    const { rows } = await pool.query('SELECT id FROM events ORDER BY created_at DESC');
    console.log(`Found ${rows.length} events to seed.`);

    for (let i = 0; i < rows.length; i++) {
      const imgUrl = images[i % images.length];
      await pool.query('UPDATE events SET cover_image_url = $1 WHERE id = $2', [imgUrl, rows[i].id]);
      console.log(`Updated event ${rows[i].id} with image.`);
    }

    console.log('Event images seeded successfully.');
  } catch (error) {
    console.error('Error seeding event images:', error);
  } finally {
    process.exit(0);
  }
}

seedEventImages();
