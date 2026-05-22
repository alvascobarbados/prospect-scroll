CREATE TABLE public.product_includes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_includes_product ON public.product_includes(product_id, sort_order);

ALTER TABLE public.product_includes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed read product_includes" ON public.product_includes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write product_includes" ON public.product_includes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update product_includes" ON public.product_includes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authed delete product_includes" ON public.product_includes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_product_includes_updated_at BEFORE UPDATE ON public.product_includes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();