
CREATE OR REPLACE FUNCTION public.heal_data_relationships(
  p_actor_id text DEFAULT 'system',
  p_actor_name text DEFAULT 'System'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_projects_healed int := 0;
  v_projects_unmatched int := 0;
  v_customers_healed int := 0;
  v_customers_unmatched int := 0;
  v_suppliers_healed int := 0;
  v_suppliers_unmatched int := 0;
  v_unmatched jsonb := '[]'::jsonb;
  v_dest_bb uuid;
  v_dest_carib uuid;
  v_orig_china uuid;
  v_orig_miami uuid;
  v_orig_usa uuid;
  r record;
  v_buyer_ids uuid[];
  v_cust_id uuid;
BEGIN
  -- ===== Step 1: Heal projects.buyer_id =====
  FOR r IN
    SELECT p.id, p.customer, p.contact_person
    FROM projects p
    WHERE p.deleted_at IS NULL
      AND p.buyer_id IS NULL
      AND p.contact_person IS NOT NULL
      AND btrim(p.contact_person) <> ''
  LOOP
    v_cust_id := NULL;
    v_buyer_ids := NULL;

    SELECT c.id INTO v_cust_id
    FROM customers c
    WHERE lower(btrim(c.name)) = lower(btrim(r.customer))
    LIMIT 1;

    IF v_cust_id IS NULL THEN
      v_projects_unmatched := v_projects_unmatched + 1;
      IF jsonb_array_length(v_unmatched) < 20 THEN
        v_unmatched := v_unmatched || jsonb_build_object(
          'kind','project_buyer','project_id',r.id,'customer',r.customer,
          'contact_person',r.contact_person,'reason','customer_not_found');
      END IF;
      CONTINUE;
    END IF;

    SELECT array_agg(b.id) INTO v_buyer_ids
    FROM buyers b
    WHERE b.customer_id = v_cust_id
      AND lower(btrim(b.name)) = lower(btrim(r.contact_person));

    IF v_buyer_ids IS NULL OR array_length(v_buyer_ids,1) = 0 THEN
      v_projects_unmatched := v_projects_unmatched + 1;
      IF jsonb_array_length(v_unmatched) < 20 THEN
        v_unmatched := v_unmatched || jsonb_build_object(
          'kind','project_buyer','project_id',r.id,'customer',r.customer,
          'contact_person',r.contact_person,'reason','no_buyer_match');
      END IF;
    ELSIF array_length(v_buyer_ids,1) > 1 THEN
      v_projects_unmatched := v_projects_unmatched + 1;
      IF jsonb_array_length(v_unmatched) < 20 THEN
        v_unmatched := v_unmatched || jsonb_build_object(
          'kind','project_buyer','project_id',r.id,'customer',r.customer,
          'contact_person',r.contact_person,'reason','ambiguous_buyer_match',
          'match_count',array_length(v_buyer_ids,1));
      END IF;
    ELSE
      UPDATE projects SET buyer_id = v_buyer_ids[1], updated_at = now() WHERE id = r.id;
      INSERT INTO project_log_entries (id, project_id, action_type, actor_user_id, actor_display_name, description, metadata, ts)
      VALUES (
        'log-heal-' || r.id || '-' || extract(epoch from now())::text || '-' || floor(random()*100000)::text,
        r.id, 'field_edit', p_actor_id, p_actor_name,
        'Auto-healed buyer_id from contact_person=''' || r.contact_person || '''',
        jsonb_build_object('field','buyer_id','source','heal_data_relationships',
                           'contact_person',r.contact_person,'buyer_id',v_buyer_ids[1]),
        now()
      );
      v_projects_healed := v_projects_healed + 1;
    END IF;
  END LOOP;

  -- ===== Step 2: Heal customers.destination_id =====
  SELECT id INTO v_dest_bb FROM destinations WHERE upper(code) = 'BB' LIMIT 1;
  SELECT id INTO v_dest_carib FROM destinations
   WHERE upper(code) IN ('CARIB','CARIBBEAN') OR lower(name) LIKE '%caribbean%' LIMIT 1;

  FOR r IN
    SELECT id, country FROM customers
    WHERE destination_id IS NULL AND country IS NOT NULL AND btrim(country) <> ''
  LOOP
    IF lower(btrim(r.country)) = 'local' AND v_dest_bb IS NOT NULL THEN
      UPDATE customers SET destination_id = v_dest_bb, updated_at = now() WHERE id = r.id;
      v_customers_healed := v_customers_healed + 1;
    ELSIF lower(btrim(r.country)) = 'regional' AND v_dest_carib IS NOT NULL THEN
      UPDATE customers SET destination_id = v_dest_carib, updated_at = now() WHERE id = r.id;
      v_customers_healed := v_customers_healed + 1;
    ELSE
      v_customers_unmatched := v_customers_unmatched + 1;
      IF jsonb_array_length(v_unmatched) < 20 THEN
        v_unmatched := v_unmatched || jsonb_build_object(
          'kind','customer_destination','customer_id',r.id,'country',r.country,'reason','no_country_rule');
      END IF;
    END IF;
  END LOOP;

  -- ===== Step 3: Heal suppliers.origin_id =====
  SELECT id INTO v_orig_china FROM origins WHERE upper(code) = 'CHINA' LIMIT 1;
  SELECT id INTO v_orig_miami FROM origins WHERE upper(code) = 'MIAMI' LIMIT 1;
  SELECT id INTO v_orig_usa   FROM origins WHERE upper(code) = 'USA_NON_MIAMI' LIMIT 1;

  FOR r IN
    SELECT id, country FROM suppliers
    WHERE origin_id IS NULL AND country IS NOT NULL AND btrim(country) <> ''
  LOOP
    IF lower(r.country) LIKE '%miami%' AND v_orig_miami IS NOT NULL THEN
      UPDATE suppliers SET origin_id = v_orig_miami, updated_at = now() WHERE id = r.id;
      v_suppliers_healed := v_suppliers_healed + 1;
    ELSIF lower(btrim(r.country)) = 'china' AND v_orig_china IS NOT NULL THEN
      UPDATE suppliers SET origin_id = v_orig_china, updated_at = now() WHERE id = r.id;
      v_suppliers_healed := v_suppliers_healed + 1;
    ELSIF lower(btrim(r.country)) IN ('usa','united states','us') AND v_orig_usa IS NOT NULL THEN
      UPDATE suppliers SET origin_id = v_orig_usa, updated_at = now() WHERE id = r.id;
      v_suppliers_healed := v_suppliers_healed + 1;
    ELSE
      v_suppliers_unmatched := v_suppliers_unmatched + 1;
      IF jsonb_array_length(v_unmatched) < 20 THEN
        v_unmatched := v_unmatched || jsonb_build_object(
          'kind','supplier_origin','supplier_id',r.id,'country',r.country,'reason','no_country_rule');
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'projects_buyer_id_healed', v_projects_healed,
    'projects_buyer_id_unmatched', v_projects_unmatched,
    'customers_destination_id_healed', v_customers_healed,
    'customers_destination_id_unmatched', v_customers_unmatched,
    'suppliers_origin_id_healed', v_suppliers_healed,
    'suppliers_origin_id_unmatched', v_suppliers_unmatched,
    'unmatched_details', v_unmatched,
    'ran_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.heal_data_relationships(text, text) TO authenticated;
