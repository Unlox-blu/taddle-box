-- db/seeds/dev.seed.sql
-- Development seed data — DO NOT RUN IN PRODUCTION

-- Admin user (password: Admin@123!)
INSERT INTO users (id, name, username, email, password_hash, role, is_verified, email_verified_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Super Admin', 'superadmin', 'superadmin@taddlebox.dev',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniQyTD5rnqx3Kl9QqFezAtWji', 'superadmin', TRUE, NOW()),
  ('00000000-0000-0000-0000-000000000002', 'Priya Shah', 'priya_shah', 'priya@taddlebox.dev',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniQyTD5rnqx3Kl9QqFezAtWji', 'user', TRUE, NOW()),
  ('00000000-0000-0000-0000-000000000003', 'Aryan Kumar', 'aryan_k', 'aryan@taddlebox.dev',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniQyTD5rnqx3Kl9QqFezAtWji', 'user', TRUE, NOW()),
  ('00000000-0000-0000-0000-000000000004', 'Meera Nair', 'meera_nair', 'meera@taddlebox.dev',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniQyTD5rnqx3Kl9QqFezAtWji', 'user', TRUE, NOW()),
  ('00000000-0000-0000-0000-000000000005', 'Dev Patel', 'dev_patel', 'dev@taddlebox.dev',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniQyTD5rnqx3Kl9QqFezAtWji', 'user', TRUE, NOW())
ON CONFLICT DO NOTHING;

-- Wallets
INSERT INTO wallets (user_id, balance_cents)
VALUES
  ('00000000-0000-0000-0000-000000000001', 100000),
  ('00000000-0000-0000-0000-000000000002', 50000),
  ('00000000-0000-0000-0000-000000000003', 25000),
  ('00000000-0000-0000-0000-000000000004', 10000),
  ('00000000-0000-0000-0000-000000000005', 5000)
ON CONFLICT DO NOTHING;

-- Communities
INSERT INTO communities (id, owner_id, name, slug, description, privacy, category)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'Tech Builders India', 'tech-builders-india', 'A community for Indian tech builders, developers and founders.',
   'public', ARRAY['technology', 'startups']),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
   'Design Collective', 'design-collective', 'UI/UX designers sharing work and feedback.',
   'public', ARRAY['design', 'ux']),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004',
   'Indie Hackers INR', 'indie-hackers-inr', 'Building profitable products solo.',
   'public', ARRAY['startups', 'entrepreneurship'])
ON CONFLICT DO NOTHING;

-- Community members (owners as admins)
INSERT INTO community_members (community_id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'admin'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'admin'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'member'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'member')
ON CONFLICT DO NOTHING;

-- Posts
INSERT INTO posts (author_id, community_id, title, content, post_type, tags, status, visibility, published_at)
VALUES
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'Building a production Node.js API in 2025', 'Here is what I learned after shipping 3 production APIs...',
   'text', ARRAY['nodejs','backend','api'], 'published', 'public', NOW()),
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',
   'Design system I built in 30 days', 'I went from zero to a complete design system. Here is the breakdown...',
   'text', ARRAY['design','figma','ui'], 'published', 'public', NOW()),
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003',
   'Crossed ₹1L MRR as an indie hacker', 'It took 18 months but I finally crossed ₹1,00,000 MRR...',
   'text', ARRAY['revenue','indiehacker','saas'], 'published', 'public', NOW())
ON CONFLICT DO NOTHING;
