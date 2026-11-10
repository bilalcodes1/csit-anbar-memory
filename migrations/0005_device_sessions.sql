ALTER TABLE sessions ADD COLUMN device_id INTEGER REFERENCES device_tokens(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id);
