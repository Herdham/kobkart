ALTER TABLE channels ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE channels ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_channels_public ON channels(is_public, category);