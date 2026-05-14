
-- ─── ORIGINS ─────────────────────────────────────────────────────────────
CREATE TABLE public.origins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX origins_code_upper_uq ON public.origins (UPPER(code));
ALTER TABLE public.origins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read origins"   ON public.origins FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write origins"  ON public.origins FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update origins" ON public.origins FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete origins" ON public.origins FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_origins_updated BEFORE UPDATE ON public.origins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.origins (code, name) VALUES
  ('CHINA', 'China'),
  ('MIAMI', 'Miami, USA'),
  ('USA_NON_MIAMI', 'USA (excluding Miami)');

-- ─── DESTINATIONS ────────────────────────────────────────────────────────
CREATE TABLE public.destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX destinations_code_upper_uq ON public.destinations (UPPER(code));
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read destinations"   ON public.destinations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write destinations"  ON public.destinations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update destinations" ON public.destinations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete destinations" ON public.destinations FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_destinations_updated BEFORE UPDATE ON public.destinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.destinations (code, name) VALUES
  ('BB', 'Barbados'),
  ('CBN', 'Caribbean (excluding Barbados)');

-- ─── PRODUCT CATEGORIES ──────────────────────────────────────────────────
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  base_margin_pct numeric NOT NULL,
  step_size_pct numeric NOT NULL,
  duty_rate_pct numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read product_categories"   ON public.product_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write product_categories"  ON public.product_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update product_categories" ON public.product_categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete product_categories" ON public.product_categories FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_product_categories_updated BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── DECORATION METHODS ──────────────────────────────────────────────────
CREATE TABLE public.decoration_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  sub_rule_type text NOT NULL CHECK (sub_rule_type IN ('A','B','C')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX decoration_methods_code_upper_uq ON public.decoration_methods (UPPER(code));
ALTER TABLE public.decoration_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read decoration_methods"   ON public.decoration_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write decoration_methods"  ON public.decoration_methods FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update decoration_methods" ON public.decoration_methods FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete decoration_methods" ON public.decoration_methods FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_decoration_methods_updated BEFORE UPDATE ON public.decoration_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.decoration_methods (code, name, sub_rule_type) VALUES
  ('SUB',  'Full Colour Dye Sublimation', 'A'),
  ('HT',   'Heat Transfer Print',         'A'),
  ('UV',   'UV Printing',                 'A'),
  ('DIG',  'Digital Printing',            'A'),
  ('DEB',  'Deboss',                      'A'),
  ('EMB',  'Emboss',                      'A'),
  ('DSM',  'Die Struck Moulding',         'A'),
  ('DOM',  '3D Doming',                   'A'),
  ('INJ',  'Injection Moulding',          'A'),
  ('LZR',  'Laser Engraving',             'B'),
  ('FS',   'Foil Stamping',               'B'),
  ('EM',   'Embroidery',                  'B'),
  ('EM3D', '3D Embroidery',               'B'),
  ('SP',   'Screen Print',                'C'),
  ('PP',   'Pad Print',                   'C'),
  ('OFF',  'Offset Printing',             'C');

-- ─── METHOD DETAILS ──────────────────────────────────────────────────────
CREATE TABLE public.method_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decoration_method_id uuid NOT NULL REFERENCES public.decoration_methods(id) ON DELETE CASCADE,
  code text NOT NULL,
  detail text NOT NULL,
  n_setup integer NOT NULL DEFAULT 0,
  n_run integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX method_details_code_upper_uq ON public.method_details (UPPER(code));
CREATE INDEX method_details_method_idx ON public.method_details (decoration_method_id);
ALTER TABLE public.method_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read method_details"   ON public.method_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write method_details"  ON public.method_details FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update method_details" ON public.method_details FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete method_details" ON public.method_details FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_method_details_updated BEFORE UPDATE ON public.method_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Type A: one detail per method, code = method code, detail = method name
INSERT INTO public.method_details (decoration_method_id, code, detail, n_setup, n_run)
SELECT id, code, name, 0, 0 FROM public.decoration_methods WHERE sub_rule_type = 'A';

-- Type B/C seeds
WITH m AS (SELECT code, id FROM public.decoration_methods)
INSERT INTO public.method_details (decoration_method_id, code, detail, n_setup, n_run) VALUES
  ((SELECT id FROM m WHERE code='SP'),  'SP-1C1P',  '1 colour, 1 position',   1, 0),
  ((SELECT id FROM m WHERE code='SP'),  'SP-2C1P',  '2 colours, 1 position',  2, 1),
  ((SELECT id FROM m WHERE code='SP'),  'SP-3C1P',  '3 colours, 1 position',  3, 2),
  ((SELECT id FROM m WHERE code='SP'),  'SP-4C1P',  '4 colours, 1 position',  4, 3),
  ((SELECT id FROM m WHERE code='SP'),  'SP-FC1P',  'Full colour, 1 position',4, 3),
  ((SELECT id FROM m WHERE code='PP'),  'PP-1C1P',  '1 colour, 1 position',   1, 0),
  ((SELECT id FROM m WHERE code='PP'),  'PP-2C1P',  '2 colours, 1 position',  2, 1),
  ((SELECT id FROM m WHERE code='PP'),  'PP-3C1P',  '3 colours, 1 position',  3, 2),
  ((SELECT id FROM m WHERE code='PP'),  'PP-4C1P',  '4 colours, 1 position',  4, 3),
  ((SELECT id FROM m WHERE code='PP'),  'PP-FC1P',  'Full colour, 1 position',4, 3),
  ((SELECT id FROM m WHERE code='OFF'), 'OFF-1C',   '1 colour',               1, 0),
  ((SELECT id FROM m WHERE code='OFF'), 'OFF-2C',   '2 colours',              2, 1),
  ((SELECT id FROM m WHERE code='OFF'), 'OFF-3C',   '3 colours',              3, 2),
  ((SELECT id FROM m WHERE code='OFF'), 'OFF-4C',   '4 colours',              4, 3),
  ((SELECT id FROM m WHERE code='OFF'), 'OFF-FC',   'Full colour',            4, 3),
  ((SELECT id FROM m WHERE code='LZR'), 'LZR-1P',   '1 position',             1, 0),
  ((SELECT id FROM m WHERE code='LZR'), 'LZR-AO',   'All over',               1, 0),
  ((SELECT id FROM m WHERE code='EM'),  'EM-SM',    'Small',                  1, 0),
  ((SELECT id FROM m WHERE code='EM'),  'EM-MD',    'Medium',                 1, 0),
  ((SELECT id FROM m WHERE code='EM'),  'EM-LG',    'Large',                  1, 0),
  ((SELECT id FROM m WHERE code='EM'),  'EM-XL',    'Extra Large',            1, 0),
  ((SELECT id FROM m WHERE code='EM3D'),'EM3D-SM',  'Small',                  1, 0),
  ((SELECT id FROM m WHERE code='EM3D'),'EM3D-MD',  'Medium',                 1, 0),
  ((SELECT id FROM m WHERE code='EM3D'),'EM3D-LG',  'Large',                  1, 0),
  ((SELECT id FROM m WHERE code='EM3D'),'EM3D-XL',  'Extra Large',            1, 0),
  ((SELECT id FROM m WHERE code='FS'),  'FS-GLD',   'Gold foil',              1, 0),
  ((SELECT id FROM m WHERE code='FS'),  'FS-SLV',   'Silver foil',            1, 0);

-- ─── SHIPPING METHODS ────────────────────────────────────────────────────
CREATE TABLE public.shipping_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shipping_methods_code_upper_uq ON public.shipping_methods (UPPER(code));
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read shipping_methods"   ON public.shipping_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write shipping_methods"  ON public.shipping_methods FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update shipping_methods" ON public.shipping_methods FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete shipping_methods" ON public.shipping_methods FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_shipping_methods_updated BEFORE UPDATE ON public.shipping_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.shipping_methods (code, name) VALUES
  ('DHL',   'DHL Courier'),
  ('OCEAN', 'Ocean Freight');

-- ─── ROUNDING RULES ──────────────────────────────────────────────────────
CREATE TABLE public.rounding_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  band_min numeric NOT NULL,
  band_max numeric,
  round_up_to numeric NOT NULL,
  description text,
  display_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rounding_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read rounding_rules"   ON public.rounding_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write rounding_rules"  ON public.rounding_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update rounding_rules" ON public.rounding_rules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete rounding_rules" ON public.rounding_rules FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_rounding_rules_updated BEFORE UPDATE ON public.rounding_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.rounding_rules (band_min, band_max, round_up_to, description, display_order) VALUES
  (0,     1,     0.005, 'Sub-dollar',     1),
  (1,     10,    0.05,  'Single digits',  2),
  (10,    100,   0.50,  'Tens',           3),
  (100,   1000,  1.00,  'Hundreds',       4),
  (1000,  10000, 10.00, 'Thousands',      5),
  (10000, NULL,  100.00,'Ten-thousands+', 6);

-- ─── APP SETTINGS ────────────────────────────────────────────────────────
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  key text NOT NULL,
  value text,
  value_type text NOT NULL DEFAULT 'text',
  display_label text,
  display_order integer NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section, key)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read app_settings"   ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write app_settings"  ON public.app_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update app_settings" ON public.app_settings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete app_settings" ON public.app_settings FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (section, key, value, value_type, display_label, display_order) VALUES
  ('Currency & FX',  'fx_rate_usd_bbd',         '2.02768', 'number',  'FX Rate USD→BBD', 1),
  ('Currency & FX',  'fx_fee_pct',              '2.0',     'percent', 'FX Fee (Barbados law on USD purchases)', 2),
  ('Customs & Duty', 'bb_customs_usd_factor',   '2.0',     'number',  'Barbados Customs USD Conversion Factor', 1),
  ('Customs & Duty', 'dvf',                     '1.0',     'number',  'DVF', 2),
  ('Freight',        'volumetric_weight_factor','200',     'number',  'Volumetric Weight Factor (CBM × this = kg)', 1);

-- ─── SUPPLIERS: add origin_id + back-fill ────────────────────────────────
ALTER TABLE public.suppliers ADD COLUMN origin_id uuid REFERENCES public.origins(id) ON DELETE SET NULL;

UPDATE public.suppliers SET origin_id = (SELECT id FROM public.origins WHERE UPPER(code) = 'CHINA')
  WHERE country = 'China';
UPDATE public.suppliers SET origin_id = (SELECT id FROM public.origins WHERE UPPER(code) = 'MIAMI')
  WHERE country ILIKE '%miami%';
UPDATE public.suppliers SET origin_id = (SELECT id FROM public.origins WHERE UPPER(code) = 'USA_NON_MIAMI')
  WHERE origin_id IS NULL AND (country = 'USA' OR country ILIKE 'united states%');

-- ─── CUSTOMERS: add destination_id + back-fill ───────────────────────────
ALTER TABLE public.customers ADD COLUMN destination_id uuid REFERENCES public.destinations(id) ON DELETE SET NULL;

UPDATE public.customers SET destination_id = (SELECT id FROM public.destinations WHERE UPPER(code) = 'BB')
  WHERE country = 'Local';
UPDATE public.customers SET destination_id = (SELECT id FROM public.destinations WHERE UPPER(code) = 'CBN')
  WHERE country = 'Regional';
