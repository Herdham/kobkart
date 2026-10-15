ALTER TABLE sellers
  ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'standard', 'plus')),
  ADD COLUMN plan_expires_at DATE;

CREATE TABLE plan_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES users(id),
    plan TEXT NOT NULL,
    months INT NOT NULL DEFAULT 1,
    amount BIGINT NOT NULL,   -- plan price you receive, in kobo
    charged BIGINT NOT NULL,  -- what the seller paid, in kobo
    method TEXT NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ
);
CREATE INDEX idx_plan_payments_seller ON plan_payments(seller_id);