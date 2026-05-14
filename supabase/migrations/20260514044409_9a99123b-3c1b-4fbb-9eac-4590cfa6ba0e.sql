DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers','suppliers','team_members','products','buyers',
    'origins','destinations','app_settings','rounding_rules',
    'decoration_methods','method_details','product_categories',
    'shipping_methods','projects','line_items','project_notes',
    'project_log_entries','shipments'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;