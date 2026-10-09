ALTER TABLE channels ADD COLUMN kind TEXT NOT NULL DEFAULT 'save' CHECK (kind IN ('save', 'rotation'));
ALTER TABLE channels ADD COLUMN slots INT CHECK (slots IS NULL OR slots BETWEEN 2 AND 100);
ALTER TABLE channels ADD COLUMN start_date DATE;
ALTER TABLE channels ADD COLUMN rotation_status TEXT NOT NULL DEFAULT 'open' CHECK (rotation_status IN ('open', 'running', 'finished'));

-- group members have no product, only a place in the order
ALTER TABLE plans ALTER COLUMN product_id DROP NOT NULL;

CREATE TABLE rotation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id),
    user_id UUID NOT NULL REFERENCES users(id),
    plan_id UUID NOT NULL REFERENCES plans(id),
    position INT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_id, user_id)
);
CREATE INDEX idx_rotation_members_channel ON rotation_members(channel_id, position);

CREATE TABLE rotation_rounds (
    channel_id UUID NOT NULL REFERENCES channels(id),
    round_no INT NOT NULL,
    due_date DATE NOT NULL,
    collected BOOLEAN NOT NULL DEFAULT FALSE,
    collected_at TIMESTAMPTZ,
    PRIMARY KEY (channel_id, round_no)
);