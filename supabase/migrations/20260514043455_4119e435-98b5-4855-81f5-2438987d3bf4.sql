CREATE UNIQUE INDEX IF NOT EXISTS origins_code_unique_ci ON public.origins (UPPER(code));
CREATE UNIQUE INDEX IF NOT EXISTS destinations_code_unique_ci ON public.destinations (UPPER(code));