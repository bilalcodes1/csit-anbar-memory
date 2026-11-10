ALTER TABLE albums ADD COLUMN is_activity INTEGER NOT NULL DEFAULT 0 CHECK (is_activity IN (0, 1));
CREATE INDEX IF NOT EXISTS idx_albums_activity ON albums(is_activity, published, sort_order);
