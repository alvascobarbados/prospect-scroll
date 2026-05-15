
-- Phase 2: Add code column + constraints to product_categories
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS code text;

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_code_format_chk
  CHECK (
    code IS NULL
    OR (parent_id IS NULL     AND length(code) = 2 AND code ~ '^[A-Z0-9]+$')
    OR (parent_id IS NOT NULL AND length(code) = 3 AND code ~ '^[A-Z0-9]+$')
  );

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_code_unique_ci
  ON public.product_categories (UPPER(code))
  WHERE code IS NOT NULL;

-- Phase 5: Seed 11 categories then 59 subcategories.
-- base_margin_pct = 40, step_size_pct = 5 (business defaults).
WITH parent_rows (code, name) AS (
  VALUES
    ('10','Accessories'),
    ('20','Advertising & Display'),
    ('30','Apparel'),
    ('40','Bags'),
    ('50','Barware & Food Service'),
    ('60','Drinkware'),
    ('70','Office & Stationery'),
    ('80','Outdoor, Sports & Games'),
    ('90','Technology, Tools & Automotive'),
    ('H0','Home & Kitchen'),
    ('A0','Awards & Recognition')
), inserted_parents AS (
  INSERT INTO public.product_categories (code, name, parent_id, base_margin_pct, step_size_pct)
  SELECT code, name, NULL, 40, 5 FROM parent_rows
  ON CONFLICT DO NOTHING
  RETURNING id, code
)
SELECT 1;

WITH sub_rows (code, name) AS (
  VALUES
    ('101','Lanyards & Wristbands'),
    ('102','Fans'),
    ('103','Travel Accessories'),
    ('104','Novelties & Stress Relievers'),
    ('105','Pet Accessories'),

    ('201','Standing & Retractable Banners'),
    ('202','Feather & Flying Banners'),
    ('203','Promotion Counters & Brand Activations'),
    ('204','Tents & Market Umbrellas'),
    ('205','Printed Banners, Pennants & Bunting'),
    ('206','Retail POS & Merchandising'),

    ('301','Shirts & Polos'),
    ('302','Hats & Caps'),
    ('303','Hoodies, Jackets & Outerwear'),
    ('304','Athletic & Performance Wear'),
    ('305','Towels, Bandanas & Sunglasses'),

    ('401','Tote & Shopping Bags'),
    ('402','Backpacks, Laptop & Messenger Bags'),
    ('403','Drawstring Bags'),
    ('404','Gym & Duffel Bags'),
    ('405','Cooler & Lunch Bags'),
    ('406','Fanny Packs & Belt Bags'),
    ('407','Pouches, Sleeves & Cases'),
    ('408','Paper & Gift Bags'),

    ('501','Glassware'),
    ('502','Bar Tools & Equipment'),
    ('503','Aprons, Chef Wear & Bar Linen'),
    ('504','Trays & Serveware'),
    ('505','Bar Signage & Displays'),
    ('506','Coasters'),
    ('507','Packaging & Food Service'),

    ('601','Disposable & Stadium Cups'),
    ('602','Tumblers & Travel Mugs'),
    ('603','Thermos, Vacuum Flasks & Water Bottles'),
    ('604','Ceramic, Bamboo & Specialty Mugs'),
    ('605','Drinkware Accessories'),

    ('701','Writing Instruments'),
    ('702','Notebooks & Writing Pads'),
    ('703','Padfolios & Document Folders'),
    ('704','Desk Accessories, Notes & Calendars'),
    ('705','Stationery Accessories & Sets'),

    ('801','Umbrellas'),
    ('802','Fitness & Wellness'),
    ('803','Beach & Outdoor'),
    ('804','Sport Balls, Equipment & Golf'),
    ('805','Games & Puzzles'),

    ('901','Keyrings'),
    ('902','Car Accessories'),
    ('903','Tools, Lighting & Safety'),
    ('904','Technology & Electronics'),
    ('905','Magnets & Stickers'),

    ('H01','Health & Personal Care'),
    ('H02','Kitchen Gadgets & Accessories'),
    ('H03','Aprons & Kitchen Textiles'),
    ('H04','Corporate & Lifestyle Gift Sets'),

    ('A01','Trophies'),
    ('A02','Plaques & Frames'),
    ('A03','Medals, Ribbons & Coins'),
    ('A04','Lapel Pins & Badges'),
    ('A05','Crystal, Glass & Acrylic Awards'),
    ('A06','Clocks & Desk Awards')
)
INSERT INTO public.product_categories (code, name, parent_id, base_margin_pct, step_size_pct)
SELECT s.code, s.name, p.id, 40, 5
FROM sub_rows s
JOIN public.product_categories p
  ON p.parent_id IS NULL AND p.code = substring(s.code from 1 for 2)
ON CONFLICT DO NOTHING;

-- Pricing Defaults settings (global, editable via Settings page)
INSERT INTO public.app_settings (section, key, value, value_type, display_label, display_order, description)
VALUES
  ('Pricing Defaults','default_category_margin_pct','40','number','Default Category Margin %',1,'Pre-fills Base Margin % when adding a new category or subcategory.'),
  ('Pricing Defaults','default_category_step_size_pct','5','number','Default Category Step Size %',2,'Pre-fills Step Size % when adding a new category or subcategory.')
ON CONFLICT DO NOTHING;
