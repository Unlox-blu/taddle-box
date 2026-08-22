'use strict';

// Load .env before anything else
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

/**
 * run-migration.js
 * 
 * Node.js migration script — run with:
 *   node run-migration.js
 * 
 * Creates chat tables + backfills media preview_url for SSOT.
 */

const pool = require('./src/config/database');

const MIGRATIONS = [
  // ── Migration 1: Chat tables ──────────────────────────────────────
  {
    name: 'create_chat_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_message  TEXT,
        last_message_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS conversation_participants (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_read_at    TIMESTAMPTZ,
        UNIQUE(conversation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_type    TEXT NOT NULL DEFAULT 'text',
        content         TEXT,
        post_id         UUID REFERENCES posts(id) ON DELETE SET NULL,
        game_name       TEXT,
        game_invite_code TEXT,
        game_lobby_id   TEXT,
        reactions       JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id);
      CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON conversation_participants(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
    `,
  },
  // ── Migration 2: Chat trigger ─────────────────────────────────────
  {
    name: 'chat_timestamp_trigger',
    sql: `
      CREATE OR REPLACE FUNCTION update_conversation_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE conversations
        SET updated_at = NOW(),
            last_message = COALESCE(NEW.content, NEW.message_type),
            last_message_at = NEW.created_at
        WHERE id = NEW.conversation_id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_update_conversation ON messages;
      CREATE TRIGGER trg_update_conversation
        AFTER INSERT ON messages
        FOR EACH ROW
        EXECUTE FUNCTION update_conversation_timestamp();
    `,
  },
  // ── Migration 3: Media preview_url column + backfill ──────────────
  {
    name: 'media_preview_url',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'media' AND column_name = 'preview_url'
        ) THEN
          ALTER TABLE media ADD COLUMN preview_url TEXT;
        END IF;
      END $$;

      UPDATE media SET preview_url = COALESCE(vimeo_thumbnail_url, cloudfront_url)
      WHERE media_type = 'video' AND preview_url IS NULL;

      UPDATE media SET preview_url = cloudfront_url
      WHERE media_type = 'image' AND preview_url IS NULL;

      UPDATE media SET preview_url = cloudfront_url
      WHERE media_type = 'audio' AND preview_url IS NULL;
    `,
  },
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    // Get already-run migrations (table uses 'filename' column)
    const { rows: run } = await client.query('SELECT filename FROM _migrations');
    const runSet = new Set(run.map((r) => r.filename));

    // Tables that each migration is expected to create — if any are
    // missing the migration is re-run even though _migrations says it
    // already ran (handles stale tracking after db/reset.js).
    const TABLE_CHECKS = {
      create_chat_tables: ['conversations', 'conversation_participants', 'messages'],
    };

    for (const migration of MIGRATIONS) {
      if (runSet.has(migration.name)) {
        // Verify the tables actually exist — stale _migrations entries
        // happen after db/reset.js which drops tables but only tracks
        // its own db/migrations/ files.
        const expectedTables = TABLE_CHECKS[migration.name];
        if (expectedTables) {
          const { rows: check } = await client.query(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
            [expectedTables]
          );
          const found = new Set(check.map(r => r.tablename));
          const missing = expectedTables.filter(t => !found.has(t));
          if (missing.length > 0) {
            console.log(`⚠️  ${migration.name}: missing tables [${missing.join(', ')}] — re-running`);
            // Remove stale tracking so it gets re-inserted after success
            await client.query('DELETE FROM _migrations WHERE filename = $1', [migration.name]);
          } else {
            console.log(`⏭  Skipping: ${migration.name} (already run)`);
            continue;
          }
        } else {
          console.log(`⏭  Skipping: ${migration.name} (already run)`);
          continue;
        }
      }

      console.log(`▶  Running: ${migration.name}`);
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
        console.log(`✅ Done: ${migration.name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed: ${migration.name}`);
        console.error(err.message);
        process.exit(1);
      }
    }

    console.log('\n🎉 All migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
