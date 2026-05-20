ALTER TABLE public.products
  ADD COLUMN parent_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX products_parent_idx ON public.products(parent_product_id);