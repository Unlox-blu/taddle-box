CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION posts_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(COALESCE(NEW.tags, '{}'), ' ')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posts_search_vector_update ON posts;
CREATE TRIGGER trg_posts_search_vector_update
  BEFORE INSERT OR UPDATE OF title, tags, content
  ON posts
  FOR EACH ROW
  EXECUTE FUNCTION posts_search_vector_update();

UPDATE posts
SET search_vector = 
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(COALESCE(tags, '{}'), ' ')), 'B') ||
    setweight(to_tsvector('english', COALESCE(content, '')), 'C')
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts_search_vector ON posts USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING GIN (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_name_trgm ON users USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_communities_name_trgm ON communities USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_communities_slug_trgm ON communities USING GIN (slug gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_communities_description_trgm ON communities USING GIN (description gin_trgm_ops);
