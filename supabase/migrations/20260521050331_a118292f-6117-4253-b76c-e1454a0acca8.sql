ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_code_unique UNIQUE (code);
ALTER TABLE public.products ADD COLUMN display_order INTEGER;
ALTER TABLE public.products ADD COLUMN variant_label TEXT;
CREATE INDEX IF NOT EXISTS idx_products_parent ON public.products(parent_product_id);