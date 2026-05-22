
CREATE TABLE public.product_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL,
  url text NOT NULL,
  role text NOT NULL DEFAULT 'additional',
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_images_role_chk CHECK (role IN ('hero','reference','additional'))
);

CREATE INDEX product_images_product_idx ON public.product_images(product_id);
CREATE UNIQUE INDEX product_images_one_primary_per_role
  ON public.product_images(product_id, role)
  WHERE is_primary = true;

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed read product_images" ON public.product_images
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write product_images" ON public.product_images
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update product_images" ON public.product_images
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authed delete product_images" ON public.product_images
  FOR DELETE TO authenticated USING (true);

INSERT INTO public.product_images (product_id, url, role, is_primary, sort_order)
SELECT id, image_url, 'hero', true, 0
FROM public.products
WHERE image_url IS NOT NULL AND image_url <> '';
