CREATE TABLE public.product_kit_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_kit_tiers_kit_product_id ON public.product_kit_tiers(kit_product_id);

ALTER TABLE public.product_kit_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed read product_kit_tiers" ON public.product_kit_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write product_kit_tiers" ON public.product_kit_tiers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update product_kit_tiers" ON public.product_kit_tiers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete product_kit_tiers" ON public.product_kit_tiers FOR DELETE TO authenticated USING (true);