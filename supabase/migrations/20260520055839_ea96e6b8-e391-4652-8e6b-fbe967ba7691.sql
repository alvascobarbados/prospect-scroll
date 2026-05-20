-- 1a. detail_labels
CREATE TABLE public.detail_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX detail_labels_label_unique ON public.detail_labels (UPPER(label));
ALTER TABLE public.detail_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed select detail_labels" ON public.detail_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed insert detail_labels" ON public.detail_labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update detail_labels" ON public.detail_labels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authed delete detail_labels" ON public.detail_labels FOR DELETE TO authenticated USING (true);
ALTER TABLE public.detail_labels REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.detail_labels;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.detail_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.detail_labels (label, sort_order) VALUES
  ('Material', 10), ('Size', 20), ('Color', 30), ('Capacity', 40),
  ('Pages', 50), ('Cover', 60), ('Closure', 70), ('Handle', 80),
  ('Lining', 90), ('Pockets', 100), ('Clip', 110), ('Ports', 120),
  ('Origin', 130);

-- 1b. product_details
CREATE TABLE public.product_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  detail_label_id uuid NOT NULL REFERENCES public.detail_labels(id) ON DELETE RESTRICT,
  value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_details_unique ON public.product_details (product_id, detail_label_id);
ALTER TABLE public.product_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed select product_details" ON public.product_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed insert product_details" ON public.product_details FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update product_details" ON public.product_details FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authed delete product_details" ON public.product_details FOR DELETE TO authenticated USING (true);
ALTER TABLE public.product_details REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_details;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1c. production_days range
ALTER TABLE public.products
  ADD COLUMN production_days_min integer,
  ADD COLUMN production_days_max integer;
UPDATE public.products SET production_days_min = production_days WHERE production_days IS NOT NULL;
UPDATE public.products SET production_days_min = 1 WHERE production_days_min IS NULL;
ALTER TABLE public.products
  ALTER COLUMN production_days_min SET NOT NULL,
  DROP COLUMN production_days;
ALTER TABLE public.products
  ADD CONSTRAINT production_days_min_positive CHECK (production_days_min > 0),
  ADD CONSTRAINT production_days_max_gte_min CHECK (production_days_max IS NULL OR production_days_max >= production_days_min);

-- 1d. image columns
ALTER TABLE public.products ADD COLUMN image_url text;
ALTER TABLE public.product_decorations ADD COLUMN ref_image_url text;

-- 1e. storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('product-images', 'product-images', true),
  ('decoration-refs', 'decoration-refs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read product-images"
  ON storage.objects FOR SELECT TO public USING (bucket_id = 'product-images');
CREATE POLICY "Authed upload product-images"
  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Authed update product-images"
  ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Authed delete product-images"
  ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images');

CREATE POLICY "Public read decoration-refs"
  ON storage.objects FOR SELECT TO public USING (bucket_id = 'decoration-refs');
CREATE POLICY "Authed upload decoration-refs"
  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'decoration-refs');
CREATE POLICY "Authed update decoration-refs"
  ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'decoration-refs') WITH CHECK (bucket_id = 'decoration-refs');
CREATE POLICY "Authed delete decoration-refs"
  ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'decoration-refs');