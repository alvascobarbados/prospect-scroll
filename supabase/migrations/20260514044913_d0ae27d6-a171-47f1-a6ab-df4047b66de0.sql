ALTER TABLE public.suppliers
  ADD COLUMN weight_unit text NOT NULL DEFAULT 'kg',
  ADD COLUMN volume_unit text NOT NULL DEFAULT 'cbm';

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_weight_unit_chk CHECK (weight_unit IN ('kg', 'lbs')),
  ADD CONSTRAINT suppliers_volume_unit_chk CHECK (volume_unit IN ('cbm', 'cuft'));

-- Back-fill: USA/Miami suppliers use imperial; rest keep metric defaults
UPDATE public.suppliers s
SET weight_unit = 'lbs', volume_unit = 'cuft'
FROM public.origins o
WHERE s.origin_id = o.id
  AND upper(o.code) IN ('USA_NON_MIAMI', 'MIAMI');