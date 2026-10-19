ALTER TABLE channels
  ADD COLUMN basket_budget BIGINT CHECK (basket_budget IS NULL OR basket_budget >= 100000),
  ADD COLUMN basket_product_id UUID REFERENCES products(id);

CREATE TABLE basket_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    unit_price BIGINT NOT NULL CHECK (unit_price > 0),
    quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 50),
    color TEXT,
    size TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_basket_plan ON basket_items(plan_id);
