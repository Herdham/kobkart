ALTER TABLE channels ADD COLUMN join_mode TEXT NOT NULL DEFAULT 'approval' CHECK (join_mode IN ('open', 'approval'));

CREATE TABLE join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX one_pending_request ON join_requests (channel_id, user_id) WHERE status = 'pending';