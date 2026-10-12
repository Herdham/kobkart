ALTER TABLE plans ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE plans ADD COLUMN guest_name TEXT, ADD COLUMN guest_phone TEXT;
ALTER TABLE plans ADD CONSTRAINT plans_owner_chk CHECK (customer_id IS NOT NULL OR guest_name IS NOT NULL);
ALTER TABLE rotation_members ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE payments
  ADD COLUMN method TEXT NOT NULL DEFAULT 'online',
  ADD COLUMN note TEXT,
  ADD COLUMN recorded_by UUID REFERENCES users(id);