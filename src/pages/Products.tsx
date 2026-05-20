/**
 * Products — Pipeline-style wide table.
 * One row per product. Multi-decoration summary in a single cell.
 * Detail editing happens on /products/:id (placeholder).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Search, MoreVertical, Trash2, Image as ImageIcon,
  Copy as CopyIcon, Pencil, X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMasterData } from "@/hooks/useMasterData";
import { supplierColor } from "@/lib/brand";
import { originLetterFromCode } from "@/lib/originLetter";
import {
  composePrimaryItemNumber, nextSequenceFor, parsePrimaryItemNumber,
} from "@/lib/productItemNumber";

interface Product {
  id: string;
  primary_item_number: string;
  name: string;
  subcategory_id: string;
  origin_id: string;
  supplier_id: string;
  supplier_item_number: string | null;
  supplier_description: string | null;
  image_url: string | null;
  carton_pack: number | null;
  carton_length: number | null;
  carton_width: number | null;
  carton_height: number | null;
  carton_weight: number | null;
  production_days_min: number;
  production_days_max: number | null;
  moq: number | null;
  updated_at: string;
}
interface Decoration { id: string; product_id: string; method_detail_id: string; sort_order: number }
interface Band { id: string; product_decoration_id: string; qty: number; unit_cost: number; setup_cost: number }
interface Cat { id: string; parent_id: string | null; code: string | null; name: string }
interface MDetail { id: string; decoration_method_id: string; detail: string }
interface DMethod { id: string; name: string }
interface DetailLabel { id: string; label: string; sort_order: number }
interface ProductDetail { id: string; product_id: string; detail_label_id: string; value: string; sort_order: number }

// ── Column widths (px). Total min ~1330. ─────────────────────────────────
const COLS = [
  { key: "image",    label: "",            w: 56,  align: "center" as const },
  { key: "supplier", label: "Supplier",    w: 120 },
  { key: "category", label: "Category",    w: 110 },
  { key: "subcat",   label: "Subcategory", w: 130 },
  { key: "name",     label: "Name",        w: 200 },
  { key: "supnum",   label: "Sup #",       w: 90 },
  { key: "desc",     label: "Description", w: 240 },
  { key: "pack",     label: "Pack",        w: 60,  align: "right" as const },
  { key: "carton",   label: "Carton",      w: 120 },
  { key: "wt",       label: "Wt",          w: 70,  align: "right" as const },
  { key: "lead",     label: "Lead",        w: 90 },
  { key: "deco",     label: "Decorations", w: 120 },
  { key: "price",    label: "Price from",  w: 100, align: "right" as const },
  { key: "updated",  label: "Updated",     w: 90 },
  { key: "kebab",    label: "",            w: 40,  align: "center" as const },
];
const TOTAL_WIDTH = COLS.reduce((s, c) => s + c.w, 0);
const GRID_COLS = COLS.map((c) => `${c.w}px`).join(" ");

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Draft { subcategoryId: string; supplierId: string; name: string; sequence: string }
const EMPTY_DRAFT: Draft = { subcategoryId: "", supplierId: "", name: "", sequence: "" };

export default function ProductsPage() {
  const navigate = useNavigate();
  const md = useMasterData();

  const [products, setProducts] = useState<Product[]>([]);
  const [decorations, setDecorations] = useState<Decoration[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [methodDetails, setMethodDetails] = useState<MDetail[]>([]);
  const [decoMethods, setDecoMethods] = useState<DMethod[]>([]);
  const [labels, setLabels] = useState<DetailLabel[]>([]);
  const [productDetails, setProductDetails] = useState<ProductDetail[]>([]);

  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelProduct, setConfirmDelProduct] = useState<Product | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [p, d, b, c, mdl, dm, dl, pd] = await Promise.all([
        supabase.from("products").select("*").order("updated_at", { ascending: false }),
        supabase.from("product_decorations").select("*").order("sort_order"),
        supabase.from("product_decoration_bands").select("*").order("qty"),
        supabase.from("product_categories").select("id,parent_id,code,name"),
        supabase.from("method_details").select("id,decoration_method_id,detail"),
        supabase.from("decoration_methods").select("id,name"),
        supabase.from("detail_labels").select("*").order("sort_order"),
        supabase.from("product_details").select("*").order("sort_order"),
      ]);
      if (!mounted) return;
      if (p.error) toast.error(`Load failed: ${p.error.message}`);
      setProducts((p.data ?? []) as any);
      setDecorations((d.data ?? []) as any);
      setBands((b.data ?? []) as any);
      setCats((c.data ?? []) as any);
      setMethodDetails((mdl.data ?? []) as any);
      setDecoMethods((dm.data ?? []) as any);
      setLabels((dl.data ?? []) as any);
      setProductDetails((pd.data ?? []) as any);
    };
    load();
    const ch = supabase.channel("products-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_decorations" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_decoration_bands" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_details" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  // ── Lookup maps ────────────────────────────────────────────────────────
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const mdById = useMemo(() => new Map(methodDetails.map((m) => [m.id, m])), [methodDetails]);
  const dmById = useMemo(() => new Map(decoMethods.map((m) => [m.id, m])), [decoMethods]);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const supplierById = useMemo(() => new Map(md.suppliers.map((s) => [s.id, s])), [md.suppliers]);

  const decosByProduct = useMemo(() => {
    const m = new Map<string, Decoration[]>();
    for (const d of [...decorations].sort((a, b) => a.sort_order - b.sort_order)) {
      const arr = m.get(d.product_id) ?? []; arr.push(d); m.set(d.product_id, arr);
    }
    return m;
  }, [decorations]);
  const bandsByDeco = useMemo(() => {
    const m = new Map<string, Band[]>();
    for (const b of bands) {
      const arr = m.get(b.product_decoration_id) ?? []; arr.push(b); m.set(b.product_decoration_id, arr);
    }
    return m;
  }, [bands]);
  const detailsByProduct = useMemo(() => {
    const m = new Map<string, ProductDetail[]>();
    for (const d of [...productDetails].sort((a, b) => a.sort_order - b.sort_order)) {
      const arr = m.get(d.product_id) ?? []; arr.push(d); m.set(d.product_id, arr);
    }
    return m;
  }, [productDetails]);

  const subcategoryGroups = useMemo(() => {
    const parents = cats.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name));
    return parents.map((p) => ({
      parent: p,
      subs: cats.filter((c) => c.parent_id === p.id).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [cats]);
  const supplierOptions = useMemo(
    () => [...md.suppliers].sort((a, b) => a.name.localeCompare(b.name)),
    [md.suppliers],
  );

  // ── Filter ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return products;
    return products.filter((p) => {
      const sup = supplierById.get(p.supplier_id);
      const sub = catById.get(p.subcategory_id);
      const parent = sub?.parent_id ? catById.get(sub.parent_id) : null;
      const hay = [
        p.name, p.supplier_item_number, p.primary_item_number, p.supplier_description,
        sup?.name, sub?.name, parent?.name,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(t);
    });
  }, [products, q, supplierById, catById]);

  // ── Draft (Add Product) ────────────────────────────────────────────────
  const existingItemNumbers = useMemo(() => products.map((p) => p.primary_item_number), [products]);
  const draftSupplier = draft ? supplierById.get(draft.supplierId) : null;
  const draftOrigin = draftSupplier?.origin_id ? md.origins.find((o) => o.id === draftSupplier.origin_id) : null;
  const draftOriginLetter = originLetterFromCode(draftOrigin?.code);
  const draftSubcategory = draft ? catById.get(draft.subcategoryId) : null;
  const draftSubCode = draftSubcategory?.code ?? null;

  useEffect(() => {
    if (!draft || draft.sequence) return;
    if (!draftSubCode || !draftOriginLetter) return;
    const matching = existingItemNumbers.filter((n) => {
      const pn = parsePrimaryItemNumber(n);
      return !!pn && pn.subcategoryCode === draftSubCode && pn.originLetter === draftOriginLetter;
    });
    const next = nextSequenceFor(draftSubCode, matching);
    setDraft((d) => (d ? { ...d, sequence: next } : d));
  }, [draft, draftSubCode, draftOriginLetter, existingItemNumbers]);

  const draftItemNumber = draft && draftSubCode && draftOriginLetter && draft.sequence
    ? composePrimaryItemNumber(draftSubCode, draft.sequence, draftOriginLetter) : null;

  const saveDraft = async () => {
    if (!draft || !draftItemNumber || !draftSupplier || !draft.name.trim()) {
      toast.error("Subcategory, supplier and name are required."); return;
    }
    if (!draftSupplier.origin_id) {
      toast.error("Supplier must have an origin assigned."); return;
    }
    if (products.some((p) => p.primary_item_number === draftItemNumber)) {
      toast.error(`Item number ${draftItemNumber} already in use.`); return;
    }
    const { error } = await supabase.from("products").insert({
      primary_item_number: draftItemNumber,
      name: draft.name.trim(),
      subcategory_id: draft.subcategoryId,
      origin_id: draftSupplier.origin_id,
      supplier_id: draftSupplier.id,
      production_days_min: 1,
    } as any);
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    toast.success(`Created ${draftItemNumber}`);
    setDraft(null);
  };

  const handleDeleteProduct = async () => {
    if (!confirmDelProduct) return;
    const { error } = await supabase.from("products").delete().eq("id", confirmDelProduct.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else toast.success("Product deleted");
    setConfirmDelProduct(null);
  };

  // ── Render helpers ─────────────────────────────────────────────────────
  const renderDescription = (productId: string): string => {
    const dts = detailsByProduct.get(productId) ?? [];
    if (dts.length === 0) return "—";
    return dts.slice(0, 2).map((d) => {
      const lab = labelById.get(d.detail_label_id)?.label ?? "";
      return d.value ? `${lab}: ${d.value}` : lab;
    }).join(" · ");
  };

  return (
    <DesktopAppShell>
      <div className="min-h-dvh flex flex-col" style={{ backgroundColor: "hsl(var(--background))" }}>
        <header
          className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}
        >
          <div className="px-4 sm:px-6 lg:px-8 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
            <button onClick={() => navigate("/")} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted/50">
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">MASTER DATA</div>
              <h1
                className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}
              >
                Products <span className="text-muted-foreground font-light">· {products.length}</span>
              </h1>
            </div>
            <button
              onClick={() => setDraft(EMPTY_DRAFT)}
              disabled={!!draft}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: "hsl(var(--brand-orange))", color: "white", minHeight: 40 }}
            >
              <Plus className="h-4 w-4" /> Add Product
            </button>
          </div>
          <div className="px-4 sm:px-6 lg:px-8 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products, supplier item #, subcategory…"
                className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
                style={{ minHeight: 40 }}
              />
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 min-w-0 flex flex-col px-4 sm:px-6 lg:px-8 pt-3 pb-6">
          <div
            className="border flex-1 min-h-0 overflow-auto rounded-t-xl"
            style={{
              borderColor: "hsl(var(--brand-navy) / 0.08)",
              backgroundColor: "#FFFFFF",
            }}
          >
            <div style={{ minWidth: TOTAL_WIDTH }}>
              {/* Header */}
              <div
                className="sticky top-0 z-20 grid items-center border-b"
                style={{
                  gridTemplateColumns: GRID_COLS,
                  backgroundColor: "#FFFFFF",
                  borderColor: "hsl(var(--brand-navy) / 0.08)",
                }}
              >
                {COLS.map((c, i) => (
                  <div
                    key={c.key}
                    className="h-10 px-3 inline-flex items-center text-[11px] font-semibold uppercase truncate"
                    style={{
                      color: "hsl(var(--brand-navy) / 0.55)",
                      letterSpacing: "0.06em",
                      justifyContent: c.align === "right" ? "flex-end" : c.align === "center" ? "center" : "flex-start",
                      boxShadow: i < COLS.length - 1 ? "inset -1px 0 0 0 rgba(27,42,78,0.08)" : undefined,
                    }}
                  >
                    {c.label}
                  </div>
                ))}
              </div>

              {/* Draft row */}
              {draft && (
                <DraftRow
                  draft={draft}
                  subcategoryGroups={subcategoryGroups}
                  supplierOptions={supplierOptions}
                  itemNumber={draftItemNumber}
                  onChange={setDraft}
                  onSave={saveDraft}
                  onCancel={() => setDraft(null)}
                />
              )}

              {/* Rows */}
              {filtered.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {q ? "No products match the search." : "No products yet. Click Add Product to start."}
                </div>
              ) : (
                filtered.map((p) => {
                  const sup = supplierById.get(p.supplier_id);
                  const sub = catById.get(p.subcategory_id);
                  const parent = sub?.parent_id ? catById.get(sub.parent_id) : null;
                  const decos = decosByProduct.get(p.id) ?? [];
                  const firstMethod = decos[0]
                    ? mdById.get(decos[0].method_detail_id)?.detail ?? "—"
                    : null;
                  const minPrice = (() => {
                    let m: number | null = null;
                    for (const d of decos) {
                      const bs = bandsByDeco.get(d.id) ?? [];
                      for (const b of bs) if (b.unit_cost > 0 && (m == null || b.unit_cost < m)) m = b.unit_cost;
                    }
                    return m;
                  })();
                  const dimsUnit = sup?.weight_unit === "lbs" ? "in" : "cm";
                  const wtUnit = sup?.weight_unit ?? "kg";
                  const hasDims = p.carton_length && p.carton_width && p.carton_height;
                  const lead =
                    p.production_days_max == null || p.production_days_max === p.production_days_min
                      ? `${p.production_days_min} days`
                      : `${p.production_days_min}\u2013${p.production_days_max} days`;
                  const decoSummary = decos.length === 0
                    ? "—"
                    : decos.length === 1
                      ? (firstMethod ?? "—")
                      : `${decos.length} methods · ${firstMethod}`;

                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/products/${p.id}`)}
                      onKeyDown={(e) => { if (e.key === "Enter") navigate(`/products/${p.id}`); }}
                      className="grid items-center cursor-pointer transition-colors hover:bg-muted/30 border-b"
                      style={{
                        gridTemplateColumns: GRID_COLS,
                        borderColor: "hsl(var(--brand-navy) / 0.06)",
                        minHeight: 48,
                      }}
                    >
                      <Cell align="center">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div
                            className="h-8 w-8 rounded flex items-center justify-center"
                            style={{ backgroundColor: "hsl(var(--brand-navy) / 0.06)" }}
                          >
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </Cell>
                      <Cell>
                        {sup ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium truncate max-w-full"
                            style={{
                              backgroundColor: "hsl(var(--brand-navy) / 0.06)",
                              color: "hsl(var(--brand-navy))",
                            }}
                          >
                            <span
                              className="h-2 w-2 rounded-sm shrink-0"
                              style={{ backgroundColor: supplierColor(sup.id) }}
                            />
                            <span className="truncate">{sup.name}</span>
                          </span>
                        ) : "—"}
                      </Cell>
                      <Cell>
                        {parent ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-[11px] font-medium truncate max-w-full"
                            style={{ backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
                          >
                            {parent.name}
                          </span>
                        ) : "—"}
                      </Cell>
                      <Cell>
                        {sub ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-[11px] font-medium truncate max-w-full"
                            style={{
                              backgroundColor: "hsl(var(--brand-orange) / 0.1)",
                              color: "hsl(var(--brand-navy))",
                            }}
                          >
                            {sub.name}
                          </span>
                        ) : "—"}
                      </Cell>
                      <Cell>
                        <span className="truncate text-[13px]" style={{ color: "hsl(var(--brand-navy))" }}>
                          {p.name || "—"}
                        </span>
                      </Cell>
                      <Cell>
                        <span
                          className="truncate text-[12px] tabular"
                          style={{ color: "#8B7B65", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                        >
                          {p.supplier_item_number || "—"}
                        </span>
                      </Cell>
                      <Cell>
                        <span className="truncate text-[13px] text-muted-foreground">
                          {renderDescription(p.id)}
                        </span>
                      </Cell>
                      <Cell align="right">
                        <span className="tabular text-[13px]">{p.carton_pack ?? "—"}</span>
                      </Cell>
                      <Cell>
                        <span className="truncate text-[13px] tabular">
                          {hasDims
                            ? `${p.carton_length}\u00D7${p.carton_width}\u00D7${p.carton_height} ${dimsUnit}`
                            : "—"}
                        </span>
                      </Cell>
                      <Cell align="right">
                        <span className="tabular text-[13px]">
                          {p.carton_weight != null ? `${p.carton_weight} ${wtUnit}` : "—"}
                        </span>
                      </Cell>
                      <Cell>
                        <span className="truncate text-[13px] tabular">{lead}</span>
                      </Cell>
                      <Cell>
                        <span className="truncate text-[13px]">{decoSummary}</span>
                      </Cell>
                      <Cell align="right">
                        <span className="tabular text-[13px]" style={{ color: minPrice != null ? "hsl(var(--brand-navy))" : undefined }}>
                          {minPrice != null ? `from ${fmtMoney(minPrice)}` : "—"}
                        </span>
                      </Cell>
                      <Cell>
                        <span className="truncate text-[12px] text-muted-foreground">
                          {p.updated_at ? formatDistanceToNow(new Date(p.updated_at), { addSuffix: true }) : "—"}
                        </span>
                      </Cell>
                      <Cell align="center">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
                              aria-label="Row actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => navigate(`/products/${p.id}`)}
                              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
                            >
                              <Pencil className="h-4 w-4" /> Edit details
                            </button>
                            <button
                              onClick={() => navigate(`/products/${p.id}`)}
                              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
                            >
                              <ImageIcon className="h-4 w-4" /> Add image
                            </button>
                            <button
                              onClick={() => toast.info("Duplicate coming soon")}
                              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
                            >
                              <CopyIcon className="h-4 w-4" /> Duplicate
                            </button>
                            <button
                              onClick={() => setConfirmDelProduct(p)}
                              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-destructive/10 text-destructive flex items-center gap-2"
                            >
                              <Trash2 className="h-4 w-4" /> Delete
                            </button>
                          </PopoverContent>
                        </Popover>
                      </Cell>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>

        <ConfirmDialog
          open={!!confirmDelProduct}
          onCancel={() => setConfirmDelProduct(null)}
          title={confirmDelProduct ? `Delete ${confirmDelProduct.name || confirmDelProduct.primary_item_number}?` : ""}
          description="This will remove the product and all its decorations and pricing bands."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteProduct}
        />
      </div>
    </DesktopAppShell>
  );
}

// ── Cell wrapper ─────────────────────────────────────────────────────────
function Cell({
  children, align,
}: { children: React.ReactNode; align?: "right" | "center" }) {
  return (
    <div
      className="px-3 min-w-0 flex items-center"
      style={{ justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }}
    >
      <div className="min-w-0 truncate w-full" style={{ textAlign: align === "right" ? "right" : undefined }}>
        {children}
      </div>
    </div>
  );
}

// ── Draft row (Add Product) ──────────────────────────────────────────────
interface DraftRowProps {
  draft: Draft;
  subcategoryGroups: { parent: Cat; subs: Cat[] }[];
  supplierOptions: { id: string; name: string }[];
  itemNumber: string | null;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}
function DraftRow({ draft, subcategoryGroups, supplierOptions, itemNumber, onChange, onSave, onCancel }: DraftRowProps) {
  return (
    <div
      className="grid items-center border-b"
      style={{
        gridTemplateColumns: GRID_COLS,
        borderColor: "hsl(var(--brand-navy) / 0.08)",
        backgroundColor: "hsl(var(--brand-orange) / 0.04)",
        minHeight: 56,
      }}
    >
      <Cell align="center">
        <div className="h-8 w-8 rounded flex items-center justify-center" style={{ backgroundColor: "hsl(var(--brand-navy) / 0.06)" }}>
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </Cell>
      <Cell>
        <Select value={draft.supplierId} onValueChange={(v) => onChange({ ...draft, supplierId: v, sequence: "" })}>
          <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Supplier…" /></SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {supplierOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Cell>
      <Cell>
        <span className="text-[11px] text-muted-foreground">—</span>
      </Cell>
      <Cell>
        <Select value={draft.subcategoryId} onValueChange={(v) => onChange({ ...draft, subcategoryId: v, sequence: "" })}>
          <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Subcategory…" /></SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {subcategoryGroups.map((g) => (
              <SelectGroup key={g.parent.id}>
                <SelectLabel>{g.parent.name}</SelectLabel>
                {g.subs.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Cell>
      <Cell>
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
          placeholder="Product name…"
          className="w-full h-8 px-2 rounded border border-input bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
        />
      </Cell>
      <Cell>
        <span className="text-[12px] tabular text-muted-foreground">{itemNumber ?? "—"}</span>
      </Cell>
      <Cell><span className="text-[11px] text-muted-foreground italic">Set on detail page</span></Cell>
      <Cell align="right"><span className="text-muted-foreground">—</span></Cell>
      <Cell><span className="text-muted-foreground">—</span></Cell>
      <Cell align="right"><span className="text-muted-foreground">—</span></Cell>
      <Cell><span className="text-muted-foreground">—</span></Cell>
      <Cell><span className="text-muted-foreground">—</span></Cell>
      <Cell align="right"><span className="text-muted-foreground">—</span></Cell>
      <Cell><span className="text-muted-foreground">—</span></Cell>
      <Cell align="center">
        <div className="flex items-center gap-1">
          <button
            onClick={onSave}
            disabled={!itemNumber || !draft.name.trim() || !draft.supplierId}
            className="px-2 h-7 rounded text-[11px] font-semibold disabled:opacity-40"
            style={{ background: "hsl(var(--brand-orange))", color: "white" }}
            title="Save"
          >
            Save
          </button>
          <button onClick={onCancel} className="p-1 rounded hover:bg-muted/60 text-muted-foreground" title="Cancel">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </Cell>
    </div>
  );
}
