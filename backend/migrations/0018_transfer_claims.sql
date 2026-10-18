CREATE TABLE transfer_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    seller_id UUID NOT NULL REFERENCES users(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ
);
CREATE INDEX idx_claims_seller ON transfer_claims(seller_id, status);
-- a customer can have only one waiting notice per plan, so nobody can spam a seller
CREATE UNIQUE INDEX one_pending_claim ON transfer_claims(plan_id) WHERE status = 'pending';
