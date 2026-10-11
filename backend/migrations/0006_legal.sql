ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE rotation_members ADD COLUMN committed_at TIMESTAMPTZ;