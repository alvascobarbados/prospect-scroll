/**
 * Products — master catalog with three-tier hierarchy:
 *   Product → Decoration → Band
 *
 * Default view: expanded merged-cell layout. Product identity/specs span
 * all rows under that product (rowSpan = total band count, min 1).
 * Decoration cells span their bands (rowSpan = band count, min 1).
 * Band cells are individual rows.
 *
 * Per-product collapse to a compact summary row (chevron at left). Global
 * Expand-all / Collapse-all buttons. Collapsed state persists in
 * sessionStorage for the session.
 *
 * Inline editing on every product cell. Subcategory / Supplier changes
 * trigger a renumber-confirmation dialog because chars 1-3 / char 7 of
 * the primary_item_number recompute. Sequence (chars 4-6) is editable
 * directly with uniqueness validation. Origin is never displayed —
 * derived from supplier.origin_id at save time.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Search, MoreVertical, Trash2, ChevronDown, ChevronRight,
  Layers, ListPlus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditableCell } from "@/components/leads/SimpleMasterPage";
import { AddProductSheet } from "@/components/leads/AddProductSheet";
import { supabase } from "@/integrations/supabase/client";
import { useMasterData } from "@/hooks/useMasterData";
import { originLetterFromCode } from "@/lib/originLetter";
import {
  composePrimaryItemNumber, parsePrimaryItemNumber, sanitizeSequenceInput,
} from "@/lib/productItemNumber";

// ── Types ─────────────────────────────────────────────────────────────
interface Product {
  id: string;
  primary_item_number: string;
  name: string;
  subcategory_id: string;
  origin_id: string;
  supplier_id: string;
  supplier_item_name: string | null;
  supplier_item_number: string | null;
  supplier_description: string | null;
  carton_pack: number | null;
  carton_length: number | null;
  carton_width: number | null;
  carton_height: number | null;
  carton_weight: number | null;
  production_days: number | null;
  moq: number | null;
  notes: string | null;
}
interface Decoration {
  id: string; product_id: string; method_detail_id: string; sort_order: number; notes: string | null;
}
interface Band {
  id: string; product_decoration_id: string; qty: number; unit_cost: number; setup_cost: number;
}
interface Cat { id: string; parent_id: string | null; code: string | null; name: string }
interface MethodDetail { id: string; decoration_method_id: string; code: string; detail: string }
interface DecorationMethodRow { id: string; code: string; name: string }

const SS_KEY = "alvasco.products.collapsed";
const numOrNull = (raw: string): number | null => {
  const t = raw.trim(); if (!t) return null;
  const n = Number(t); return Number.isFinite(n) ? n : null;
};
const intOrNull = (raw: string): number | null => {
  const t = raw.trim(); if (!t) return null;
  const n = parseInt(t, 10); return Number.isFinite(n) ? n : null;
};
const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dash = (v: any) => (v == null || v === "" ? "—" : v);

export default function ProductsPage() {
  const navigate = useNavigate();
  const md = useMasterData();

  const [products, setProducts] = useState<Product[]>([]);
  const [decorations, setDecorations] = useState<Decoration[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [methodDetails, setMethodDetails] = useState<MethodDetail[]>([]);
  const [decoMethods, setDecoMethods] = useState<DecorationMethodRow[]>([]);

  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<Product | null>(null);
  const [confirmDeleteDecoration, setConfirmDeleteDecoration] = useState<Decoration | null>(null);
  const [confirmDeleteBand, setConfirmDeleteBand] = useState<Band | null>(null);
  const [renumber, setRenumber] = useState<null | {
    product: Product; oldNum: string; newNum: string;
    patch: Partial<Product> & { primary_item_number: string };
  }>(null);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify([...collapsed])); } catch { /* noop */ }
  }, [collapsed]);

  // Initial load + realtime
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [p, d, b, c, mdl, dm] = await Promise.all([
        supabase.from("products").select("*").order("primary_item_number"),
        supabase.from("product_decorations").select("*").order("sort_order"),
        supabase.from("product_decoration_bands").select("*").order("qty"),
        supabase.from("product_categories").select("id,parent_id,code,name"),
        supabase.from("method_details").select("id,decoration_method_id,code,detail"),
        supabase.from("decoration_methods").select("id,code,name"),
      ]);
      if (!mounted) return;
      if (p.error) toast.error(`Load failed: ${p.error.message}`);
      setProducts((p.data ?? []) as Product[]);
      setDecorations((d.data ?? []) as Decoration[]);
      setBands((b.data ?? []) as Band[]);
      setCats((c.data ?? []) as Cat[]);
      setMethodDetails((mdl.data ?? []) as MethodDetail[]);
      setDecoMethods((dm.data ?? []) as DecorationMethodRow[]);
    };
    load();
    const ch = supabase.channel("products-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_decorations" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_decoration_bands" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  // ── Lookup maps ─────────────────────────────────────────────────────
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const methodDetailById = useMemo(() => new Map(methodDetails.map((m) => [m.id, m])), [methodDetails]);
  const decoMethodById = useMemo(() => new Map(decoMethods.map((m) => [m.id, m])), [decoMethods]);
  const decorationsByProduct = useMemo(() => {
    const m = new Map<string, Decoration[]>();
    for (const d of [...decorations].sort((a, b) => a.sort_order - b.sort_order)) {
      const arr = m.get(d.product_id) ?? []; arr.push(d); m.set(d.product_id, arr);
    }
    return m;
  }, [decorations]);
  const bandsByDecoration = useMemo(() => {
    const m = new Map<string, Band[]>();
    for (const b of [...bands].sort((a, b) => a.qty - b.qty)) {
      const arr = m.get(b.product_decoration_id) ?? []; arr.push(b); m.set(b.product_decoration_id, arr);
    }
    return m;
  }, [bands]);

  const subcategoryDisplay = (id: string | null | undefined) => {
    if (!id) return "—";
    const c = catById.get(id); if (!c) return "—";
    return c.code ? `[${c.code}] ${c.name}` : c.name;
  };
  const supplierDisplay = (id: string | null | undefined) => {
    if (!id) return "—";
    const s = md.suppliers.find((x) => x.id === id); if (!s) return "—";
    return s.code ? `[${s.code}] ${s.name}` : s.name;
  };
  const supplierUnits = (id: string | null | undefined) => {
    const s = id ? md.suppliers.find((x) => x.id === id) : null;
    const w = s?.weight_unit ?? "kg";
    return { weight: w, dim: w === "lbs" ? "in" : "cm" } as const;
  };
  const methodDetailDisplay = (id: string | null | undefined) => {
    if (!id) return "—";
    const m = methodDetailById.get(id); if (!m) return "—";
    const parent = decoMethodById.get(m.decoration_method_id);
    const left = parent ? `${parent.name}` : "";
    return `${left ? left + " ▸ " : ""}[${m.code}] ${m.detail}`;
  };

  // ── Filter ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return products;
    return products.filter((p) => {
      const sup = md.suppliers.find((s) => s.id === p.supplier_id);
      const sub = catById.get(p.subcategory_id);
      const hay = [
        p.primary_item_number, p.name, p.supplier_item_number, p.supplier_item_name,
        sup?.name, sup?.code, sub?.name, sub?.code,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(t);
    });
  }, [products, q, md.suppliers, catById]);

  // ── Inline product update ───────────────────────────────────────────
  const updateProduct = async (id: string, patch: Partial<Product>): Promise<boolean> => {
    setProducts((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("products").update(patch as any).eq("id", id);
    if (error) { toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  // Compute new primary_item_number when subcategory or supplier changes;
  // confirm + uniqueness check before applying.
  const requestRenumber = async (
    product: Product,
    next: { subcategoryId?: string; supplierId?: string },
  ): Promise<void> => {
    const newSubId = next.subcategoryId ?? product.subcategory_id;
    const newSupId = next.supplierId ?? product.supplier_id;
    const newSub = catById.get(newSubId);
    const newSup = md.suppliers.find((s) => s.id === newSupId);
    if (!newSub?.code) { toast.error("Subcategory has no code."); return; }
    if (!newSup) { toast.error("Supplier not found."); return; }
    const newOriginCode = newSup.origin_id ? md.origins.find((o) => o.id === newSup.origin_id)?.code : null;
    const letter = originLetterFromCode(newOriginCode);
    if (!letter) { toast.error("Supplier must have an origin assigned. Set it on the Suppliers page."); return; }

    const parsed = parsePrimaryItemNumber(product.primary_item_number);
    const seq = parsed?.sequence ?? "001";
    const newNum = composePrimaryItemNumber(newSub.code, seq, letter);
    if (newNum === product.primary_item_number) {
      // No renumber — apply patch silently.
      await updateProduct(product.id, {
        subcategory_id: newSubId, supplier_id: newSupId,
        origin_id: newSup.origin_id!,
      });
      return;
    }
    const dup = products.find((p) => p.id !== product.id && p.primary_item_number === newNum);
    if (dup) { toast.error(`Item number ${newNum} already in use by ${dup.name}.`); return; }
    setRenumber({
      product, oldNum: product.primary_item_number, newNum,
      patch: {
        subcategory_id: newSubId, supplier_id: newSupId,
        origin_id: newSup.origin_id!, primary_item_number: newNum,
      },
    });
  };
  const applyRenumber = async () => {
    if (!renumber) return;
    const ok = await updateProduct(renumber.product.id, renumber.patch);
    if (ok) toast.success(`Renumbered to ${renumber.newNum}`);
    setRenumber(null);
  };

  // ── Decoration / Band CRUD ──────────────────────────────────────────
  const addDecoration = async (productId: string) => {
    // Default to first available method_detail; user changes inline.
    const first = methodDetails[0];
    if (!first) { toast.error("Add a Decoration Method first."); return; }
    const existing = decorations.filter((d) => d.product_id === productId);
    // pick a method_detail not already used on this product
    const used = new Set(existing.map((d) => d.method_detail_id));
    const pick = methodDetails.find((m) => !used.has(m.id)) ?? first;
    if (used.has(pick.id)) {
      toast.error("All decoration methods already assigned to this product.");
      return;
    }
    const { error } = await supabase.from("product_decorations").insert({
      product_id: productId, method_detail_id: pick.id, sort_order: existing.length,
    });
    if (error) toast.error(`Add failed: ${error.message}`);
  };
  const updateDecoration = async (id: string, patch: Partial<Decoration>) => {
    const { error } = await supabase.from("product_decorations").update(patch as any).eq("id", id);
    if (error) toast.error(`Save failed: ${error.message}`);
  };
  const deleteDecoration = async (id: string) => {
    const { error } = await supabase.from("product_decorations").delete().eq("id", id);
    if (error) toast.error(`Delete failed: ${error.message}`);
  };
  const addBand = async (decorationId: string) => {
    const existing = bands.filter((b) => b.product_decoration_id === decorationId);
    const nextQty = existing.length === 0 ? 1 : Math.max(...existing.map((b) => b.qty)) + 1;
    const { error } = await supabase.from("product_decoration_bands").insert({
      product_decoration_id: decorationId, qty: nextQty, unit_cost: 0, setup_cost: 0,
    });
    if (error) toast.error(`Add failed: ${error.message}`);
  };
  const updateBand = async (id: string, patch: Partial<Band>) => {
    const { error } = await supabase.from("product_decoration_bands").update(patch as any).eq("id", id);
    if (error) toast.error(`Save failed: ${error.message}`);
  };
  const deleteBand = async (id: string) => {
    const { error } = await supabase.from("product_decoration_bands").delete().eq("id", id);
    if (error) toast.error(`Delete failed: ${error.message}`);
  };

  const allCollapsed = filtered.length > 0 && filtered.every((p) => collapsed.has(p.id));
  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(filtered.map((p) => p.id)));
  };
  const toggleProduct = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        <header className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}>
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
            <button onClick={() => navigate("/")} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted/50">
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Master data</div>
              <h1 className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}>
                Products <span className="text-muted-foreground font-light">· {products.length}</span>
              </h1>
            </div>
            <button onClick={toggleAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border border-border hover:bg-muted/40"
              style={{ minHeight: 40, color: "hsl(var(--brand-navy))" }}>
              <Layers className="h-4 w-4" /> {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
            <button onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{ background: "hsl(var(--brand-orange))", color: "white", minHeight: 40 }}>
              <Plus className="h-4 w-4" /> Add Product
            </button>
          </div>
        </header>

        <main className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-16">
          <div className="relative my-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search products, item #, supplier, subcategory…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }} />
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse min-w-[1800px]">
              <thead>
                <tr className="sticky top-0 z-10"
                  style={{ background: "hsl(var(--brand-navy) / 0.04)", borderBottom: "1px solid hsl(var(--brand-navy) / 0.12)" }}>
                  <Th className="w-8" />
                  <Th>Item #</Th>
                  <Th>Name</Th>
                  <Th>Subcategory</Th>
                  <Th>Supplier</Th>
                  <Th>Supplier Item Name</Th>
                  <Th>Supplier Item #</Th>
                  <Th align="right">Pack</Th>
                  <Th align="right">L</Th>
                  <Th align="right">W</Th>
                  <Th align="right">H</Th>
                  <Th align="right">Wt</Th>
                  <Th align="right">Prod</Th>
                  <Th align="right">MOQ</Th>
                  <Th>Decoration</Th>
                  <Th>Deco Notes</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Unit Cost</Th>
                  <Th align="right">Setup Cost</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <ProductBlock
                    key={p.id}
                    product={p}
                    collapsed={collapsed.has(p.id)}
                    onToggle={() => toggleProduct(p.id)}
                    decorations={decorationsByProduct.get(p.id) ?? []}
                    bandsByDecoration={bandsByDecoration}
                    products={products}
                    cats={cats}
                    methodDetails={methodDetails}
                    subcategoryDisplay={subcategoryDisplay}
                    supplierDisplay={supplierDisplay}
                    supplierUnits={supplierUnits}
                    methodDetailDisplay={methodDetailDisplay}
                    onUpdateProduct={updateProduct}
                    onRequestRenumber={requestRenumber}
                    onAddDecoration={() => addDecoration(p.id)}
                    onUpdateDecoration={updateDecoration}
                    onDeleteDecoration={(d) => setConfirmDeleteDecoration(d)}
                    onAddBand={(decId) => addBand(decId)}
                    onUpdateBand={updateBand}
                    onDeleteBand={(b) => setConfirmDeleteBand(b)}
                    onDeleteProduct={() => setConfirmDeleteProduct(p)}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={20} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
                    {q ? "No matches." : "No products yet — click + Add Product."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        <AddProductSheet open={adding} onClose={() => setAdding(false)} />

        <ConfirmDialog
          open={!!confirmDeleteProduct}
          onCancel={() => setConfirmDeleteProduct(null)}
          title={confirmDeleteProduct ? `Delete ${confirmDeleteProduct.primary_item_number}?` : ""}
          description="All decorations and pricing bands on this product will be deleted. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            if (!confirmDeleteProduct) return;
            const { error } = await supabase.from("products").delete().eq("id", confirmDeleteProduct.id);
            if (error) toast.error(`Delete failed: ${error.message}`);
            else toast.success(`Deleted ${confirmDeleteProduct.primary_item_number}`);
            setConfirmDeleteProduct(null);
          }}
        />

        <ConfirmDialog
          open={!!confirmDeleteDecoration}
          onCancel={() => setConfirmDeleteDecoration(null)}
          title="Delete decoration?"
          description="All pricing bands on this decoration will be deleted."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            if (!confirmDeleteDecoration) return;
            await deleteDecoration(confirmDeleteDecoration.id);
            setConfirmDeleteDecoration(null);
          }}
        />

        <ConfirmDialog
          open={!!confirmDeleteBand}
          onCancel={() => setConfirmDeleteBand(null)}
          title="Delete pricing band?"
          description="This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            if (!confirmDeleteBand) return;
            await deleteBand(confirmDeleteBand.id);
            setConfirmDeleteBand(null);
          }}
        />

        <ConfirmDialog
          open={!!renumber}
          onCancel={() => setRenumber(null)}
          title={renumber ? `Renumber from ${renumber.oldNum} to ${renumber.newNum}?` : ""}
          description="Changing the subcategory or supplier renumbers the product."
          confirmLabel="Renumber"
          onConfirm={applyRenumber}
        />
      </div>
    </DesktopAppShell>
  );
}

// ── Header cell ───────────────────────────────────────────────────────
const Th = ({ children, className, align }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) => (
  <th
    className={cn("text-[10px] uppercase tracking-[0.16em] font-semibold px-2 py-2.5 whitespace-nowrap",
      align === "right" ? "text-right" : "text-left", className)}
    style={{ color: "hsl(var(--brand-navy) / 0.65)" }}
  >{children}</th>
);

const cellBorder: React.CSSProperties = { borderBottom: "1px solid hsl(var(--brand-navy) / 0.07)", borderRight: "1px solid hsl(var(--brand-navy) / 0.04)" };
const productBorder: React.CSSProperties = { borderTop: "2px solid hsl(var(--brand-navy) / 0.14)" };

// ── ProductBlock — renders all rows for a single product ──────────────
interface BlockProps {
  product: Product;
  collapsed: boolean;
  onToggle: () => void;
  decorations: Decoration[];
  bandsByDecoration: Map<string, Band[]>;
  products: Product[];
  cats: Cat[];
  methodDetails: MethodDetail[];
  subcategoryDisplay: (id: string | null | undefined) => string;
  supplierDisplay: (id: string | null | undefined) => string;
  supplierUnits: (id: string | null | undefined) => { weight: string; dim: string };
  methodDetailDisplay: (id: string | null | undefined) => string;
  onUpdateProduct: (id: string, patch: Partial<Product>) => Promise<boolean>;
  onRequestRenumber: (p: Product, n: { subcategoryId?: string; supplierId?: string }) => Promise<void>;
  onAddDecoration: () => void;
  onUpdateDecoration: (id: string, patch: Partial<Decoration>) => Promise<void>;
  onDeleteDecoration: (d: Decoration) => void;
  onAddBand: (decorationId: string) => void;
  onUpdateBand: (id: string, patch: Partial<Band>) => Promise<void>;
  onDeleteBand: (b: Band) => void;
  onDeleteProduct: () => void;
}

const ProductBlock = (props: BlockProps) => {
  const { product, collapsed, onToggle, decorations, bandsByDecoration } = props;
  const units = props.supplierUnits(product.supplier_id);
  const decorationsForRender = decorations.length === 0 ? [null] : decorations;
  const bandCounts = decorationsForRender.map((d) =>
    d ? Math.max(1, (bandsByDecoration.get(d.id) ?? []).length) : 1,
  );
  const totalRows = bandCounts.reduce((a, b) => a + b, 0);

  if (collapsed) {
    const decoCount = decorations.length;
    const allBands = decorations.flatMap((d) => bandsByDecoration.get(d.id) ?? []);
    const lowest = allBands.length ? Math.min(...allBands.map((b) => b.unit_cost)) : null;
    return (
      <tr className="hover:bg-muted/20" style={productBorder}>
        <td className="px-2 py-2 align-middle" style={cellBorder}>
          <button onClick={onToggle} className="p-0.5 rounded hover:bg-muted/40" aria-label="Expand">
            <ChevronRight className="h-4 w-4" style={{ color: "hsl(var(--brand-navy))" }} />
          </button>
        </td>
        <td className="px-2 py-2 align-middle font-mono font-semibold" style={{ ...cellBorder, color: "hsl(var(--brand-navy))" }}>
          {product.primary_item_number}
        </td>
        <td className="px-2 py-2 align-middle font-medium" style={{ ...cellBorder, color: "hsl(var(--brand-navy))" }} colSpan={2}>
          {product.name}
        </td>
        <td className="px-2 py-2 align-middle text-muted-foreground" style={cellBorder} colSpan={3}>
          {props.supplierDisplay(product.supplier_id)} · {props.subcategoryDisplay(product.subcategory_id)}
        </td>
        <td className="px-2 py-2 align-middle text-right" style={cellBorder} colSpan={6}>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={{ background: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}>
            {decoCount} decoration{decoCount === 1 ? "" : "s"}
          </span>
        </td>
        <td className="px-2 py-2 align-middle text-right tabular-nums" style={cellBorder} colSpan={2}>
          {lowest != null ? `from ${fmtMoney(lowest)}` : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-2 py-2 align-middle text-right tabular-nums" style={cellBorder} colSpan={3}>
          MOQ {dash(product.moq)}
        </td>
        <td className="px-2 py-2 align-middle" style={cellBorder} colSpan={2}>
          <RowMenu onDelete={props.onDeleteProduct} extra={<>
            <button onClick={onToggle} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
              style={{ color: "hsl(var(--brand-navy))" }}>
              <ChevronDown className="h-4 w-4" /> Expand
            </button>
          </>} />
        </td>
      </tr>
    );
  }

  // Expanded — emit totalRows TR's
  const rows: JSX.Element[] = [];
  let rowIdx = 0;
  decorationsForRender.forEach((d, dIdx) => {
    const bandList = d ? (bandsByDecoration.get(d.id) ?? []) : [];
    const bandRowsForRender: (Band | null)[] = bandList.length === 0 ? [null] : bandList;
    bandRowsForRender.forEach((b, bIdx) => {
      const isFirstRowOfProduct = rowIdx === 0;
      const isFirstRowOfDecoration = bIdx === 0;
      rows.push(
        <tr key={`${product.id}-${dIdx}-${bIdx}`}
          className="hover:bg-muted/10"
          style={isFirstRowOfProduct ? productBorder : undefined}>
          {isFirstRowOfProduct && (
            <>
              <td rowSpan={totalRows} className="px-2 py-1.5 align-top" style={cellBorder}>
                <button onClick={onToggle} className="p-0.5 rounded hover:bg-muted/40" aria-label="Collapse">
                  <ChevronDown className="h-4 w-4" style={{ color: "hsl(var(--brand-navy))" }} />
                </button>
              </td>
              <td rowSpan={totalRows} className="align-top" style={cellBorder}>
                <ItemNumberCell product={product} products={props.products}
                  onUpdate={(seq) => {
                    const parsed = parsePrimaryItemNumber(product.primary_item_number);
                    if (!parsed) return Promise.resolve(false);
                    const newNum = composePrimaryItemNumber(parsed.subcategoryCode, seq, parsed.originLetter);
                    if (newNum === product.primary_item_number) return Promise.resolve(true);
                    const dup = props.products.find((p) => p.id !== product.id && p.primary_item_number === newNum);
                    if (dup) { toast.error(`Item number ${newNum} already in use by ${dup.name}.`); return Promise.resolve(false); }
                    return props.onUpdateProduct(product.id, { primary_item_number: newNum });
                  }}
                />
              </td>
              <td rowSpan={totalRows} className="align-top font-medium" style={{ ...cellBorder, color: "hsl(var(--brand-navy))" }}>
                <EditableCell value={product.name}
                  onSave={async (v) => v.trim() ? props.onUpdateProduct(product.id, { name: v.trim() }) : false} />
              </td>
              <td rowSpan={totalRows} className="align-top" style={cellBorder}>
                <SubcategorySelectCell value={product.subcategory_id} cats={props.cats}
                  display={props.subcategoryDisplay(product.subcategory_id)}
                  onChange={(id) => props.onRequestRenumber(product, { subcategoryId: id })} />
              </td>
              <td rowSpan={totalRows} className="align-top" style={cellBorder}>
                <SupplierSelectCell value={product.supplier_id}
                  display={props.supplierDisplay(product.supplier_id)}
                  onChange={(id) => props.onRequestRenumber(product, { supplierId: id })} />
              </td>
              <td rowSpan={totalRows} className="align-top" style={cellBorder}>
                <EditableCell value={product.supplier_item_name ?? ""}
                  onSave={async (v) => props.onUpdateProduct(product.id, { supplier_item_name: v.trim() || null })} />
              </td>
              <td rowSpan={totalRows} className="align-top" style={cellBorder}>
                <EditableCell value={product.supplier_item_number ?? ""}
                  onSave={async (v) => props.onUpdateProduct(product.id, { supplier_item_number: v.trim() || null })} />
              </td>
              <td rowSpan={totalRows} className="align-top text-right" style={cellBorder}>
                <NumericCell value={product.carton_pack} suffix="" min={1} integer
                  onSave={(n) => props.onUpdateProduct(product.id, { carton_pack: n })} />
              </td>
              <td rowSpan={totalRows} className="align-top text-right" style={cellBorder}>
                <NumericCell value={product.carton_length} suffix={` ${units.dim}`} min={0.01}
                  onSave={(n) => props.onUpdateProduct(product.id, { carton_length: n })} />
              </td>
              <td rowSpan={totalRows} className="align-top text-right" style={cellBorder}>
                <NumericCell value={product.carton_width} suffix={` ${units.dim}`} min={0.01}
                  onSave={(n) => props.onUpdateProduct(product.id, { carton_width: n })} />
              </td>
              <td rowSpan={totalRows} className="align-top text-right" style={cellBorder}>
                <NumericCell value={product.carton_height} suffix={` ${units.dim}`} min={0.01}
                  onSave={(n) => props.onUpdateProduct(product.id, { carton_height: n })} />
              </td>
              <td rowSpan={totalRows} className="align-top text-right" style={cellBorder}>
                <NumericCell value={product.carton_weight} suffix={` ${units.weight}`} min={0.01}
                  onSave={(n) => props.onUpdateProduct(product.id, { carton_weight: n })} />
              </td>
              <td rowSpan={totalRows} className="align-top text-right" style={cellBorder}>
                <NumericCell value={product.production_days} suffix=" days" min={1} integer
                  onSave={(n) => props.onUpdateProduct(product.id, { production_days: n })} />
              </td>
              <td rowSpan={totalRows} className="align-top text-right" style={cellBorder}>
                <NumericCell value={product.moq} suffix="" min={1} integer
                  onSave={(n) => props.onUpdateProduct(product.id, { moq: n })} />
              </td>
            </>
          )}
          {isFirstRowOfDecoration && (
            <>
              <td rowSpan={bandCounts[dIdx]} className="align-top" style={cellBorder}>
                {d ? (
                  <DecorationCell decoration={d} methodDetails={props.methodDetails}
                    display={props.methodDetailDisplay(d.method_detail_id)}
                    onChange={(mid) => props.onUpdateDecoration(d.id, { method_detail_id: mid })} />
                ) : (
                  <button onClick={props.onAddDecoration}
                    className="w-full text-left px-2 py-1 text-[12px] italic text-muted-foreground hover:bg-muted/40 rounded inline-flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Add decoration
                  </button>
                )}
              </td>
              <td rowSpan={bandCounts[dIdx]} className="align-top" style={cellBorder}>
                {d && (
                  <EditableCell value={d.notes ?? ""} placeholder="—"
                    onSave={async (v) => { await props.onUpdateDecoration(d.id, { notes: v.trim() || null }); return true; }} />
                )}
              </td>
            </>
          )}
          {b ? (
            <>
              <td className="align-top text-right" style={cellBorder}>
                <NumericCell value={b.qty} suffix="" min={1} integer
                  onSave={(n) => n != null ? props.onUpdateBand(b.id, { qty: n }).then(() => true) : Promise.resolve(false)} />
              </td>
              <td className="align-top text-right" style={cellBorder}>
                <NumericCell value={b.unit_cost} suffix="" prefix="$" min={0}
                  onSave={(n) => n != null ? props.onUpdateBand(b.id, { unit_cost: n }).then(() => true) : Promise.resolve(false)} />
              </td>
              <td className="align-top text-right" style={cellBorder}>
                <NumericCell value={b.setup_cost} suffix="" prefix="$" min={0}
                  onSave={(n) => n != null ? props.onUpdateBand(b.id, { setup_cost: n }).then(() => true) : Promise.resolve(false)} />
              </td>
            </>
          ) : (
            <td colSpan={3} className="align-top px-2 py-1" style={cellBorder}>
              {d && (
                <button onClick={() => props.onAddBand(d.id)}
                  className="text-[12px] italic text-muted-foreground hover:text-[hsl(var(--brand-orange))] inline-flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add band
                </button>
              )}
            </td>
          )}
          {/* Actions cell */}
          {isFirstRowOfProduct ? (
            <td rowSpan={totalRows} className="align-top px-1 py-1" style={cellBorder}>
              <RowMenu
                onDelete={props.onDeleteProduct}
                extra={<>
                  <button onClick={props.onAddDecoration}
                    className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
                    style={{ color: "hsl(var(--brand-navy))" }}>
                    <ListPlus className="h-4 w-4" /> Add decoration
                  </button>
                </>}
              />
            </td>
          ) : (b && bIdx === bandRowsForRender.length - 1 && d) ? (
            // last band row of a decoration — band/decoration menus inline via small popover
            <td className="align-top px-1 py-1" style={cellBorder}>
              <SmallMenu
                items={[
                  { label: "Add band", icon: <Plus className="h-4 w-4" />, onClick: () => props.onAddBand(d.id) },
                  { label: "Delete decoration", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => props.onDeleteDecoration(d) },
                ]}
              />
            </td>
          ) : (
            <td className="align-top px-1 py-1" style={cellBorder}>
              {b && (
                <SmallMenu items={[
                  { label: "Delete band", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => props.onDeleteBand(b) },
                ]} />
              )}
            </td>
          )}
        </tr>,
      );
      rowIdx++;
    });
  });
  return <>{rows}</>;
};

// ── Item-number cell — sequence (chars 4-6) editable, others read-only ─
const ItemNumberCell = ({
  product, onUpdate,
}: { product: Product; products: Product[]; onUpdate: (seq: string) => Promise<boolean> }) => {
  const parsed = parsePrimaryItemNumber(product.primary_item_number);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(parsed?.sequence ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setDraft(parsed?.sequence ?? ""); setTimeout(() => ref.current?.select(), 0); } }, [editing, parsed?.sequence]);
  if (!parsed) return <span className="px-2 py-1.5 font-mono">{product.primary_item_number}</span>;

  if (editing) {
    return (
      <div className="px-1.5 py-1 inline-flex items-center font-mono tracking-wider text-[13px]" style={{ color: "hsl(var(--brand-navy))" }}>
        <span className="text-muted-foreground">{parsed.subcategoryCode}</span>
        <input ref={ref} value={draft}
          onChange={(e) => setDraft(sanitizeSequenceInput(e.target.value))}
          onBlur={async () => {
            const seq = (draft || "").padStart(3, "0");
            if (seq === parsed.sequence) { setEditing(false); return; }
            const ok = await onUpdate(seq);
            if (ok) setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setDraft(parsed.sequence); setEditing(false); }
          }}
          className="w-[44px] mx-0.5 px-1 py-0 border border-[hsl(var(--brand-navy)/0.4)] rounded bg-background focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)] font-mono text-[13px] text-center"
          maxLength={3} inputMode="numeric"
        />
        <span className="text-muted-foreground">{parsed.originLetter}</span>
      </div>
    );
  }
  return (
    <button onClick={() => setEditing(true)}
      className="px-1.5 py-1 font-mono tracking-wider text-[13px] hover:bg-muted/40 rounded font-semibold"
      style={{ color: "hsl(var(--brand-navy))" }}
      title="Click to edit sequence (chars 4-6)">
      {product.primary_item_number}
    </button>
  );
};

// ── Subcategory select ──────────────────────────────────────────────
const SubcategorySelectCell = ({
  value, cats, display, onChange,
}: { value: string; cats: Cat[]; display: string; onChange: (id: string) => void }) => {
  const parents = cats.filter((c) => !c.parent_id);
  const subsByParent = new Map<string, Cat[]>();
  for (const c of cats) if (c.parent_id) {
    const arr = subsByParent.get(c.parent_id) ?? []; arr.push(c); subsByParent.set(c.parent_id, arr);
  }
  return (
    <select value={value} onChange={(e) => { if (e.target.value !== value) onChange(e.target.value); }}
      className="w-full px-1.5 py-1 rounded text-[12.5px] bg-transparent hover:bg-muted/40 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
      style={{ color: "hsl(var(--brand-navy))" }} title={display}>
      {parents.map((p) => (
        <optgroup key={p.id} label={`${p.code ?? "??"} ${p.name}`}>
          {(subsByParent.get(p.id) ?? []).map((s) => (
            <option key={s.id} value={s.id}>[{s.code ?? "???"}] {s.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

// ── Supplier select ─────────────────────────────────────────────────
const SupplierSelectCell = ({
  value, display, onChange,
}: { value: string; display: string; onChange: (id: string) => void }) => {
  const md = useMasterData();
  return (
    <select value={value} onChange={(e) => { if (e.target.value !== value) onChange(e.target.value); }}
      className="w-full px-1.5 py-1 rounded text-[12.5px] bg-transparent hover:bg-muted/40 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
      style={{ color: "hsl(var(--brand-navy))" }} title={display}>
      {[...md.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
        const o = s.origin_id ? md.origins.find((x) => x.id === s.origin_id) : null;
        return (
          <option key={s.id} value={s.id}>
            {s.code ? `[${s.code}] ` : ""}{s.name}{o ? ` (${o.name})` : ""}
          </option>
        );
      })}
    </select>
  );
};

// ── Decoration cell — pick a method_detail ─────────────────────────
const DecorationCell = ({
  decoration, methodDetails, display, onChange,
}: { decoration: Decoration; methodDetails: MethodDetail[]; display: string; onChange: (id: string) => void }) => {
  // Group by parent decoration_method_id
  const byMethod = new Map<string, MethodDetail[]>();
  for (const m of methodDetails) {
    const arr = byMethod.get(m.decoration_method_id) ?? []; arr.push(m); byMethod.set(m.decoration_method_id, arr);
  }
  return (
    <select value={decoration.method_detail_id} onChange={(e) => onChange(e.target.value)}
      className="w-full px-1.5 py-1 rounded text-[12.5px] bg-transparent hover:bg-muted/40 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
      style={{ color: "hsl(var(--brand-navy))" }} title={display}>
      {[...byMethod.entries()].map(([mid, list]) => {
        const parentLabel = list[0]?.code?.split("-")[0] ?? "";
        return (
          <optgroup key={mid} label={parentLabel}>
            {list.map((md) => (
              <option key={md.id} value={md.id}>[{md.code}] {md.detail}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
};

// ── Numeric cell with optional unit suffix / prefix ────────────────
const NumericCell = ({
  value, suffix, prefix, min, integer, onSave,
}: {
  value: number | null;
  suffix?: string; prefix?: string; min?: number; integer?: boolean;
  onSave: (next: number | null) => Promise<boolean | void>;
}) => {
  const display = value == null ? "—" : `${prefix ?? ""}${value}${suffix ?? ""}`;
  return (
    <EditableCell
      value={value == null ? "" : String(value)}
      placeholder="—"
      onSave={async (raw) => {
        const v = integer ? intOrNull(raw) : numOrNull(raw);
        if (raw.trim() && v == null) { toast.error("Must be a number"); return false; }
        if (v != null && min != null && v < min) { toast.error(`Must be ≥ ${min}`); return false; }
        return onSave(v);
      }}
    />
  );
};

// ── Row menu (3-dots) — Delete + extras ───────────────────────────
const RowMenu = ({ onDelete, extra }: { onDelete: () => void; extra?: React.ReactNode }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button className="p-1 rounded hover:bg-muted/50 text-muted-foreground" aria-label="Row actions">
        <MoreVertical className="h-4 w-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-44 p-1">
      {extra}
      <button onClick={onDelete}
        className="w-full text-left px-3 py-2 text-sm rounded hover:bg-destructive/10 text-destructive flex items-center gap-2">
        <Trash2 className="h-4 w-4" /> Delete
      </button>
    </PopoverContent>
  </Popover>
);

const SmallMenu = ({
  items,
}: { items: { label: string; icon: React.ReactNode; onClick: () => void; destructive?: boolean }[] }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button className="p-1 rounded hover:bg-muted/50 text-muted-foreground" aria-label="Row actions">
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-44 p-1">
      {items.map((it, i) => (
        <button key={i} onClick={it.onClick}
          className={cn("w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2",
            it.destructive ? "hover:bg-destructive/10 text-destructive" : "hover:bg-muted")}
          style={!it.destructive ? { color: "hsl(var(--brand-navy))" } : undefined}>
          {it.icon} {it.label}
        </button>
      ))}
    </PopoverContent>
  </Popover>
);
