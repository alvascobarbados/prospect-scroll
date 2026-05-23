-- 1. Seed "No Decoration" method + detail (idempotent)
INSERT INTO public.decoration_methods (code, name, sub_rule_type, notes)
SELECT 'NODECO', 'No Decoration', 'A', 'System method: bypass for products with no print. Does not contribute to setup/run cost.'
WHERE NOT EXISTS (SELECT 1 FROM public.decoration_methods WHERE upper(code) = 'NODECO');

INSERT INTO public.method_details (decoration_method_id, code, detail, n_setup, n_run, notes)
SELECT m.id, 'NODECO', 'No decoration', 0, 0, 'System detail: zero-cost bypass.'
FROM public.decoration_methods m
WHERE upper(m.code) = 'NODECO'
  AND NOT EXISTS (
    SELECT 1 FROM public.method_details md
    WHERE md.decoration_method_id = m.id AND upper(md.code) = 'NODECO'
  );

-- 2. Trigger blocking 2nd PRINT decoration on a product used as a kit component.
CREATE OR REPLACE FUNCTION public.enforce_kit_component_max_one_print()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_method_code text;
  v_print_count int;
  v_is_component boolean;
BEGIN
  v_product_id := NEW.product_id;

  SELECT EXISTS (SELECT 1 FROM public.product_kit_components WHERE component_product_id = v_product_id)
    INTO v_is_component;
  IF NOT v_is_component THEN RETURN NEW; END IF;

  -- Resolve method code for the new decoration's method_detail.
  SELECT upper(dm.code) INTO v_method_code
  FROM public.method_details md
  JOIN public.decoration_methods dm ON dm.id = md.decoration_method_id
  WHERE md.id = NEW.method_detail_id;

  -- Allow No Decoration freely.
  IF v_method_code = 'NODECO' THEN RETURN NEW; END IF;

  -- Count existing PRINT decorations on this product (excluding NODECO and the row itself on UPDATE).
  SELECT count(*) INTO v_print_count
  FROM public.product_decorations pd
  JOIN public.method_details md ON md.id = pd.method_detail_id
  JOIN public.decoration_methods dm ON dm.id = md.decoration_method_id
  WHERE pd.product_id = v_product_id
    AND upper(dm.code) <> 'NODECO'
    AND (TG_OP = 'INSERT' OR pd.id <> NEW.id);

  IF v_print_count >= 1 THEN
    RAISE EXCEPTION 'Cannot add a second print method: this product is used as a kit component (v1: components are limited to one print method).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_kit_component_max_one_print ON public.product_decorations;
CREATE TRIGGER trg_enforce_kit_component_max_one_print
BEFORE INSERT OR UPDATE ON public.product_decorations
FOR EACH ROW EXECUTE FUNCTION public.enforce_kit_component_max_one_print();