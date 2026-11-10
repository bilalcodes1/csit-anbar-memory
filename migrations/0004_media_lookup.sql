CREATE INDEX IF NOT EXISTS idx_batches_cover_key ON batches(cover_key);
CREATE INDEX IF NOT EXISTS idx_photos_object_key ON photos(object_key);
UPDATE audit_log SET details = json_remove(details, '$.password') WHERE entity_type = 'user' AND json_valid(details) AND json_type(details, '$.password') IS NOT NULL;
