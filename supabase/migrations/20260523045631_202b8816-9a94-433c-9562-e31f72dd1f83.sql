-- 1. Products status column (draft|live)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft','live'));

-- Backfill: set 'live' on rows that meet the Live gate (all mandatory fields).
UPDATE public.products
SET status = 'live'
WHERE supplier_id IS NOT NULL
  AND subcategory_id IS NOT NULL
  AND name IS NOT NULL AND btrim(name) <> ''
  AND production_days_min IS NOT NULL
  AND carton_pack IS NOT NULL
  AND carton_length IS NOT NULL
  AND carton_width IS NOT NULL
  AND carton_height IS NOT NULL
  AND carton_weight IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_status_idx ON public.products(status);

-- 2. Audit log table — captures every write to products and key child tables.
CREATE TABLE IF NOT EXISTS public.product_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  product_id uuid,
  action text NOT NULL CHECK (action IN ('insert','update','delete')),
  field text,
  old_value jsonb,
  new_value jsonb,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_audit_log_product_idx ON public.product_audit_log(product_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS product_audit_log_row_idx ON public.product_audit_log(table_name, row_id, changed_at DESC);

ALTER TABLE public.product_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed read product_audit_log"
  ON public.product_audit_log FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies: writes only happen via SECURITY DEFINER triggers.

-- 3. Audit trigger function. Logs:
--    - INSERT: one row, action='insert', new_value=row jsonb
--    - DELETE: one row, action='delete', old_value=row jsonb
--    - UPDATE: one row per changed field (old_value/new_value as jsonb scalars)
CREATE OR REPLACE FUNCTION public.product_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text := COALESCE(auth.uid()::text, 'system');
  v_product_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_old_v jsonb;
  v_new_v jsonb;
BEGIN
  -- Resolve product_id for child tables.
  IF TG_TABLE_NAME = 'products' THEN
    v_product_id := COALESCE((NEW).id, (OLD).id);
  ELSIF TG_TABLE_NAME = 'product_kit_components' THEN
    v_product_id := COALESCE((NEW).kit_product_id, (OLD).kit_product_id);
  ELSIF TG_TABLE_NAME = 'product_kit_tiers' THEN
    v_product_id := COALESCE((NEW).kit_product_id, (OLD).kit_product_id);
  ELSIF TG_TABLE_NAME IN ('product_decorations','product_details') THEN
    v_product_id := COALESCE((NEW).product_id, (OLD).product_id);
  ELSIF TG_TABLE_NAME = 'product_decoration_bands' THEN
    SELECT pd.product_id INTO v_product_id FROM public.product_decorations pd
      WHERE pd.id = COALESCE((NEW).product_decoration_id, (OLD).product_decoration_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.product_audit_log(table_name, row_id, product_id, action, new_value, changed_by)
    VALUES (TG_TABLE_NAME, (NEW).id, v_product_id, 'insert', to_jsonb(NEW), v_actor);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.product_audit_log(table_name, row_id, product_id, action, old_value, changed_by)
    VALUES (TG_TABLE_NAME, (OLD).id, v_product_id, 'delete', to_jsonb(OLD), v_actor);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key IN ('updated_at') THEN CONTINUE; END IF;
      v_old_v := v_old -> v_key;
      v_new_v := v_new -> v_key;
      IF v_old_v IS DISTINCT FROM v_new_v THEN
        INSERT INTO public.product_audit_log(table_name, row_id, product_id, action, field, old_value, new_value, changed_by)
        VALUES (TG_TABLE_NAME, (NEW).id, v_product_id, 'update', v_key, v_old_v, v_new_v, v_actor);
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach triggers (drop-then-create for idempotency)
DROP TRIGGER IF EXISTS audit_products ON public.products;
CREATE TRIGGER audit_products
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.product_audit_trigger();

DROP TRIGGER IF EXISTS audit_product_decorations ON public.product_decorations;
CREATE TRIGGER audit_product_decorations
AFTER INSERT OR UPDATE OR DELETE ON public.product_decorations
FOR EACH ROW EXECUTE FUNCTION public.product_audit_trigger();

DROP TRIGGER IF EXISTS audit_product_decoration_bands ON public.product_decoration_bands;
CREATE TRIGGER audit_product_decoration_bands
AFTER INSERT OR UPDATE OR DELETE ON public.product_decoration_bands
FOR EACH ROW EXECUTE FUNCTION public.product_audit_trigger();

DROP TRIGGER IF EXISTS audit_product_details ON public.product_details;
CREATE TRIGGER audit_product_details
AFTER INSERT OR UPDATE OR DELETE ON public.product_details
FOR EACH ROW EXECUTE FUNCTION public.product_audit_trigger();

DROP TRIGGER IF EXISTS audit_product_kit_components ON public.product_kit_components;
CREATE TRIGGER audit_product_kit_components
AFTER INSERT OR UPDATE OR DELETE ON public.product_kit_components
FOR EACH ROW EXECUTE FUNCTION public.product_audit_trigger();

DROP TRIGGER IF EXISTS audit_product_kit_tiers ON public.product_kit_tiers;
CREATE TRIGGER audit_product_kit_tiers
AFTER INSERT OR UPDATE OR DELETE ON public.product_kit_tiers
FOR EACH ROW EXECUTE FUNCTION public.product_audit_trigger();