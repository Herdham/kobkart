ALTER TABLE rotation_members
  ADD COLUMN choice_product_id UUID REFERENCES products(id),
  ADD COLUMN choice_color TEXT,
  ADD COLUMN choice_size TEXT,
  ADD COLUMN chosen_at TIMESTAMPTZ;