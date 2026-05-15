-- Phase 1B-1G: Products schema foundation

-- Drop legacy products table (empty, 0 rows, no enforced FKs)
DROP TABLE IF EXISTS public.products CASCADE;

-- ============ products ============
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_item_number text NOT NULL UNIQUE
    CHECK (primary_item_number ~ '^[A-Z0-9]{6}[A-Z]$'),
  subcategory_id uuid NOT NULL REFERENCES public.product_categories(id),
  origin_id uuid NOT NULL REFERENCES public.origins(id),
  name text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  supplier_item_name text,
  supplier_item_number text,
  supplier_description text,
  carton_pack integer CHECK (carton_pack IS NULL OR carton_pack > 0),
  carton_length numeric CHECK (carton_length IS NULL OR carton_length > 0),
  carton_width numeric CHECK (carton_width IS NULL OR carton_width > 0),
  carton_height numeric CHECK (carton_height IS NULL OR carton_height > 0),
  carton_weight numeric CHECK (carton_weight IS NULL OR carton_weight > 0),
  production_days integer CHECK (production_days IS NULL OR production_days > 0),
  moq integer CHECK (moq IS NULL OR moq > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_subcategory ON public.products(subcategory_id);
CREATE INDEX idx_products_origin ON public.products(origin_id);
CREATE INDEX idx_products_supplier ON public.products(supplier_id);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update products" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete products" ON public.products FOR DELETE TO authenticated USING (true);

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;

-- ============ product_decorations ============
CREATE TABLE public.product_decorations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  method_detail_id uuid NOT NULL REFERENCES public.method_details(id),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, method_detail_id)
);

CREATE INDEX idx_product_decorations_product ON public.product_decorations(product_id);
CREATE INDEX idx_product_decorations_method_detail ON public.product_decorations(method_detail_id);

ALTER TABLE public.product_decorations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read product_decorations" ON public.product_decorations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write product_decorations" ON public.product_decorations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update product_decorations" ON public.product_decorations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete product_decorations" ON public.product_decorations FOR DELETE TO authenticated USING (true);

CREATE TRIGGER product_decorations_set_updated_at
  BEFORE UPDATE ON public.product_decorations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_decorations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_decorations;

-- ============ product_decoration_bands ============
CREATE TABLE public.product_decoration_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_decoration_id uuid NOT NULL REFERENCES public.product_decorations(id) ON DELETE CASCADE,
  qty integer NOT NULL CHECK (qty > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  setup_cost numeric NOT NULL DEFAULT 0 CHECK (setup_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_decoration_id, qty)
);

CREATE INDEX idx_product_decoration_bands_decoration ON public.product_decoration_bands(product_decoration_id);

ALTER TABLE public.product_decoration_bands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read product_decoration_bands" ON public.product_decoration_bands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write product_decoration_bands" ON public.product_decoration_bands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update product_decoration_bands" ON public.product_decoration_bands FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete product_decoration_bands" ON public.product_decoration_bands FOR DELETE TO authenticated USING (true);

CREATE TRIGGER product_decoration_bands_set_updated_at
  BEFORE UPDATE ON public.product_decoration_bands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_decoration_bands REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_decoration_bands;
