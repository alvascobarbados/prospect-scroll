ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS dimension_unit text NOT NULL DEFAULT 'cm',
  ADD COLUMN IF NOT EXISTS weight_unit_v2 text NOT NULL DEFAULT 'kg';

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_dimension_unit_chk CHECK (dimension_unit IN ('cm','in')),
  ADD CONSTRAINT suppliers_weight_unit_v2_chk CHECK (weight_unit_v2 IN ('kg','lb'));

UPDATE public.suppliers
SET dimension_unit = CASE WHEN unit_system = 'imperial' THEN 'in' ELSE 'cm' END,
    weight_unit_v2 = CASE WHEN unit_system = 'imperial' THEN 'lb' ELSE 'kg' END;

INSERT INTO public.app_settings (key, section, display_label, value_type, value, display_order, description)
VALUES ('conversions_in_to_cm', 'conversions', 'Inches → cm', 'number', '2.54', 100, 'Conversion factor: 1 inch = 2.54 cm')
ON CONFLICT DO NOTHING;