-- 1. Add product_kind to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_kind text NOT NULL DEFAULT 'single';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_kind_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_product_kind_check
  CHECK (product_kind IN ('single', 'kit'));

-- 2. product_kit_components table
CREATE TABLE IF NOT EXISTS public.product_kit_components (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1,
  decoration_id uuid REFERENCES public.product_decorations(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_kit_components_no_self CHECK (kit_product_id <> component_product_id),
  CONSTRAINT product_kit_components_qty_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_pkc_kit ON public.product_kit_components(kit_product_id);
CREATE INDEX IF NOT EXISTS idx_pkc_component ON public.product_kit_components(component_product_id);

ALTER TABLE public.product_kit_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authed read product_kit_components" ON public.product_kit_components;
DROP POLICY IF EXISTS "Authed write product_kit_components" ON public.product_kit_components;
DROP POLICY IF EXISTS "Authed update product_kit_components" ON public.product_kit_components;
DROP POLICY IF EXISTS "Authed delete product_kit_components" ON public.product_kit_components;

CREATE POLICY "Authed read product_kit_components"
  ON public.product_kit_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write product_kit_components"
  ON public.product_kit_components FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update product_kit_components"
  ON public.product_kit_components FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authed delete product_kit_components"
  ON public.product_kit_components FOR DELETE TO authenticated USING (true);

-- 3. Guard: component must be a 'single' product (no nested kits)
CREATE OR REPLACE FUNCTION public.enforce_kit_component_is_single()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT product_kind INTO v_kind FROM public.products WHERE id = NEW.component_product_id;
  IF v_kind IS DISTINCT FROM 'single' THEN
    RAISE EXCEPTION 'component_product_id must reference a single product (got %)', COALESCE(v_kind, 'unknown');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_kit_component_is_single ON public.product_kit_components;
CREATE TRIGGER trg_enforce_kit_component_is_single
  BEFORE INSERT OR UPDATE ON public.product_kit_components
  FOR EACH ROW EXECUTE FUNCTION public.enforce_kit_component_is_single();

-- Also block flipping a product to 'kit' if it is already used as a component.
CREATE OR REPLACE FUNCTION public.enforce_no_kit_demotion_of_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.product_kind = 'kit' AND OLD.product_kind <> 'kit' THEN
    IF EXISTS (SELECT 1 FROM public.product_kit_components WHERE component_product_id = NEW.id) THEN
      RAISE EXCEPTION 'cannot convert product to kit: it is referenced as a kit component';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_no_kit_demotion_of_component ON public.products;
CREATE TRIGGER trg_enforce_no_kit_demotion_of_component
  BEFORE UPDATE OF product_kind ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_no_kit_demotion_of_component();