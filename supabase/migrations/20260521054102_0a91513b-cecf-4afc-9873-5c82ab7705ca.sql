ALTER TABLE public.products ADD COLUMN IF NOT EXISTS parent_name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- Backfill children
UPDATE public.products c
SET parent_name = p.name,
    variant_name = COALESCE(c.variant_name, c.variant_label)
FROM public.products p
WHERE c.parent_product_id = p.id;

-- Backfill parents
UPDATE public.products p
SET parent_name = p.name,
    variant_name = COALESCE(p.variant_name, p.variant_label)
WHERE EXISTS (SELECT 1 FROM public.products c WHERE c.parent_product_id = p.id);

-- Unique label (case-insensitive) on detail_labels
CREATE UNIQUE INDEX IF NOT EXISTS detail_labels_label_lower_uniq
  ON public.detail_labels (LOWER(label));