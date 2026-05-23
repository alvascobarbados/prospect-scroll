DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_includes_product_id_fkey'
  ) THEN
    ALTER TABLE public.product_includes
      ADD CONSTRAINT product_includes_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;