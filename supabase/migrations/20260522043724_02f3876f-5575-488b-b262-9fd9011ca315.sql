ALTER TABLE public.shipping_methods
  ADD COLUMN IF NOT EXISTS chargeable_metric text NOT NULL DEFAULT 'CHARGEABLE_WEIGHT',
  ADD COLUMN IF NOT EXISTS chargeable_unit text NOT NULL DEFAULT 'lbs';

ALTER TABLE public.shipping_methods
  ADD CONSTRAINT shipping_methods_chargeable_metric_chk
    CHECK (chargeable_metric IN ('ACTUAL_WEIGHT','VOLUMETRIC_WEIGHT','CHARGEABLE_WEIGHT','VOLUME'));

UPDATE public.shipping_methods
SET chargeable_metric = 'CHARGEABLE_WEIGHT', chargeable_unit = 'lbs'
WHERE upper(code) = 'DHL';

UPDATE public.shipping_methods
SET chargeable_metric = 'VOLUME', chargeable_unit = 'CBM'
WHERE upper(code) = 'OCEAN';