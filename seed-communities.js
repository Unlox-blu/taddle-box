'use strict';

/**
 * seed-communities.js
 * Run: node seed-communities.js
 * Seeds mock communities, posts, and joins them to the first existing user.
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
});

const communities = [
  {
    name: 'Dev Builders',
    slug: 'dev-builders',
    description: 'A place for developers to share tips, projects, and collaborate on open source.',
    category: ['Tech'],
    privacy: 'public',
    memberCount: 4820,
    postCount: 312,
  },
  {
    name: 'Startup Grind',
    slug: 'startup-grind',
    description: 'Founders, makers, and hustlers sharing the real side of building a startup.',
    category: ['Startup'],
    privacy: 'public',
    memberCount: 2100,
    postCount: 198,
  },
  {
    name: 'Design & Motion',
    slug: 'design-and-motion',
    description: 'UI/UX, graphic design, motion graphics, and everything visual. Post your work!',
    category: ['Creative'],
    privacy: 'public',
    memberCount: 3400,
    postCount: 275,
  },
  {
    name: 'Gamer Lounge',
    slug: 'gamer-lounge',
    description: 'For gamers of all types. FPS, RPG, strategy — share clips, news, and find teammates.',
    category: ['Gaming'],
    privacy: 'public',
    memberCount: 5600,
    postCount: 890,
  },
  {
    name: 'Mindful Living',
    slug: 'mindful-living',
    description: 'Mental health, meditation, fitness, and building a healthier lifestyle together.',
    category: ['Lifestyle'],
    privacy: 'public',
    memberCount: 1900,
    postCount: 142,
  },
  {
    name: 'Study Hub',
    slug: 'study-hub',
    description: 'Students helping students — share notes, exam tips, and resources for every subject.',
    category: ['Study'],
    privacy: 'public',
    memberCount: 3100,
    postCount: 256,
  },
  {
    name: 'AI & ML Club',
    slug: 'ai-ml-club',
    description: 'Discuss machine learning, generative AI, research papers, and cutting-edge tools.',
    category: ['Tech'],
    privacy: 'public',
    memberCount: 6200,
    postCount: 540,
  },
  {
    name: 'Fitness Warriors',
    slug: 'fitness-warriors',
    description: 'Gym, running, home workouts — track progress and stay accountable together.',
    category: ['Lifestyle'],
    privacy: 'public',
    memberCount: 2800,
    postCount: 310,
  },
];

const postTemplates = [
  'Just shipped a new feature! Loving the progress this week 🚀',
  'Anyone else been experimenting with the new tooling? The DX is insane.',
  'Weekly check-in: what are you working on this week? Drop it below 👇',
  'Hot take: consistency beats motivation every single time. What do you think?',
  'Sharing my progress from the last 30 days. Small steps add up!',
  'Found this amazing resource for anyone learning in this space 👆',
  'Reached a big milestone today. Thanks for all the support this community gives 🙏',
  'Question: what tools/apps do you use daily in this space? List yours below.',
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting community seed...\n');

    const userRes = await client.query(`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`);
    if (!userRes.rows.length) {
      console.error('❌ No users found in DB. Please register at least one user first.');
      return;
    }
    const ownerId = userRes.rows[0].id;
    console.log(`👤 Using owner: ${ownerId}\n`);

    for (const comm of communities) {
      const exists = await client.query(`SELECT id FROM communities WHERE slug = $1`, [comm.slug]);
      if (exists.rows.length) {
        console.log(`⏭  Skipping "${comm.name}" (already exists)`);
        continue;
      }

      const res = await client.query(
        `INSERT INTO communities (id, name, slug, description, category, privacy, owner_id, member_count, post_count, is_active, is_verified, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true, false, NOW(), NOW())
         RETURNING id`,
        [comm.name, comm.slug, comm.description, comm.category, comm.privacy, ownerId, comm.memberCount, comm.postCount]
      );
      const communityId = res.rows[0].id;

      await client.query(
        `INSERT INTO community_members (community_id, user_id, role, status, joined_at)
         VALUES ($1, $2, 'admin', 'active', NOW())
         ON CONFLICT DO NOTHING`,
        [communityId, ownerId]
      );

      for (let i = 0; i < 3; i++) {
        const content = postTemplates[Math.floor(Math.random() * postTemplates.length)];
        await client.query(
          `INSERT INTO posts (id, author_id, community_id, content, media, tags, category, visibility, status, published_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, '[]', '{}', '{}', 'public', 'published', NOW() - INTERVAL '${i * 2} hours', NOW() - INTERVAL '${i * 2} hours', NOW())`,
          [ownerId, communityId, content]
        );
      }

      console.log(`✅ Created community: "${comm.name}" (id: ${communityId})`);
    }

    console.log('\n🎉 Seed complete!');
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
