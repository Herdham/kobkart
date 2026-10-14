ALTER TABLE products ADD COLUMN brand TEXT;

CREATE TABLE product_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('color', 'size')),
    label TEXT NOT NULL,
    sold_out BOOLEAN NOT NULL DEFAULT FALSE,
    position INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_options ON product_options(product_id);

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    color TEXT,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_images ON product_images(product_id);

-- the single photo each product already has becomes its first photo
INSERT INTO product_images (product_id, data, position)
SELECT id, image_url, 0 FROM products WHERE image_url IS NOT NULL;

ALTER TABLE plans ADD COLUMN choice_color TEXT, ADD COLUMN choice_size TEXT;