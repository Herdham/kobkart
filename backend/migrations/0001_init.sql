-- All money is stored in KOBO (N1,000 = 100000)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','seller','admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sellers (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    business_name TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    paystack_subaccount_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    contribution_amount BIGINT NOT NULL CHECK (contribution_amount > 0),
    frequency_days INT NOT NULL DEFAULT 5 CHECK (frequency_days BETWEEN 1 AND 90),
    invite_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id),
    name TEXT NOT NULL,
    description TEXT,
    price BIGINT NOT NULL CHECK (price > 0),
    image_url TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id),
    channel_id UUID NOT NULL REFERENCES channels(id),
    product_id UUID NOT NULL REFERENCES products(id),
    locked_price BIGINT NOT NULL,
    installment_amount BIGINT NOT NULL,
    amount_paid BIGINT NOT NULL DEFAULT 0,
    next_due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','delivered','cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id),
    amount BIGINT NOT NULL,
    platform_fee BIGINT NOT NULL DEFAULT 0,
    reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_channels_seller ON channels(seller_id);
CREATE INDEX idx_products_channel ON products(channel_id);
CREATE INDEX idx_plans_customer ON plans(customer_id);
CREATE INDEX idx_plans_channel ON plans(channel_id);
CREATE INDEX idx_payments_plan ON payments(plan_id);
