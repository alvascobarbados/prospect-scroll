/**
 * Shipping Methods — three-level inline editor:
 *   Method (per-method fuel %, buffer %)
 *     └─ Route (Method × Origin × Destination, fixed cost)
 *          └─ Tier (band_from, band_to, rate)
 *
 * Models on DecorationMethods.tsx pattern, extended with one extra indent level.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, MoreVertical, Trash2, FolderPlus, Layers, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditableCell } from "@/components/leads/SimpleMasterPage";
import { supabase } from "@/integrations/supabase/client";

type ChargeableMetric = "ACTUAL_WEIGHT" | "VOLUMETRIC_WEIGHT" | "CHARGEABLE_WEIGHT" | "VOLUME";

const METRIC_LABEL: Record<ChargeableMetric, string> = {
  ACTUAL_WEIGHT: "Actual Weight",
  VOLUMETRIC_WEIGHT: "Volumetric Weight",
  CHARGEABLE_WEIGHT: "Chargeable Weight",
  VOLUME: "Volume",
};

/** Singular form of a unit for "per <unit>" labels (e.g. lbs → lb, CBM → CBM). */
const unitSingular = (u: string) => {
  const t = u.trim();
  if (!t) return t;
  if (t.toLowerCase() === "lbs") return "lb";
  if (t.toLowerCase() === "kgs") return "kg";
  return t;
};

interface SMethod {
  id: string; code: string; name: string;
  fuel_surcharge_pct: number; buffer_pct: number;
  notes: string | null;
  chargeable_metric: ChargeableMetric;
  chargeable_unit: string;
}
interface SRoute {
  id: string; shipping_method_id: string;
  origin_id: string; destination_id: string;
  fixed_cost: number; notes: string | null;
  lac_fixed_bbd: number; lac_per_cbm_bbd: number;
}
interface STier {
  id: string; route_id: string;
  band_from: number; band_to: number | null; rate: number; notes: string | null;
}
interface OriginRow { id: string; code: string; name: string }
interface DestRow { id: string; code: string; name: string }

const numOrZero = (raw: string): number => {
  const n = parseFloat(raw.trim());
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

export default function ShippingMethodsPage() {
  const navigate = useNavigate();
  const [methods, setMethods] = useState<SMethod[]>([]);
  const [routes, setRoutes] = useState<SRoute[]>([]);
  const [tiers, setTiers] = useState<STier[]>([]);
  const [origins, setOrigins] = useState<OriginRow[]>([]);
  const [destinations, setDestinations] = useState<DestRow[]>([]);
  const [q, setQ] = useState("");
  const [confirmDelMethod, setConfirmDelMethod] = useState<SMethod | null>(null);
  const [confirmDelRoute, setConfirmDelRoute] = useState<SRoute | null>(null);
  const [confirmDelTier, setConfirmDelTier] = useState<STier | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [m, r, t, o, d] = await Promise.all([
        supabase.from("shipping_methods").select("*").order("code"),
        supabase.from("shipping_method_routes").select("*"),
        supabase.from("shipping_method_tiers").select("*").order("band_from"),
        supabase.from("origins").select("id,code,name").order("code"),
        supabase.from("destinations").select("id,code,name").order("code"),
      ]);
      if (!mounted) return;
      if (m.data) setMethods(m.data as SMethod[]);
      if (r.data) setRoutes(r.data as SRoute[]);
      if (t.data) setTiers(t.data as STier[]);
      if (o.data) setOrigins(o.data as OriginRow[]);
      if (d.data) setDestinations(d.data as DestRow[]);
    };
    load();
    const ch = supabase.channel("master-shipmethods")
      .on("postgres_changes", { event: "*", schema: "public", table: "shipping_methods" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipping_method_routes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipping_method_tiers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "origins" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "destinations" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  const originById = useMemo(() => new Map(origins.map((o) => [o.id, o])), [origins]);
  const destById = useMemo(() => new Map(destinations.map((d) => [d.id, d])), [destinations]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return methods.slice().sort((a, b) => a.code.localeCompare(b.code)).map((m) => {
      const rs = routes.filter((r) => r.shipping_method_id === m.id);
      const matchSelf = !term || m.code.toLowerCase().includes(term) || m.name.toLowerCase().includes(term);
      const matchedRoutes = rs.some((r) => {
        const oc = originById.get(r.origin_id)?.code?.toLowerCase() ?? "";
        const dc = destById.get(r.destination_id)?.code?.toLowerCase() ?? "";
        return oc.includes(term) || dc.includes(term);
      });
      const include = matchSelf || matchedRoutes;
      return { method: m, routes: rs, include };
    }).filter((g) => g.include);
  }, [methods, routes, q, originById, destById]);

  // ─── Methods ──────────────────────────────────────────────────────────
  const updateMethod = async (row: SMethod, key: keyof SMethod, raw: string) => {
    let value: any = raw.trim();
    if (key === "code") {
      if (!value) { toast.error("Code is required"); return false; }
      value = value.toUpperCase();
    } else if (key === "name") {
      if (!value) { toast.error("Name is required"); return false; }
    } else if (key === "fuel_surcharge_pct" || key === "buffer_pct") {
      value = numOrZero(raw);
    } else if (key === "chargeable_metric") {
      const allowed = ["ACTUAL_WEIGHT","VOLUMETRIC_WEIGHT","CHARGEABLE_WEIGHT","VOLUME"];
      if (!allowed.includes(value)) { toast.error("Invalid chargeable metric"); return false; }
    } else if (key === "chargeable_unit") {
      if (!value) { toast.error("Unit is required"); return false; }
    } else if (!value) value = null;
    const prev = methods;
    setMethods((ms) => ms.map((m) => (m.id === row.id ? { ...m, [key]: value } as SMethod : m)));
    const { error } = await supabase.from("shipping_methods").update({ [key]: value } as any).eq("id", row.id);
    if (error) { setMethods(prev); toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  const addMethod = async () => {
    const code = `NEW${Math.floor(Math.random() * 999)}`;
    const { data, error } = await supabase.from("shipping_methods").insert({
      code, name: "New shipping method", fuel_surcharge_pct: 0, buffer_pct: 0,
      chargeable_metric: "CHARGEABLE_WEIGHT", chargeable_unit: "lbs",
    } as any).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    if (data) setMethods((ms) => [...ms.filter((m) => m.id !== (data as any).id), data as SMethod]);
  };

  const handleDeleteMethod = async () => {
    if (!confirmDelMethod) return;
    const id = confirmDelMethod.id;
    const prev = methods;
    setMethods((ms) => ms.filter((m) => m.id !== id));
    const { error } = await supabase.from("shipping_methods").delete().eq("id", id);
    if (error) { setMethods(prev); toast.error(`Delete failed: ${error.message}`); }
    else toast.success(`${confirmDelMethod.code} deleted`);
    setConfirmDelMethod(null);
  };

  // ─── Routes ───────────────────────────────────────────────────────────
  const updateRoute = async (row: SRoute, key: keyof SRoute, raw: string) => {
    let value: any = raw.trim();
    if (key === "fixed_cost" || key === "lac_fixed_bbd" || key === "lac_per_cbm_bbd") {
      const n = numOrZero(raw);
      if (n < 0) { toast.error("Must be ≥ 0"); return false; }
      value = n;
    } else if (key === "origin_id" || key === "destination_id") {
      if (!value) return false;
    } else if (!value) value = null;
    const prev = routes;
    setRoutes((rs) => rs.map((r) => (r.id === row.id ? { ...r, [key]: value } as SRoute : r)));
    const { error } = await supabase.from("shipping_method_routes").update({ [key]: value } as any).eq("id", row.id);
    if (error) { setRoutes(prev); toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  const addRoute = async (methodId: string) => {
    if (!origins.length || !destinations.length) {
      toast.error("Add an origin and destination first");
      return;
    }
    const { data, error } = await supabase.from("shipping_method_routes").insert({
      shipping_method_id: methodId,
      origin_id: origins[0].id,
      destination_id: destinations[0].id,
      fixed_cost: 0,
    }).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    if (data) setRoutes((rs) => [...rs.filter((r) => r.id !== (data as any).id), data as SRoute]);
  };

  const handleDeleteRoute = async () => {
    if (!confirmDelRoute) return;
    const id = confirmDelRoute.id;
    const prev = routes;
    setRoutes((rs) => rs.filter((r) => r.id !== id));
    const { error } = await supabase.from("shipping_method_routes").delete().eq("id", id);
    if (error) { setRoutes(prev); toast.error(`Delete failed: ${error.message}`); }
    else toast.success(`Route deleted`);
    setConfirmDelRoute(null);
  };

  // ─── Tiers ────────────────────────────────────────────────────────────
  const updateTier = async (row: STier, key: keyof STier, raw: string) => {
    let value: any = raw.trim();
    if (key === "band_from" || key === "rate") value = numOrZero(raw);
    else if (key === "band_to") value = numOrNull(raw);
    else if (!value) value = null;
    const prev = tiers;
    setTiers((ts) => ts.map((t) => (t.id === row.id ? { ...t, [key]: value } as STier : t)));
    const { error } = await supabase.from("shipping_method_tiers").update({ [key]: value } as any).eq("id", row.id);
    if (error) { setTiers(prev); toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  const addTier = async (routeId: string) => {
    const existing = tiers.filter((t) => t.route_id === routeId);
    const last = existing.sort((a, b) => (a.band_to ?? Infinity) - (b.band_to ?? Infinity)).at(-1);
    const band_from = last ? Number(last.band_to ?? last.band_from) : 0;
    const { data, error } = await supabase.from("shipping_method_tiers").insert({
      route_id: routeId, band_from, band_to: null, rate: 0,
    }).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    if (data) setTiers((ts) => [...ts.filter((t) => t.id !== (data as any).id), data as STier]);
  };

  const handleDeleteTier = async () => {
    if (!confirmDelTier) return;
    const id = confirmDelTier.id;
    const prev = tiers;
    setTiers((ts) => ts.filter((t) => t.id !== id));
    const { error } = await supabase.from("shipping_method_tiers").delete().eq("id", id);
    if (error) { setTiers(prev); toast.error(`Delete failed: ${error.message}`); }
    else toast.success(`Tier deleted`);
    setConfirmDelTier(null);
  };

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        <header className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
            <button onClick={() => navigate("/")} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted/50">
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Master data</div>
              <h1 className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}>
                Shipping Methods <span className="text-muted-foreground font-light">· {methods.length}</span>
              </h1>
            </div>
            <button onClick={addMethod}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{ background: "hsl(var(--brand-orange))", color: "white", minHeight: 40 }}>
              <Plus className="h-4 w-4" /> Add Method
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
          <div
            className="mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-snug"
            style={{
              borderColor: "hsl(var(--brand-navy) / 0.18)",
              background: "hsl(var(--brand-navy) / 0.04)",
              color: "hsl(var(--brand-navy) / 0.85)",
            }}
            role="note"
          >
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Tier ranges are inclusive at the lower bound and exclusive at the upper bound.
              A value equal to a tier&rsquo;s upper limit moves to the next tier.
            </p>
          </div>
          <div className="relative my-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search methods, origins or destinations…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }} />
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-x-auto">
            <table className="w-full text-[13px] border-collapse" style={{ minWidth: 1100 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.06)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                  <Th rowSpan={2}>Code / Route / Band</Th>
                  <Th rowSpan={2}>Name / From → To</Th>
                  <Th rowSpan={2}>Fuel %</Th>
                  <Th rowSpan={2} divider>Buffer %</Th>
                  <Th rowSpan={2}>Fixed cost</Th>
                  <Th rowSpan={2} divider>Rate</Th>
                  <th
                    colSpan={2}
                    className="text-center text-[10px] uppercase tracking-[0.18em] font-semibold px-3 pt-2.5 pb-1"
                    style={{
                      color: "hsl(var(--brand-navy) / 0.7)",
                      background: "rgba(229, 234, 241, 0.6)",
                      borderRight: "1px solid hsl(var(--brand-navy) / 0.12)",
                    }}
                  >
                    LAC (BBD)
                  </th>
                  <Th rowSpan={2}>Notes</Th>
                  <th rowSpan={2} className="w-8" />
                </tr>
                <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                  <th
                    className="text-left text-[10px] uppercase tracking-[0.14em] font-medium px-3 pb-2"
                    style={{ color: "hsl(var(--brand-navy) / 0.55)", background: "rgba(229, 234, 241, 0.6)" }}
                  >
                    Fixed
                  </th>
                  <th
                    className="text-left text-[10px] uppercase tracking-[0.14em] font-medium px-3 pb-2"
                    style={{ color: "hsl(var(--brand-navy) / 0.55)", background: "rgba(229, 234, 241, 0.6)", borderRight: "1px solid hsl(var(--brand-navy) / 0.12)" }}
                  >
                    Per CBM
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map(({ method, routes: rs }) => (
                  <MethodGroup
                    key={method.id}
                    method={method}
                    routes={rs}
                    tiers={tiers}
                    origins={origins}
                    destinations={destinations}
                    onUpdateMethod={updateMethod}
                    onUpdateRoute={updateRoute}
                    onUpdateTier={updateTier}
                    onAddRoute={() => addRoute(method.id)}
                    onAddTier={(routeId) => addTier(routeId)}
                    onDeleteMethod={() => setConfirmDelMethod(method)}
                    onDeleteRoute={(r) => setConfirmDelRoute(r)}
                    onDeleteTier={(t) => setConfirmDelTier(t)}
                  />
                ))}
                {groups.length === 0 && (
                  <tr><td colSpan={10} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
                    {q ? "No matches." : "No methods yet."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        <ConfirmDialog
          open={!!confirmDelMethod}
          onCancel={() => setConfirmDelMethod(null)}
          title={confirmDelMethod ? `Delete ${confirmDelMethod.code}?` : ""}
          description="All routes and tiers under this method will also be deleted. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteMethod}
        />
        <ConfirmDialog
          open={!!confirmDelRoute}
          onCancel={() => setConfirmDelRoute(null)}
          title="Delete route?"
          description="All tiers under this route will also be deleted. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteRoute}
        />
        <ConfirmDialog
          open={!!confirmDelTier}
          onCancel={() => setConfirmDelTier(null)}
          title="Delete tier?"
          description="This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteTier}
        />
      </div>
    </DesktopAppShell>
  );
}

const DIVIDER_L: React.CSSProperties = { borderLeft: "1px solid hsl(var(--brand-navy) / 0.12)" };
const LAC_TINT: React.CSSProperties = { background: "rgba(229, 234, 241, 0.4)" };
const LAC_TINT_R: React.CSSProperties = { background: "rgba(229, 234, 241, 0.4)", borderRight: "1px solid hsl(var(--brand-navy) / 0.12)" };

const Th = ({ children, className, rowSpan, divider }: { children?: React.ReactNode; className?: string; rowSpan?: number; divider?: boolean }) => (
  <th rowSpan={rowSpan} className={cn("text-left text-[10px] uppercase tracking-[0.18em] font-semibold px-3 py-2.5", className)}
    style={{ color: "hsl(var(--brand-navy) / 0.65)", borderLeft: divider ? "1px solid hsl(var(--brand-navy) / 0.12)" : undefined }}>{children}</th>
);

// ─── Inline select (origin / destination) ────────────────────────────────
const InlineSelect = ({
  value, options, onChange,
}: {
  value: string;
  options: { id: string; code: string; name: string }[];
  onChange: (v: string) => Promise<boolean | void>;
}) => (
  <select
    value={value}
    onChange={async (e) => { await onChange(e.target.value); }}
    className="w-full rounded border border-transparent hover:border-[hsl(var(--brand-navy)/0.25)] focus:border-[hsl(var(--brand-navy)/0.4)] bg-transparent px-1 py-0.5 text-[13px] focus:outline-none"
  >
    {options.map((o) => (
      <option key={o.id} value={o.id}>{o.code}</option>
    ))}
  </select>
);

const MethodGroup = ({
  method, routes, tiers, origins, destinations,
  onUpdateMethod, onUpdateRoute, onUpdateTier,
  onAddRoute, onAddTier, onDeleteMethod, onDeleteRoute, onDeleteTier,
}: {
  method: SMethod; routes: SRoute[]; tiers: STier[];
  origins: OriginRow[]; destinations: DestRow[];
  onUpdateMethod: (row: SMethod, key: keyof SMethod, raw: string) => Promise<boolean>;
  onUpdateRoute: (row: SRoute, key: keyof SRoute, raw: string) => Promise<boolean>;
  onUpdateTier: (row: STier, key: keyof STier, raw: string) => Promise<boolean>;
  onAddRoute: () => void;
  onAddTier: (routeId: string) => void;
  onDeleteMethod: () => void;
  onDeleteRoute: (r: SRoute) => void;
  onDeleteTier: (t: STier) => void;
}) => {
  const originById = useMemo(() => new Map(origins.map((o) => [o.id, o])), [origins]);
  const destById = useMemo(() => new Map(destinations.map((d) => [d.id, d])), [destinations]);
  return (
    <>
      {/* Method row */}
      <tr className="hover:bg-muted/20 transition-colors" style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.02)" }}>
        <td className="px-3 py-2 align-top font-semibold" style={{ color: "hsl(var(--brand-navy))" }}>
          <EditableCell value={method.code} uppercase onSave={(v) => onUpdateMethod(method, "code", v)} />
        </td>
        <td className="px-3 py-2 align-top font-semibold">
          <EditableCell value={method.name} onSave={(v) => onUpdateMethod(method, "name", v)} />
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
            <span>charges on</span>
            <select
              value={method.chargeable_metric}
              onChange={async (e) => { await onUpdateMethod(method, "chargeable_metric", e.target.value); }}
              className="rounded border border-transparent hover:border-[hsl(var(--brand-navy)/0.25)] focus:border-[hsl(var(--brand-navy)/0.4)] bg-transparent px-1 py-0.5 text-[11px] focus:outline-none"
              style={{ color: "hsl(var(--brand-navy))" }}
            >
              {(Object.keys(METRIC_LABEL) as ChargeableMetric[]).map((k) => (
                <option key={k} value={k}>{METRIC_LABEL[k]}</option>
              ))}
            </select>
            <span>(</span>
            <div className="w-12">
              <EditableCell value={method.chargeable_unit} onSave={(v) => onUpdateMethod(method, "chargeable_unit", v)} />
            </div>
            <span>)</span>
          </div>
        </td>
        <td className="px-3 py-2 align-top">
          <EditableCell value={String(method.fuel_surcharge_pct)} onSave={(v) => onUpdateMethod(method, "fuel_surcharge_pct", v)} />
        </td>
        <td className="px-3 py-2 align-top" style={DIVIDER_L}>
          <EditableCell value={String(method.buffer_pct)} onSave={(v) => onUpdateMethod(method, "buffer_pct", v)} />
        </td>
        <td className="px-3 py-2 align-top text-muted-foreground italic">—</td>
        <td className="px-3 py-2 align-top text-muted-foreground italic" style={DIVIDER_L}>—</td>
        <td className="px-3 py-2 align-top text-muted-foreground italic" style={LAC_TINT}>—</td>
        <td className="px-3 py-2 align-top text-muted-foreground italic" style={LAC_TINT_R}>—</td>
        <td className="px-3 py-2 align-top">
          <EditableCell value={method.notes ?? ""} onSave={(v) => onUpdateMethod(method, "notes", v)} />
        </td>
        <td className="px-2 py-2 align-top">
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-1 rounded hover:bg-muted/50 text-muted-foreground" aria-label="Method actions">
                <MoreVertical className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              <button onClick={onAddRoute}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
                style={{ color: "hsl(var(--brand-navy))" }}>
                <FolderPlus className="h-4 w-4" /> Add route
              </button>
              <button onClick={onDeleteMethod}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-destructive/10 text-destructive flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Delete method
              </button>
            </PopoverContent>
          </Popover>
        </td>
      </tr>

      {/* Routes + tiers */}
      {routes.map((r) => {
        const rTiers = tiers
          .filter((t) => t.route_id === r.id)
          .sort((a, b) => Number(a.band_from) - Number(b.band_from));
        const oCode = originById.get(r.origin_id)?.code ?? "?";
        const dCode = destById.get(r.destination_id)?.code ?? "?";
        return (
          <RouteAndTiers
            key={r.id}
            route={r}
            tiers={rTiers}
            origins={origins}
            destinations={destinations}
            oCode={oCode}
            dCode={dCode}
            chargeableUnit={method.chargeable_unit}
            onUpdateRoute={onUpdateRoute}
            onUpdateTier={onUpdateTier}
            onAddTier={() => onAddTier(r.id)}
            onDeleteRoute={() => onDeleteRoute(r)}
            onDeleteTier={onDeleteTier}
          />
        );
      })}
    </>
  );
};

const RouteAndTiers = ({
  route, tiers, origins, destinations, oCode, dCode,
  onUpdateRoute, onUpdateTier, onAddTier, onDeleteRoute, onDeleteTier,
}: {
  route: SRoute; tiers: STier[];
  origins: OriginRow[]; destinations: DestRow[];
  oCode: string; dCode: string;
  onUpdateRoute: (row: SRoute, key: keyof SRoute, raw: string) => Promise<boolean>;
  onUpdateTier: (row: STier, key: keyof STier, raw: string) => Promise<boolean>;
  onAddTier: () => void;
  onDeleteRoute: () => void;
  onDeleteTier: (t: STier) => void;
}) => (
  <>
    <tr className="hover:bg-muted/20 transition-colors" style={{ borderBottom: "1px dashed hsl(var(--brand-navy) / 0.08)" }}>
      <td className="px-3 py-2 align-top text-[12px] uppercase tracking-wider text-muted-foreground" style={{ paddingLeft: 28 }}>
        Route
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2">
          <InlineSelect value={route.origin_id} options={origins} onChange={(v) => onUpdateRoute(route, "origin_id", v)} />
          <span className="text-muted-foreground">→</span>
          <InlineSelect value={route.destination_id} options={destinations} onChange={(v) => onUpdateRoute(route, "destination_id", v)} />
        </div>
      </td>
      <td className="px-3 py-2 align-top text-muted-foreground italic">—</td>
      <td className="px-3 py-2 align-top text-muted-foreground italic" style={DIVIDER_L}>—</td>
      <td className="px-3 py-2 align-top">
        <EditableCell value={String(route.fixed_cost)} onSave={(v) => onUpdateRoute(route, "fixed_cost", v)} />
      </td>
      <td className="px-3 py-2 align-top text-muted-foreground italic" style={DIVIDER_L}>—</td>
      <td className="px-3 py-2 align-top" style={LAC_TINT}>
        <EditableCell value={route.lac_fixed_bbd ? String(route.lac_fixed_bbd) : ""} onSave={(v) => onUpdateRoute(route, "lac_fixed_bbd", v)} />
      </td>
      <td className="px-3 py-2 align-top" style={LAC_TINT_R}>
        <EditableCell value={route.lac_per_cbm_bbd ? String(route.lac_per_cbm_bbd) : ""} onSave={(v) => onUpdateRoute(route, "lac_per_cbm_bbd", v)} />
      </td>
      <td className="px-3 py-2 align-top">
        <EditableCell value={route.notes ?? ""} onSave={(v) => onUpdateRoute(route, "notes", v)} />
      </td>
      <td className="px-2 py-2 align-top">
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-1 rounded hover:bg-muted/50 text-muted-foreground" aria-label="Route actions">
              <MoreVertical className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button onClick={onAddTier}
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
              style={{ color: "hsl(var(--brand-navy))" }}>
              <Layers className="h-4 w-4" /> Add tier
            </button>
            <button onClick={onDeleteRoute}
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-destructive/10 text-destructive flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Delete route
            </button>
          </PopoverContent>
        </Popover>
      </td>
    </tr>
    {tiers.map((t) => (
      <tr key={t.id} className="hover:bg-muted/20 transition-colors" style={{ borderBottom: "1px dashed hsl(var(--brand-navy) / 0.05)" }}>
        <td className="px-3 py-2 align-top text-[11px] uppercase tracking-wider text-muted-foreground" style={{ paddingLeft: 56 }}>
          Tier
        </td>
        <td className="px-3 py-2 align-top">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[12px]">From</span>
            <div className="w-20"><EditableCell value={String(t.band_from)} onSave={(v) => onUpdateTier(t, "band_from", v)} /></div>
            <span className="text-muted-foreground text-[12px]">to</span>
            <div className="w-20"><EditableCell value={t.band_to == null ? "" : String(t.band_to)} onSave={(v) => onUpdateTier(t, "band_to", v)} placeholder="∞" /></div>
          </div>
        </td>
        <td className="px-3 py-2 align-top text-muted-foreground italic">—</td>
        <td className="px-3 py-2 align-top text-muted-foreground italic" style={DIVIDER_L}>—</td>
        <td className="px-3 py-2 align-top text-muted-foreground italic">—</td>
        <td className="px-3 py-2 align-top" style={DIVIDER_L}>
          <EditableCell value={String(t.rate)} onSave={(v) => onUpdateTier(t, "rate", v)} />
        </td>
        <td className="px-3 py-2 align-top" style={LAC_TINT} aria-hidden />
        <td className="px-3 py-2 align-top" style={LAC_TINT_R} aria-hidden />
        <td className="px-3 py-2 align-top">
          <EditableCell value={t.notes ?? ""} onSave={(v) => onUpdateTier(t, "notes", v)} />
        </td>
        <td className="px-2 py-2 align-top">
          <button onClick={() => onDeleteTier(t)}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete tier">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
    ))}
  </>
);
