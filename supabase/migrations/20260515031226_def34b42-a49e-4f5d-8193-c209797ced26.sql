ALTER TABLE public.suppliers ADD COLUMN code text;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_code_length_chk
  CHECK (code IS NULL OR (length(code) = 3 AND code ~ '^[A-Z0-9]{3}$'));

CREATE UNIQUE INDEX suppliers_code_unique_ci ON public.suppliers (UPPER(code)) WHERE code IS NOT NULL;