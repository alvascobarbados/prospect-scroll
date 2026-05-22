
ALTER TABLE public.shipping_method_routes
  ADD COLUMN IF NOT EXISTS include_inland_freight boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_decoration_bands
  ADD COLUMN IF NOT EXISTS inland_freight_usd numeric NULL;
