/**
 * Products — unified editable list. Each product is a full editable card.
 * No drill-down — every field autosaves on blur. Print PDF expands every
 * card and strips chrome so the page IS the printable pricing document.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Search, MoreVertical, Trash2, Copy as CopyIcon, X,
  Image as ImageIcon, ChevronDown, ChevronUp, Printer, Tag, Check,
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
import { composePrimaryItemNumber, nextSequenceFor } from "@/lib/productItemNumber";

// ─── Types ───────────────────────────────────────────────────────────────
interface Product {
  id: string;
  primary_item_number: string;
  name: string;
  subcategory_id: string;
  origin_id: string;
  supplier_id: string;
  supplier_item_number: string | null;
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
interface Cat { id: string; parent_id: string | null; code: string | null; name: string }
interface DetailLabel { id: string; label: string; sort_order: number }
interface PDetail { id: string; product_id: string; detail_label_id: string; value: string; sort_order: number }
interface MDetail { id: string; decoration_method_id: string; detail: string; code: string }
interface DMethod { id: string; name: string }
interface Deco { id: string; product_id: string; method_detail_id: string; notes: string | null; ref_image_url: string | null; sort_order: number }
interface Band { id: string; product_decoration_id: string; qty: number; unit_cost: number; setup_cost: number }

const REGION_LABEL_W = 110;

// ── Compact relative time ───────────────────────────────────────────────
function compactAgo(iso: string): string {
  const d = new Date(iso);
  const diffSec = (Date.now() - d.getTime()) / 1000;
  if (diffSec < 45) return "just now";
  return formatDistanceToNowStrict(d, { addSuffix: true })
    .replace(/ seconds?/, "s").replace(/ minutes?/, "m").replace(/ hours?/, "h")
    .replace(/ days?/, "d").replace(/ weeks?/, "w").replace(/ months?/, "mo")
    .replace(/ years?/, "y");
}

// ────────────────────────────────────────────────────────────────────────
// PAGE
// ────────────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const md = useMasterData();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [labels, setLabels] = useState<DetailLabel[]>([]);
  const [methodDetails, setMethodDetails] = useState<MDetail[]>([]);
  const [decoMethods, setDecoMethods] = useState<DMethod[]>([]);
  const [details, setDetails] = useState<PDetail[]>([]);
  const [decorations, setDecorations] = useState<Deco[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [subcatFilter, setSubcatFilter] = useState<Set<string>>(new Set());

  // Create-new draft card at top
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSup, setDraftSup] = useState("");
  const [draftSubcat, setDraftSubcat] = useState("");
  const [draftSupNum, setDraftSupNum] = useState("");
  const [creating, setCreating] = useState(false);

  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<Product | null>(null);
  const [confirmDeleteDeco, setConfirmDeleteDeco] = useState<Deco | null>(null);

  // Open draft if /products?new=1
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setDraftOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, c, dl, mdl, dm, pd, dec, bd] = await Promise.all([
        supabase.from("products").select("*").order("created_at", { ascending: false }),
        supabase.from("product_categories").select("id,parent_id,code,name"),
        supabase.from("detail_labels").select("*").order("sort_order"),
        supabase.from("method_details").select("id,decoration_method_id,detail,code").order("detail"),
        supabase.from("decoration_methods").select("id,name").order("name"),
        supabase.from("product_details").select("*").order("sort_order"),
        supabase.from("product_decorations").select("*").order("sort_order"),
        supabase.from("product_decoration_bands").select("*").order("qty"),
      ]);
      if (!alive) return;
      setProducts((p.data ?? []) as any);
      setCats((c.data ?? []) as any);
      setLabels((dl.data ?? []) as any);
      setMethodDetails((mdl.data ?? []) as any);
      setDecoMethods((dm.data ?? []) as any);
      setDetails((pd.data ?? []) as any);
      setDecorations((dec.data ?? []) as any);
      setBands((bd.data ?? []) as any);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("products-unified")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, async () => {
        const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false });
        setProducts((data ?? []) as any);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_details" }, async () => {
        const { data } = await supabase.from("product_details").select("*").order("sort_order");
        setDetails((data ?? []) as any);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_decorations" }, async () => {
        const { data } = await supabase.from("product_decorations").select("*").order("sort_order");
        setDecorations((data ?? []) as any);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_decoration_bands" }, async () => {
        const { data } = await supabase.from("product_decoration_bands").select("*").order("qty");
        setBands((data ?? []) as any);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "detail_labels" }, async () => {
        const { data } = await supabase.from("detail_labels").select("*").order("sort_order");
        setLabels((data ?? []) as any);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Scroll to hash anchor after load
  useEffect(() => {
    if (loading) return;
    if (location.hash?.startsWith("#p-")) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [loading, location.hash]);

  // Lookups
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const mdById = useMemo(() => new Map(methodDetails.map((m) => [m.id, m])), [methodDetails]);
  const dmById = useMemo(() => new Map(decoMethods.map((m) => [m.id, m])), [decoMethods]);

  const parentCats = useMemo(
    () => cats.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name)),
    [cats],
  );
  const subcategoryGroups = useMemo(() => parentCats.map((p) => ({
    parent: p,
    subs: cats.filter((c) => c.parent_id === p.id).sort((a, b) => a.name.localeCompare(b.name)),
  })), [cats, parentCats]);

  // Group method_details for picker
  const methodGroups = useMemo(() => {
    const map = new Map<string, MDetail[]>();
    for (const m of methodDetails) {
      const arr = map.get(m.decoration_method_id) ?? [];
      arr.push(m); map.set(m.decoration_method_id, arr);
    }
    return Array.from(map.entries())
      .map(([dmId, mds]) => ({ method: dmById.get(dmId), mds: mds.sort((a, b) => a.detail.localeCompare(b.detail)) }))
      .filter((g) => g.method)
      .sort((a, b) => a.method!.name.localeCompare(b.method!.name));
  }, [methodDetails, dmById]);

  // Filter cascade: when categoryFilter set, subcategories restricted; cleared subcats outside scope
  const visibleSubcatsForFilter = useMemo(() => {
    if (categoryFilter.size === 0) return cats.filter((c) => c.parent_id);
    return cats.filter((c) => c.parent_id && categoryFilter.has(c.parent_id));
  }, [cats, categoryFilter]);

  // Filter products
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (supplierFilter.size && !supplierFilter.has(p.supplier_id)) return false;
      const sub = catById.get(p.subcategory_id);
      const parentId = sub?.parent_id ?? null;
      if (categoryFilter.size && (!parentId || !categoryFilter.has(parentId))) return false;
      if (subcatFilter.size && !subcatFilter.has(p.subcategory_id)) return false;
      if (q) {
        const pDetails = details.filter((d) => d.product_id === p.id);
        const pDecos = decorations.filter((d) => d.product_id === p.id);
        const hay = [
          p.name, p.supplier_item_number ?? "", p.primary_item_number,
          ...pDetails.map((d) => d.value),
          ...pDecos.map((d) => {
            const m = mdById.get(d.method_detail_id);
            const dm = m ? dmById.get(m.decoration_method_id) : undefined;
            return `${dm?.name ?? ""} ${m?.detail ?? ""}`;
          }),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, search, supplierFilter, categoryFilter, subcatFilter, details, decorations, catById, mdById, dmById]);

  // Expand / collapse all
  const allCollapsed = filteredProducts.length > 0 && filteredProducts.every((p) => collapsedIds.has(p.id));
  const toggleAll = () => {
    if (allCollapsed) setCollapsedIds(new Set());
    else setCollapsedIds(new Set(filteredProducts.map((p) => p.id)));
  };

  // ── Mutations ──────────────────────────────────────────────────────────
  const patchProduct = useCallback(async (id: string, patch: Partial<Product>) => {
    const { error } = await supabase.from("products").update(patch as any).eq("id", id);
    if (error) { toast.error(`Save failed: ${error.message}`); return; }
    setProducts((arr) => arr.map((p) => (p.id === id ? { ...p, ...patch, updated_at: new Date().toISOString() } : p)));
  }, []);

  const patchDetail = useCallback(async (d: PDetail, value: string) => {
    const { error } = await supabase.from("product_details").update({ value } as any).eq("id", d.id);
    if (error) toast.error(`Save failed: ${error.message}`);
    else setDetails((arr) => arr.map((x) => (x.id === d.id ? { ...x, value } : x)));
  }, []);
  const removeDetail = useCallback(async (d: PDetail) => {
    const { error } = await supabase.from("product_details").delete().eq("id", d.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else setDetails((arr) => arr.filter((x) => x.id !== d.id));
  }, []);
  const addDetail = useCallback(async (productId: string, labelId: string) => {
    const existing = details.filter((d) => d.product_id === productId);
    const sortOrder = (existing.length ? Math.max(...existing.map((d) => d.sort_order)) : 0) + 1;
    const { data, error } = await supabase.from("product_details").insert({
      product_id: productId, detail_label_id: labelId, value: "", sort_order: sortOrder,
    } as any).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    setDetails((arr) => [...arr, data as any]);
  }, [details]);
  const createLabelAndAdd = useCallback(async (productId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextSort = (labels.length ? Math.max(...labels.map((l) => l.sort_order)) : 0) + 1;
    const { data, error } = await supabase.from("detail_labels").insert({ label: trimmed, sort_order: nextSort } as any).select().single();
    if (error) { toast.error(`Add label failed: ${error.message}`); return; }
    setLabels((arr) => [...arr, data as any]);
    await addDetail(productId, (data as any).id);
  }, [labels, addDetail]);

  const patchBand = useCallback(async (b: Band, patch: Partial<Band>) => {
    const { error } = await supabase.from("product_decoration_bands").update(patch as any).eq("id", b.id);
    if (error) toast.error(`Save failed: ${error.message}`);
    else setBands((arr) => arr.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
  }, []);
  const addBand = useCallback(async (decoId: string) => {
    const decoBands = bands.filter((b) => b.product_decoration_id === decoId);
    const nextQty = decoBands.length ? Math.max(...decoBands.map((b) => b.qty)) * 2 : 100;
    const { data, error } = await supabase.from("product_decoration_bands").insert({
      product_decoration_id: decoId, qty: nextQty, unit_cost: 0, setup_cost: 0,
    } as any).select().single();
    if (error) { toast.error(`Add tier failed: ${error.message}`); return; }
    setBands((arr) => [...arr, data as any]);
  }, [bands]);
  const removeBand = useCallback(async (b: Band) => {
    const { error } = await supabase.from("product_decoration_bands").delete().eq("id", b.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else setBands((arr) => arr.filter((x) => x.id !== b.id));
  }, []);
  const patchDeco = useCallback(async (d: Deco, patch: Partial<Deco>) => {
    const { error } = await supabase.from("product_decorations").update(patch as any).eq("id", d.id);
    if (error) toast.error(`Save failed: ${error.message}`);
    else setDecorations((arr) => arr.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
  }, []);
  const addDecoration = useCallback(async (productId: string, methodDetailId: string) => {
    const existing = decorations.filter((d) => d.product_id === productId);
    const nextSort = (existing.length ? Math.max(...existing.map((d) => d.sort_order)) : 0) + 1;
    const { data, error } = await supabase.from("product_decorations").insert({
      product_id: productId, method_detail_id: methodDetailId, sort_order: nextSort,
    } as any).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    const newDeco = data as any as Deco;
    setDecorations((arr) => [...arr, newDeco]);
    const seeds = [100, 250, 500, 1000].map((qty) => ({
      product_decoration_id: newDeco.id, qty, unit_cost: 0, setup_cost: 0,
    }));
    const { data: bandData, error: bErr } = await supabase.from("product_decoration_bands").insert(seeds as any).select();
    if (bErr) toast.error(`Tier seed failed: ${bErr.message}`);
    else setBands((arr) => [...arr, ...((bandData ?? []) as any)]);
  }, [decorations]);

  const deleteDecorationConfirmed = async () => {
    if (!confirmDeleteDeco) return;
    const d = confirmDeleteDeco;
    await supabase.from("product_decoration_bands").delete().eq("product_decoration_id", d.id);
    const { error } = await supabase.from("product_decorations").delete().eq("id", d.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else {
      setDecorations((arr) => arr.filter((x) => x.id !== d.id));
      setBands((arr) => arr.filter((x) => x.product_decoration_id !== d.id));
    }
    setConfirmDeleteDeco(null);
  };

  const deleteProductConfirmed = async () => {
    if (!confirmDeleteProduct) return;
    const id = confirmDeleteProduct.id;
    const decoIds = decorations.filter((d) => d.product_id === id).map((d) => d.id);
    if (decoIds.length) {
      await supabase.from("product_decoration_bands").delete().in("product_decoration_id", decoIds);
      await supabase.from("product_decorations").delete().eq("product_id", id);
    }
    await supabase.from("product_details").delete().eq("product_id", id);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else {
      setProducts((arr) => arr.filter((p) => p.id !== id));
      toast.success("Product deleted");
    }
    setConfirmDeleteProduct(null);
  };

  // Image uploads
  const uploadProductImage = async (productId: string, file: File) => {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${productId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
    if (upErr) { toast.error(`Upload failed: ${upErr.message}`); return; }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    await patchProduct(productId, { image_url: data.publicUrl });
  };
  const uploadDecoRef = async (d: Deco, file: File) => {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${d.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("decoration-refs").upload(path, file, { upsert: true });
    if (upErr) { toast.error(`Upload failed: ${upErr.message}`); return; }
    const { data } = supabase.storage.from("decoration-refs").getPublicUrl(path);
    await patchDeco(d, { ref_image_url: data.publicUrl });
  };

  // Duplicate product (lightweight: clone identity + specs; not decorations)
  const duplicateProduct = async (p: Product) => {
    const sub = catById.get(p.subcategory_id);
    if (!sub?.code) { toast.error("Subcategory has no code"); return; }
    const origin = md.origins.find((o) => o.id === p.origin_id);
    const letter = originLetterFromCode(origin?.code) ?? "X";
    const seq = nextSequenceFor(sub.code, products.map((x) => x.primary_item_number).filter(Boolean));
    const itemNumber = composePrimaryItemNumber(sub.code, seq, letter);
    const { data, error } = await supabase.from("products").insert({
      primary_item_number: itemNumber,
      name: `${p.name} (copy)`,
      subcategory_id: p.subcategory_id,
      origin_id: p.origin_id,
      supplier_id: p.supplier_id,
      supplier_item_number: p.supplier_item_number,
      image_url: p.image_url,
      carton_pack: p.carton_pack,
      carton_length: p.carton_length,
      carton_width: p.carton_width,
      carton_height: p.carton_height,
      carton_weight: p.carton_weight,
      production_days_min: p.production_days_min,
      production_days_max: p.production_days_max,
      moq: p.moq,
    } as any).select().single();
    if (error) { toast.error(`Duplicate failed: ${error.message}`); return; }
    setProducts((arr) => [data as any, ...arr]);
    toast.success(`Duplicated as ${itemNumber}`);
  };

  // Create from draft
  const handleCreate = async () => {
    if (!draftName.trim() || !draftSup || !draftSubcat) {
      toast.error("Name, Supplier and Subcategory are required."); return;
    }
    const sup = md.suppliers.find((s) => s.id === draftSup);
    if (!sup?.origin_id) { toast.error("Supplier has no origin."); return; }
    const subc = cats.find((c) => c.id === draftSubcat);
    if (!subc?.code) { toast.error("Subcategory has no code."); return; }
    const origin = md.origins.find((o) => o.id === sup.origin_id);
    const letter = originLetterFromCode(origin?.code);
    if (!letter) { toast.error("Supplier origin has no letter mapping."); return; }

    setCreating(true);
    const { data: existing } = await supabase.from("products").select("primary_item_number");
    const seq = nextSequenceFor(subc.code, (existing ?? []).map((x: any) => x.primary_item_number).filter(Boolean));
    const itemNumber = composePrimaryItemNumber(subc.code, seq, letter);
    const { data, error } = await supabase.from("products").insert({
      primary_item_number: itemNumber,
      name: draftName.trim(),
      subcategory_id: draftSubcat,
      origin_id: sup.origin_id,
      supplier_id: sup.id,
      supplier_item_number: draftSupNum.trim() || null,
      production_days_min: 1,
    } as any).select().single();
    setCreating(false);
    if (error) { toast.error(`Create failed: ${error.message}`); return; }
    setProducts((arr) => [data as any, ...arr]);
    toast.success(`Created ${itemNumber}`);
    setDraftOpen(false);
    setDraftName(""); setDraftSup(""); setDraftSubcat(""); setDraftSupNum("");
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <DesktopAppShell>
      <PrintStyles />
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 backdrop-blur-md border-b print-hide"
          style={{ backgroundColor: "hsl(var(--background) / 0.94)", borderColor: "hsl(var(--brand-navy) / 0.08)" }}
        >
          <div className="px-4 sm:px-6 lg:px-8 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
                MASTER DATA
              </div>
              <h1 className="text-[22px] leading-tight font-light tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>
                Products
                <span className="ml-3 text-[13px] text-muted-foreground font-normal">
                  {filteredProducts.length} {filteredProducts.length === products.length ? "" : `of ${products.length}`}
                </span>
              </h1>
            </div>
            <button
              onClick={toggleAll}
              className="h-9 px-3 rounded-md text-[13px] font-medium border hover:bg-muted/40 transition-colors"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.18)", color: "hsl(var(--brand-navy))" }}
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
            <button
              onClick={() => window.print()}
              className="h-9 px-3 rounded-md text-[13px] font-medium border inline-flex items-center gap-1.5 hover:bg-muted/40"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.18)", color: "hsl(var(--brand-navy))" }}
            >
              <Printer className="h-4 w-4" /> Print PDF
            </button>
            <button
              onClick={() => setDraftOpen(true)}
              className="h-9 px-3.5 rounded-md text-[13px] font-semibold inline-flex items-center gap-1.5 text-white"
              style={{ background: "hsl(var(--brand-orange))" }}
            >
              <Plus className="h-4 w-4" /> Add Product
            </button>
          </div>

          {/* Filter bar */}
          <div className="px-4 sm:px-6 lg:px-8 pb-3 flex items-center gap-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-[420px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, sup #, item #, detail values, methods…"
                className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              />
            </div>
            <MultiSelectFilter
              label="Supplier"
              options={md.suppliers.map((s) => ({ id: s.id, label: s.name }))}
              selected={supplierFilter}
              onChange={setSupplierFilter}
            />
            <MultiSelectFilter
              label="Category"
              options={parentCats.map((c) => ({ id: c.id, label: c.name }))}
              selected={categoryFilter}
              onChange={(next) => {
                setCategoryFilter(next);
                // Drop subcat filters not in scope
                setSubcatFilter((prev) => {
                  if (next.size === 0) return prev;
                  const allowed = new Set(cats.filter((c) => c.parent_id && next.has(c.parent_id)).map((c) => c.id));
                  return new Set(Array.from(prev).filter((id) => allowed.has(id)));
                });
              }}
            />
            <MultiSelectFilter
              label="Subcategory"
              options={visibleSubcatsForFilter.sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ id: c.id, label: c.name }))}
              selected={subcatFilter}
              onChange={setSubcatFilter}
            />
            {(supplierFilter.size || categoryFilter.size || subcatFilter.size || search) ? (
              <button
                onClick={() => { setSupplierFilter(new Set()); setCategoryFilter(new Set()); setSubcatFilter(new Set()); setSearch(""); }}
                className="text-[12px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Clear
              </button>
            ) : null}
            <div className="ml-auto text-[12px] text-muted-foreground">
              Showing <strong className="text-foreground tabular">{filteredProducts.length}</strong> of {products.length}
            </div>
          </div>
        </header>

        {/* Body */}
        <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1280px] mx-auto space-y-4 print-area">
          {draftOpen && (
            <DraftCard
              draftName={draftName} setDraftName={setDraftName}
              draftSup={draftSup} setDraftSup={setDraftSup}
              draftSubcat={draftSubcat} setDraftSubcat={setDraftSubcat}
              draftSupNum={draftSupNum} setDraftSupNum={setDraftSupNum}
              suppliers={md.suppliers}
              subcategoryGroups={subcategoryGroups}
              onCancel={() => { setDraftOpen(false); setDraftName(""); setDraftSup(""); setDraftSubcat(""); setDraftSupNum(""); }}
              onCreate={handleCreate}
              creating={creating}
            />
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }}>
              {products.length === 0 ? "No products yet — click + Add Product to start." : "No products match the filters."}
            </div>
          ) : (
            filteredProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                collapsed={collapsedIds.has(p.id)}
                onToggleCollapsed={() => {
                  setCollapsedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                    return next;
                  });
                }}
                catById={catById}
                labelById={labelById}
                mdById={mdById}
                dmById={dmById}
                suppliers={md.suppliers}
                subcategoryGroups={subcategoryGroups}
                methodGroups={methodGroups}
                allLabels={labels}
                details={details.filter((d) => d.product_id === p.id)}
                decorations={decorations.filter((d) => d.product_id === p.id).sort((a, b) => a.sort_order - b.sort_order)}
                bands={bands}
                onPatchProduct={(patch) => patchProduct(p.id, patch)}
                onPatchDetail={patchDetail}
                onRemoveDetail={removeDetail}
                onAddDetail={(lid) => addDetail(p.id, lid)}
                onCreateLabel={(name) => createLabelAndAdd(p.id, name)}
                onAddDecoration={(mdId) => addDecoration(p.id, mdId)}
                onPatchDeco={patchDeco}
                onRemoveDeco={(d) => setConfirmDeleteDeco(d)}
                onUploadDecoRef={uploadDecoRef}
                onAddBand={addBand}
                onPatchBand={patchBand}
                onRemoveBand={removeBand}
                onUploadImage={(f) => uploadProductImage(p.id, f)}
                onDuplicate={() => duplicateProduct(p)}
                onDelete={() => setConfirmDeleteProduct(p)}
              />
            ))
          )}
        </main>

        <ConfirmDialog
          open={!!confirmDeleteProduct}
          onCancel={() => setConfirmDeleteProduct(null)}
          title={`Delete ${confirmDeleteProduct?.name ?? "product"}?`}
          description="The product, all its details, decorations and pricing tiers will be removed."
          confirmLabel="Delete"
          destructive
          onConfirm={deleteProductConfirmed}
        />
        <ConfirmDialog
          open={!!confirmDeleteDeco}
          onCancel={() => setConfirmDeleteDeco(null)}
          title="Remove decoration?"
          description="The decoration and its pricing tiers will be deleted."
          confirmLabel="Remove"
          destructive
          onConfirm={deleteDecorationConfirmed}
        />
      </div>
    </DesktopAppShell>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Product card
// ────────────────────────────────────────────────────────────────────────
function ProductCard(props: {
  product: Product;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  catById: Map<string, Cat>;
  labelById: Map<string, DetailLabel>;
  mdById: Map<string, MDetail>;
  dmById: Map<string, DMethod>;
  suppliers: ReturnType<typeof useMasterData>["suppliers"];
  subcategoryGroups: { parent: Cat; subs: Cat[] }[];
  methodGroups: { method: DMethod | undefined; mds: MDetail[] }[];
  allLabels: DetailLabel[];
  details: PDetail[];
  decorations: Deco[];
  bands: Band[];
  onPatchProduct: (patch: Partial<Product>) => void;
  onPatchDetail: (d: PDetail, v: string) => void;
  onRemoveDetail: (d: PDetail) => void;
  onAddDetail: (labelId: string) => void;
  onCreateLabel: (name: string) => void;
  onAddDecoration: (mdId: string) => void;
  onPatchDeco: (d: Deco, p: Partial<Deco>) => void;
  onRemoveDeco: (d: Deco) => void;
  onUploadDecoRef: (d: Deco, f: File) => void;
  onAddBand: (decoId: string) => void;
  onPatchBand: (b: Band, p: Partial<Band>) => void;
  onRemoveBand: (b: Band) => void;
  onUploadImage: (f: File) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const {
    product: p, collapsed, onToggleCollapsed,
    catById, labelById, mdById, dmById, suppliers, subcategoryGroups, methodGroups, allLabels,
    details, decorations, bands,
  } = props;

  const supplier = suppliers.find((s) => s.id === p.supplier_id);
  const sub = catById.get(p.subcategory_id);
  const parent = sub?.parent_id ? catById.get(sub.parent_id) : null;
  const dimsUnit = supplier?.weight_unit === "lbs" ? "in" : "cm";
  const wtUnit = supplier?.weight_unit ?? "kg";

  // Card summary for collapsed
  const decoCount = decorations.length;
  const decoBands = bands.filter((b) => decorations.some((d) => d.id === b.product_decoration_id));
  const minUnit = decoBands.length ? Math.min(...decoBands.map((b) => b.unit_cost)) : null;
  const summary = `${decoCount} decoration${decoCount === 1 ? "" : "s"}${minUnit != null ? ` · from $${minUnit.toFixed(2)}` : ""}${p.production_days_min ? ` · ${p.production_days_min}${p.production_days_max ? `–${p.production_days_max}` : ""} days` : ""}`;

  const sortedDetails = useMemo(() => [...details].sort((a, b) => {
    const la = labelById.get(a.detail_label_id)?.sort_order ?? 0;
    const lb = labelById.get(b.detail_label_id)?.sort_order ?? 0;
    return la - lb || a.sort_order - b.sort_order;
  }), [details, labelById]);

  return (
    <article
      id={`p-${p.id}`}
      className="product-card rounded-xl border bg-white shadow-sm scroll-mt-32"
      style={{ borderColor: "hsl(var(--brand-navy) / 0.10)" }}
    >
      {/* Region 1 — Identity */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "hsl(var(--brand-navy) / 0.06)" }}>
        <ImageThumb url={p.image_url} size={48} onFile={props.onUploadImage} />
        <SupplierPill supplier={supplier ?? null} suppliers={suppliers}
          onPick={(id) => props.onPatchProduct({ supplier_id: id, origin_id: suppliers.find((s) => s.id === id)?.origin_id ?? p.origin_id } as any)}
        />
        <CategoryPill name={parent?.name ?? "—"} />
        <SubcatPill name={sub?.name ?? "—"} subcategoryGroups={subcategoryGroups}
          onPick={(id) => props.onPatchProduct({ subcategory_id: id })} />
        <InlineText
          value={p.name}
          placeholder="Product name"
          className="w-[200px] text-[13px] font-medium"
          onCommit={(v) => props.onPatchProduct({ name: v })}
        />
        <InlineText
          value={p.supplier_item_number ?? ""}
          placeholder="SUP #"
          className="w-[110px] text-[12px] font-mono"
          onCommit={(v) => props.onPatchProduct({ supplier_item_number: v || null })}
        />
        <span
          className="h-7 px-2 inline-flex items-center rounded text-[11px] font-mono tabular tracking-wide"
          style={{ background: "hsl(var(--brand-navy) / 0.05)", color: "hsl(var(--brand-navy) / 0.55)" }}
          title="System item number"
        >
          {p.primary_item_number}
        </span>
        <div className="ml-auto flex items-center gap-1 print-hide">
          <span className="text-[11px] text-muted-foreground tabular pr-1">{compactAgo(p.updated_at)}</span>
          <button onClick={onToggleCollapsed} className="p-1.5 rounded hover:bg-muted/50" aria-label={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <KebabMenu onDuplicate={props.onDuplicate} onDelete={props.onDelete} />
        </div>
      </div>

      {collapsed ? (
        <div className="px-4 py-2 text-[12px] text-muted-foreground">{summary}</div>
      ) : (
        <>
          {/* Region 2 — Specs */}
          <Region label="SPECS">
            <div className="flex flex-wrap items-center gap-4">
              <SpecField label="PACK">
                <NumberInput value={p.carton_pack} onCommit={(v) => props.onPatchProduct({ carton_pack: v as any })} suffix="/ ctn" width={80} />
              </SpecField>
              <SpecField label="CARTON L×W×H">
                <div className="flex items-center gap-1">
                  <NumberInput value={p.carton_length} onCommit={(v) => props.onPatchProduct({ carton_length: v as any })} width={60} />
                  <span className="text-muted-foreground text-xs">×</span>
                  <NumberInput value={p.carton_width} onCommit={(v) => props.onPatchProduct({ carton_width: v as any })} width={60} />
                  <span className="text-muted-foreground text-xs">×</span>
                  <NumberInput value={p.carton_height} onCommit={(v) => props.onPatchProduct({ carton_height: v as any })} width={60} />
                  <span className="text-[11px] text-muted-foreground ml-1">{dimsUnit}</span>
                </div>
              </SpecField>
              <SpecField label="WEIGHT">
                <NumberInput value={p.carton_weight} onCommit={(v) => props.onPatchProduct({ carton_weight: v as any })} suffix={wtUnit} width={90} />
              </SpecField>
              <SpecField label="LEAD MIN">
                <NumberInput value={p.production_days_min} onCommit={(v) => props.onPatchProduct({ production_days_min: (v ?? 1) as any })} suffix="d" width={70} />
              </SpecField>
              <SpecField label="LEAD MAX">
                <NumberInput value={p.production_days_max} onCommit={(v) => props.onPatchProduct({ production_days_max: v as any })} suffix="d" width={70} />
              </SpecField>
              <SpecField label="MOQ">
                <NumberInput value={p.moq} onCommit={(v) => props.onPatchProduct({ moq: v as any })} width={80} />
              </SpecField>
            </div>
          </Region>

          {/* Region 3 — Description */}
          <Region label="DESCRIPTION">
            <div className="flex flex-wrap items-center gap-2">
              {sortedDetails.length === 0 && (
                <span className="text-[12px] italic text-muted-foreground mr-1">No details yet.</span>
              )}
              {sortedDetails.map((d) => (
                <DetailChip
                  key={d.id}
                  label={labelById.get(d.detail_label_id)?.label ?? "—"}
                  value={d.value}
                  onCommit={(v) => props.onPatchDetail(d, v)}
                  onRemove={() => props.onRemoveDetail(d)}
                />
              ))}
              <AddDetailPopover
                availableLabels={allLabels.filter((l) => !details.some((d) => d.detail_label_id === l.id))}
                onPick={props.onAddDetail}
                onCreateNew={props.onCreateLabel}
              />
            </div>
          </Region>

          {/* Region 4 — Decorations */}
          <Region label="DECORATIONS" last>
            <div className="space-y-3">
              {decorations.length === 0 && (
                <p className="text-[12px] italic text-muted-foreground">No decorations yet.</p>
              )}
              {decorations.map((d) => (
                <DecoCard
                  key={d.id}
                  deco={d}
                  methodGroups={methodGroups}
                  mdById={mdById}
                  dmById={dmById}
                  bands={bands.filter((b) => b.product_decoration_id === d.id).sort((a, b) => a.qty - b.qty)}
                  onPatchDeco={(p) => props.onPatchDeco(d, p)}
                  onUploadRef={(f) => props.onUploadDecoRef(d, f)}
                  onRemove={() => props.onRemoveDeco(d)}
                  onAddBand={() => props.onAddBand(d.id)}
                  onPatchBand={props.onPatchBand}
                  onRemoveBand={props.onRemoveBand}
                />
              ))}
              <AddDecorationPopover methodGroups={methodGroups} onPick={props.onAddDecoration} />
            </div>
          </Region>
        </>
      )}
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function Region({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`px-4 py-3 ${last ? "" : "border-b"}`} style={{ borderColor: "hsl(var(--brand-navy) / 0.06)" }}>
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] pt-[6px]"
          style={{ color: "hsl(var(--brand-navy) / 0.45)", width: REGION_LABEL_W }}
        >
          {label}
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function SpecField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function InlineText({
  value, onCommit, placeholder, className,
}: { value: string; onCommit: (v: string) => void; placeholder?: string; className?: string }) {
  const [local, setLocal] = useState(value);
  const [saved, setSaved] = useState(false);
  useEffect(() => setLocal(value), [value]);
  return (
    <input
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) {
          onCommit(local);
          setSaved(true);
          setTimeout(() => setSaved(false), 700);
        }
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
      className={`h-8 px-2 rounded border bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.35)] transition-shadow ${className ?? ""}`}
      style={{ borderColor: saved ? "hsl(var(--brand-orange))" : "hsl(var(--brand-navy) / 0.12)" }}
    />
  );
}

function NumberInput({
  value, onCommit, suffix, width,
}: { value: number | null | undefined; onCommit: (v: number | null) => void; suffix?: string; width?: number }) {
  const [local, setLocal] = useState<string>(value == null ? "" : String(value));
  const [saved, setSaved] = useState(false);
  useEffect(() => setLocal(value == null ? "" : String(value)), [value]);
  return (
    <div className="relative" style={{ width }}>
      <input
        inputMode="decimal"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const trimmed = local.trim();
          const next = trimmed === "" ? null : Number(trimmed);
          if (next != null && !Number.isFinite(next)) return;
          if (next !== (value ?? null)) {
            onCommit(next);
            setSaved(true);
            setTimeout(() => setSaved(false), 700);
          }
        }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        className="w-full h-8 px-2 rounded border bg-background text-[13px] tabular focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.35)] transition-shadow"
        style={{
          paddingRight: suffix ? 32 : undefined,
          borderColor: saved ? "hsl(var(--brand-orange))" : "hsl(var(--brand-navy) / 0.12)",
        }}
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">{suffix}</span>
      )}
    </div>
  );
}

function ImageThumb({ url, size, onFile }: { url: string | null; size: number; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="shrink-0 rounded-md border overflow-hidden flex items-center justify-center hover:bg-muted/30"
        style={{ width: size, height: size, borderColor: "hsl(var(--brand-navy) / 0.18)" }}
      >
        {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }} />
    </>
  );
}

function SupplierPill({ supplier, suppliers, onPick }: {
  supplier: { id: string; name: string; origin_id?: string | null } | null;
  suppliers: ReturnType<typeof useMasterData>["suppliers"];
  onPick: (id: string) => void;
}) {
  const color = supplier ? supplierColor(supplier.name) : "hsl(var(--muted))";
  return (
    <Select value={supplier?.id ?? ""} onValueChange={onPick}>
      <SelectTrigger
        className="h-7 w-auto min-w-0 px-2.5 rounded-full border-0 text-[11px] font-semibold gap-1 focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.3)]"
        style={{ background: color, color: "white" }}
      >
        <SelectValue placeholder="Supplier" />
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {[...suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function CategoryPill({ name }: { name: string }) {
  return (
    <span
      className="h-7 px-2.5 inline-flex items-center rounded-full text-[11px] font-medium"
      style={{ background: "hsl(var(--brand-navy) / 0.06)", color: "hsl(var(--brand-navy) / 0.75)" }}
    >
      {name}
    </span>
  );
}
function SubcatPill({ name, subcategoryGroups, onPick }: {
  name: string;
  subcategoryGroups: { parent: Cat; subs: Cat[] }[];
  onPick: (id: string) => void;
}) {
  return (
    <Select value="" onValueChange={onPick}>
      <SelectTrigger
        className="h-7 w-auto min-w-0 px-2.5 rounded-full border text-[11px] font-medium gap-1 bg-background focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.3)]"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.18)", color: "hsl(var(--brand-navy))" }}
      >
        <span className="truncate">{name}</span>
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
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
  );
}

function KebabMenu({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="p-1.5 rounded hover:bg-muted/50" aria-label="More">
          <MoreVertical className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <button onClick={() => { onDuplicate(); setOpen(false); }}
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/60 flex items-center gap-2">
          <CopyIcon className="h-3.5 w-3.5" /> Duplicate
        </button>
        <button onClick={() => { onDelete(); setOpen(false); }}
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-destructive/10 text-destructive flex items-center gap-2">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </PopoverContent>
    </Popover>
  );
}

function DetailChip({
  label, value, onCommit, onRemove,
}: { label: string; value: string; onCommit: (v: string) => void; onRemove: () => void }) {
  return (
    <div className="group inline-flex items-center gap-1.5 rounded-md border h-8 pl-2 pr-1"
      style={{ borderColor: "hsl(var(--brand-navy) / 0.12)", background: "hsl(var(--brand-navy) / 0.02)" }}>
      <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "hsl(var(--brand-navy) / 0.55)" }}>
        {label}
      </span>
      <InlineText
        value={value}
        onCommit={onCommit}
        placeholder="value"
        className="w-[140px] h-6 px-1.5 text-[12px] border-0 focus:ring-1"
      />
      <button
        onClick={onRemove}
        className="p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive print-hide"
        aria-label="Remove detail"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function AddDetailPopover({
  availableLabels, onPick, onCreateNew,
}: { availableLabels: DetailLabel[]; onPick: (id: string) => void; onCreateNew: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const filtered = availableLabels
    .filter((l) => !search.trim() || l.label.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSearch(""); setCreating(false); setNewName(""); } }}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 px-2 h-8 rounded-md text-[12px] font-medium border border-dashed hover:bg-muted/30 print-hide"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.20)", color: "hsl(var(--brand-orange))" }}
        >
          <Plus className="h-3.5 w-3.5" /> Add detail
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search labels…"
              className="w-full h-8 pl-8 pr-2 rounded text-sm bg-muted/40 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-navy)/0.4)]" />
          </div>
        </div>
        <div className="max-h-64 overflow-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {availableLabels.length === 0 ? "All labels are already added." : "No matches."}
            </div>
          ) : filtered.map((l) => (
            <button key={l.id} onClick={() => { onPick(l.id); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60 flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{l.label}</span>
            </button>
          ))}
        </div>
        <div className="border-t p-2">
          {!creating ? (
            <button onClick={() => setCreating(true)}
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted/60 flex items-center gap-2"
              style={{ color: "hsl(var(--brand-orange))" }}>
              <Plus className="h-4 w-4" /> Add new label…
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Label name"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) { onCreateNew(newName); setOpen(false); }
                  if (e.key === "Escape") setCreating(false);
                }}
                className="flex-1 h-8 px-2 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-navy)/0.4)]" />
              <button onClick={() => { if (newName.trim()) { onCreateNew(newName); setOpen(false); } }}
                className="px-2 h-8 rounded text-xs font-semibold text-white" style={{ background: "hsl(var(--brand-orange))" }}>
                Add
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DecoCard({
  deco, methodGroups, mdById, dmById, bands,
  onPatchDeco, onUploadRef, onRemove, onAddBand, onPatchBand, onRemoveBand,
}: {
  deco: Deco;
  methodGroups: { method: DMethod | undefined; mds: MDetail[] }[];
  mdById: Map<string, MDetail>;
  dmById: Map<string, DMethod>;
  bands: Band[];
  onPatchDeco: (p: Partial<Deco>) => void;
  onUploadRef: (f: File) => void;
  onRemove: () => void;
  onAddBand: () => void;
  onPatchBand: (b: Band, p: Partial<Band>) => void;
  onRemoveBand: (b: Band) => void;
}) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "hsl(var(--brand-navy) / 0.10)", background: "hsl(var(--brand-navy) / 0.02)" }}>
      <div className="flex items-center gap-3">
        <ImageThumb url={deco.ref_image_url} size={40} onFile={onUploadRef} />
        <div className="flex-1 grid grid-cols-2 gap-2">
          <Select value={deco.method_detail_id} onValueChange={(v) => onPatchDeco({ method_detail_id: v })}>
            <SelectTrigger className="h-8 text-[13px]"><SelectValue placeholder="Method…" /></SelectTrigger>
            <SelectContent className="max-h-[320px]">
              {methodGroups.map((g) => (
                <SelectGroup key={g.method!.id}>
                  <SelectLabel>{g.method!.name}</SelectLabel>
                  {g.mds.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.detail}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <InlineText value={deco.notes ?? ""} placeholder="Notes (optional)"
            onCommit={(v) => onPatchDeco({ notes: v || null })} className="w-full" />
        </div>
        <button onClick={onRemove} className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive print-hide"
          aria-label="Remove decoration">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2.5 pl-[52px]">
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">PRICING TIERS</div>
        <div className="rounded-md border overflow-hidden bg-white" style={{ borderColor: "hsl(var(--brand-navy) / 0.10)" }}>
          <div className="grid text-[10px] uppercase tracking-wide font-semibold px-3 py-1"
            style={{ gridTemplateColumns: "1fr 1fr 1fr 32px", color: "hsl(var(--brand-navy) / 0.55)", background: "hsl(var(--brand-navy) / 0.03)" }}>
            <div>Qty</div><div>Unit cost $</div><div>Setup cost $</div><div />
          </div>
          {bands.length === 0 && <div className="px-3 py-2 text-[11px] italic text-muted-foreground">No tiers.</div>}
          {bands.map((b) => (
            <div key={b.id} className="grid items-center gap-2 px-3 py-1 border-t group"
              style={{ gridTemplateColumns: "1fr 1fr 1fr 32px", borderColor: "hsl(var(--brand-navy) / 0.06)" }}>
              <NumberInput value={b.qty} onCommit={(v) => onPatchBand(b, { qty: (v ?? 0) as any })} />
              <NumberInput value={b.unit_cost} onCommit={(v) => onPatchBand(b, { unit_cost: (v ?? 0) as any })} />
              <NumberInput value={b.setup_cost} onCommit={(v) => onPatchBand(b, { setup_cost: (v ?? 0) as any })} />
              <button onClick={() => onRemoveBand(b)} aria-label="Remove tier"
                className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive print-hide">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button onClick={onAddBand} className="w-full px-3 py-1.5 text-[11px] text-left border-t flex items-center gap-1.5 hover:bg-muted/30 print-hide"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.06)", color: "hsl(var(--brand-orange))" }}>
            <Plus className="h-3 w-3" /> Add tier
          </button>
        </div>
      </div>
    </div>
  );
}

function AddDecorationPopover({
  methodGroups, onPick,
}: { methodGroups: { method: DMethod | undefined; mds: MDetail[] }[]; onPick: (mdId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = methodGroups.map((g) => ({
    method: g.method!,
    mds: g.mds.filter((m) => !search.trim() || m.detail.toLowerCase().includes(search.toLowerCase()) || m.code.toLowerCase().includes(search.toLowerCase())),
  })).filter((g) => g.mds.length > 0);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[12px] font-medium border border-dashed hover:bg-muted/30 print-hide"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.20)", color: "hsl(var(--brand-orange))" }}
        >
          <Plus className="h-3.5 w-3.5" /> Add decoration
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search methods…"
              className="w-full h-8 pl-8 pr-2 rounded text-sm bg-muted/40 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-navy)/0.4)]" />
          </div>
        </div>
        <div className="max-h-72 overflow-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No matches.</div>
          ) : filtered.map((g) => (
            <div key={g.method.id} className="py-1">
              <div className="px-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{g.method.name}</div>
              {g.mds.map((m) => (
                <button key={m.id} onClick={() => { onPick(m.id); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60">
                  {m.detail}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Multi-select filter dropdown
function MultiSelectFilter({
  label, options, selected, onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = options.filter((o) => !q.trim() || o.label.toLowerCase().includes(q.toLowerCase()));
  const count = selected.size;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button
          className="h-9 px-3 rounded-md border text-[13px] inline-flex items-center gap-1.5 hover:bg-muted/40"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.18)", color: "hsl(var(--brand-navy))" }}
        >
          {label}
          {count > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold text-white"
              style={{ background: "hsl(var(--brand-orange))" }}>
              {count}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full h-8 pl-8 pr-2 rounded text-sm bg-muted/40 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-navy)/0.4)]" />
          </div>
        </div>
        <div className="max-h-64 overflow-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No matches.</div>
          ) : filtered.map((o) => {
            const on = selected.has(o.id);
            return (
              <button key={o.id} onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(o.id); else next.add(o.id);
                onChange(next);
              }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded border"
                  style={{ borderColor: on ? "hsl(var(--brand-orange))" : "hsl(var(--brand-navy) / 0.25)", background: on ? "hsl(var(--brand-orange))" : "transparent" }}>
                  {on && <Check className="h-3 w-3 text-white" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
        {count > 0 && (
          <div className="border-t p-2">
            <button onClick={() => onChange(new Set())} className="w-full text-left px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground">
              Clear {count} selected
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// New-product draft card
function DraftCard({
  draftName, setDraftName, draftSup, setDraftSup, draftSubcat, setDraftSubcat,
  draftSupNum, setDraftSupNum, suppliers, subcategoryGroups, onCancel, onCreate, creating,
}: any) {
  return (
    <article className="rounded-xl border-2 bg-white shadow-sm"
      style={{ borderColor: "hsl(var(--brand-orange))" }}>
      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: "hsl(var(--brand-orange) / 0.3)" }}>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--brand-orange))" }}>NEW PRODUCT</span>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Name *</div>
          <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)}
            className="w-full h-9 px-2 rounded border bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.35)]"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.18)" }} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Supplier *</div>
          <Select value={draftSup} onValueChange={setDraftSup}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {[...suppliers].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Subcategory *</div>
          <Select value={draftSubcat} onValueChange={setDraftSubcat}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent className="max-h-[320px]">
              {subcategoryGroups.map((g: any) => (
                <SelectGroup key={g.parent.id}>
                  <SelectLabel>{g.parent.name}</SelectLabel>
                  {g.subs.map((s: Cat) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Supplier item #</div>
          <input value={draftSupNum} onChange={(e) => setDraftSupNum(e.target.value)} placeholder="optional"
            className="w-full h-9 px-2 rounded border bg-background text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.35)]"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.18)" }} />
        </div>
      </div>
      <div className="px-4 pb-4 flex justify-end gap-2">
        <button onClick={onCancel} className="h-9 px-3 rounded-md text-[13px] font-medium border hover:bg-muted/40"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.18)", color: "hsl(var(--brand-navy))" }}>
          Cancel
        </button>
        <button onClick={onCreate} disabled={creating}
          className="h-9 px-3.5 rounded-md text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "hsl(var(--brand-orange))" }}>
          {creating ? "Creating…" : "Create product"}
        </button>
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Print styles
// ────────────────────────────────────────────────────────────────────────
function PrintStyles() {
  return (
    <style>{`
      @media print {
        @page { margin: 14mm; size: A4; }
        body { background: white !important; }
        .print-hide, [data-sidebar], header.sticky button { display: none !important; }
        .sticky { position: static !important; }
        .product-card {
          break-inside: avoid;
          page-break-inside: avoid;
          page-break-after: auto;
          box-shadow: none !important;
          margin-bottom: 12px;
        }
        .product-card .border-b { border-color: rgba(0,0,0,0.08) !important; }
        input, select, button {
          color: black !important;
          background: transparent !important;
          border-color: rgba(0,0,0,0.08) !important;
        }
      }
    `}</style>
  );
}
