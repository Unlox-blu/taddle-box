-- Aggregation metadata for stacked notifications (Instagram-style "A and B
-- liked your post"): the worker stores actorCount + actor ids/names so the
-- app can render the +N badge and stacked copy without re-deriving it.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS meta JSONB;
