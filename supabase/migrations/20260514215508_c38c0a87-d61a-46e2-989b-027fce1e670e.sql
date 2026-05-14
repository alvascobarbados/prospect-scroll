-- Per-method fields
ALTER TABLE public.shipping_methods
  ADD COLUMN IF NOT EXISTS fuel_surcharge_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_pct numeric NOT NULL DEFAULT 0;

-- Routes (Method × Origin × Destination)
CREATE TABLE IF NOT EXISTS public.shipping_method_routes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipping_method_id uuid NOT NULL REFERENCES public.shipping_methods(id) ON DELETE CASCADE,
  origin_id uuid NOT NULL REFERENCES public.origins(id) ON DELETE RESTRICT,
  destination_id uuid NOT NULL REFERENCES public.destinations(id) ON DELETE RESTRICT,
  fixed_cost numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipping_method_id, origin_id, destination_id)
);

ALTER TABLE public.shipping_method_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed read shipping_method_routes" ON public.shipping_method_routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write shipping_method_routes" ON public.shipping_method_routes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update shipping_method_routes" ON public.shipping_method_routes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete shipping_method_routes" ON public.shipping_method_routes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_updated_at_shipping_method_routes
  BEFORE UPDATE ON public.shipping_method_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tiers (per-route bands)
CREATE TABLE IF NOT EXISTS public.shipping_method_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id uuid NOT NULL REFERENCES public.shipping_method_routes(id) ON DELETE CASCADE,
  band_from numeric NOT NULL DEFAULT 0,
  band_to numeric,
  rate numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_method_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed read shipping_method_tiers" ON public.shipping_method_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write shipping_method_tiers" ON public.shipping_method_tiers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update shipping_method_tiers" ON public.shipping_method_tiers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete shipping_method_tiers" ON public.shipping_method_tiers FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_updated_at_shipping_method_tiers
  BEFORE UPDATE ON public.shipping_method_tiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_shipping_method_routes_method ON public.shipping_method_routes(shipping_method_id);
CREATE INDEX IF NOT EXISTS idx_shipping_method_tiers_route ON public.shipping_method_tiers(route_id);

-- Realtime
ALTER TABLE public.shipping_method_routes REPLICA IDENTITY FULL;
ALTER TABLE public.shipping_method_tiers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipping_method_routes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipping_method_tiers;