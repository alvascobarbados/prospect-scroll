/**
 * Products — true spreadsheet-density table.
 * One HTML <table>, each product spans N body rows (one row per tier band
 * across its decorations). Identity + specs use rowSpan to merge vertically,
 * Excel-style. Every cell autosaves on blur.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Search, MoreVertical, Trash2, Copy as CopyIcon, X,
  Image as ImageIcon, ChevronDown, Printer, Tag, Check,
} from "lucide-react";
import { toast } from "sonner";
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
  parent_product_id: string | null;
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
  created_at: string;
  updated_at: string;
}
interface Cat { id: string; parent_id: string | null; code: string | null; name: string }
interface DetailLabel { id: string; label: string; sort_order: number }
interface PDetail { id: string; product_id: string; detail_label_id: string; value: string; sort_order: number }
interface MDetail { id: string; decoration_method_id: string; detail: string; code: string }
interface DMethod { id: string; name: string }
interface Deco { id: string; product_id: string; method_detail_id: string; notes: string | null; ref_image_url: string | null; sort_order: number }
interface Band { id: string; product_decoration_id: string; qty: number; unit_cost: number; setup_cost: number }

// Sub-product visual accent (brand cream/tan)
const SUB_ACCENT = "#E6DDC9";

// Column widths. The wide DECORATION column is gone — replaced by a slim DECO
// image column on the left of each decoration block. Method + Notes now live in
// a header row inside the decoration block that spans qty/unit/setup, with tier
// rows below.
const COLS: { key: string; w: number; label: string; hint?: string }[] = [
  { key: "img",     w: 80,  label: "IMG" },
  { key: "id",      w: 260, label: "NAME / # / DETAILS" },
  { key: "pack",    w: 60,  label: "PACK",   hint: "/ ctn" },
  { key: "l",       w: 50,  label: "L" },
  { key: "w",       w: 50,  label: "W" },
  { key: "h",       w: 50,  label: "H" },
  { key: "wt",      w: 60,  label: "WT" },
  { key: "lead",    w: 90,  label: "LEAD",   hint: "days" },
  { key: "decoImg", w: 96,  label: "DECO" },
  { key: "qty",     w: 70,  label: "QTY" },
  { key: "unit",    w: 80,  label: "UNIT",   hint: "USD$" },
  { key: "setup",   w: 80,  label: "SETUP",  hint: "USD$" },
  { key: "menu",    w: 32,  label: "" },
];


// ────────────────────────────────────────────────────────────────────────
// PAGE
// ────────────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const md = useMasterData();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [labels, setLabels] = useState<DetailLabel[]>([]);
  const [methodDetails, setMethodDetails] = useState<MDetail[]>([]);
  const [decoMethods, setDecoMethods] = useState<DMethod[]>([]);
  const [details, setDetails] = useState<PDetail[]>([]);
  const [decorations, setDecorations] = useState<Deco[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [subcatFilter, setSubcatFilter] = useState<Set<string>>(new Set());

  // Inline draft rows (each pre-empty product being typed in the table). When
  // `parent_product_id` is set, the draft is rendered directly below that parent
  // product and persisted as a sub-product.
  interface DraftRow {
    tempId: string;
    parent_product_id: string | null;
    name: string;
    supplier_id: string;
    subcategory_id: string;
    supplier_item_number: string;
  }
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const persistingRef = useRef<Set<string>>(new Set());

  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<Product | null>(null);
  const [confirmDeleteDeco, setConfirmDeleteDeco] = useState<Deco | null>(null);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      addDraft();
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);


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

  useEffect(() => {
    const channel = supabase
      .channel("products-table")
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

  useEffect(() => {
    if (loading) return;
    if (location.hash?.startsWith("#p-")) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [loading, location.hash]);

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

  const visibleSubcatsForFilter = useMemo(() => {
    if (categoryFilter.size === 0) return cats.filter((c) => c.parent_id);
    return cats.filter((c) => c.parent_id && categoryFilter.has(c.parent_id));
  }, [cats, categoryFilter]);

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

  // Render items: interleave top-level products, their sub-products, and drafts
  // (top-level drafts at top, sub-product drafts directly under their parent).
  type RenderItem =
    | { kind: "draft"; draft: DraftRow }
    | { kind: "product"; product: Product; isSub: boolean };

  const childrenByParent = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) {
      if (!p.parent_product_id) continue;
      const arr = m.get(p.parent_product_id) ?? [];
      arr.push(p);
      m.set(p.parent_product_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    }
    return m;
  }, [products]);

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    const filteredIds = new Set(filteredProducts.map((p) => p.id));
    // Top-level drafts
    for (const d of drafts) {
      if (!d.parent_product_id) items.push({ kind: "draft", draft: d });
    }
    // Top-level products in filter order, with sub-products + sub-drafts grouped
    for (const p of filteredProducts) {
      if (p.parent_product_id) continue; // handled below the parent
      items.push({ kind: "product", product: p, isSub: false });
      const subs = (childrenByParent.get(p.id) ?? []).filter((s) => filteredIds.has(s.id));
      for (const s of subs) items.push({ kind: "product", product: s, isSub: true });
      for (const d of drafts) {
        if (d.parent_product_id === p.id) items.push({ kind: "draft", draft: d });
      }
    }
    // Orphan sub-products whose parent isn't visible — render as if top-level
    for (const p of filteredProducts) {
      if (!p.parent_product_id) continue;
      if (filteredIds.has(p.parent_product_id) && products.some((x) => x.id === p.parent_product_id)) continue;
      items.push({ kind: "product", product: p, isSub: false });
    }
    return items;
  }, [filteredProducts, drafts, childrenByParent, products]);


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

  // Inline drafts: add / update / remove / persist
  function addDraft(opts?: { parentProductId?: string | null; supplier_id?: string; subcategory_id?: string }) {
    setDrafts((arr) => [
      {
        tempId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        parent_product_id: opts?.parentProductId ?? null,
        name: "",
        supplier_id: opts?.supplier_id ?? "",
        subcategory_id: opts?.subcategory_id ?? "",
        supplier_item_number: "",
      },
      ...arr,
    ]);
  }
  const addSubProductDraft = useCallback((parent: Product) => {
    addDraft({
      parentProductId: parent.id,
      supplier_id: parent.supplier_id,
      subcategory_id: parent.subcategory_id,
    });
  }, []);
  const removeDraft = useCallback((tempId: string) => {
    setDrafts((arr) => arr.filter((d) => d.tempId !== tempId));
  }, []);
  const updateDraft = useCallback((tempId: string, patch: Partial<DraftRow>) => {
    setDrafts((arr) => {
      const next = arr.map((d) => (d.tempId === tempId ? { ...d, ...patch } : d));
      const target = next.find((d) => d.tempId === tempId);
      if (target && target.name.trim() && target.supplier_id && target.subcategory_id && !persistingRef.current.has(tempId)) {
        persistingRef.current.add(tempId);
        void persistDraft(target);
      }
      return next;
    });
  }, []);
  async function persistDraft(d: DraftRow) {
    try {
      const sup = md.suppliers.find((s) => s.id === d.supplier_id);
      if (!sup?.origin_id) { toast.error("Supplier has no origin."); return; }
      const subc = cats.find((c) => c.id === d.subcategory_id);
      if (!subc?.code) { toast.error("Subcategory has no code."); return; }
      const origin = md.origins.find((o) => o.id === sup.origin_id);
      const letter = originLetterFromCode(origin?.code);
      if (!letter) { toast.error("Supplier origin has no letter mapping."); return; }
      const { data: existing } = await supabase.from("products").select("primary_item_number");
      const seq = nextSequenceFor(subc.code, (existing ?? []).map((x: any) => x.primary_item_number).filter(Boolean));
      const itemNumber = composePrimaryItemNumber(subc.code, seq, letter);
      const { data, error } = await supabase.from("products").insert({
        primary_item_number: itemNumber,
        parent_product_id: d.parent_product_id,
        name: d.name.trim(),
        subcategory_id: d.subcategory_id,
        origin_id: sup.origin_id,
        supplier_id: sup.id,
        supplier_item_number: d.supplier_item_number.trim() || null,
        production_days_min: 1,
      } as any).select().single();
      if (error) { toast.error(`Create failed: ${error.message}`); return; }
      setProducts((arr) => [data as any, ...arr]);
      setDrafts((arr) => arr.filter((x) => x.tempId !== d.tempId));
      toast.success(`Created ${itemNumber}`);
    } finally {
      persistingRef.current.delete(d.tempId);
    }
  }


  // Pre-group decos/bands for fast lookup
  const decosByProduct = useMemo(() => {
    const m = new Map<string, Deco[]>();
    for (const d of decorations) {
      const arr = m.get(d.product_id) ?? [];
      arr.push(d); m.set(d.product_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sort_order - b.sort_order);
    return m;
  }, [decorations]);
  const bandsByDeco = useMemo(() => {
    const m = new Map<string, Band[]>();
    for (const b of bands) {
      const arr = m.get(b.product_decoration_id) ?? [];
      arr.push(b); m.set(b.product_decoration_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.qty - b.qty);
    return m;
  }, [bands]);
  const detailsByProduct = useMemo(() => {
    const m = new Map<string, PDetail[]>();
    for (const d of details) {
      const arr = m.get(d.product_id) ?? [];
      arr.push(d); m.set(d.product_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const la = labelById.get(a.detail_label_id)?.sort_order ?? 0;
        const lb = labelById.get(b.detail_label_id)?.sort_order ?? 0;
        return la - lb || a.sort_order - b.sort_order;
      });
    }
    return m;
  }, [details, labelById]);

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
                  · {filteredProducts.length}{filteredProducts.length === products.length ? "" : ` of ${products.length}`}
                </span>
              </h1>
            </div>
            <div className="relative w-[420px] max-w-[40vw]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, sup #, item #, details, methods…"
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
              label="Subcategory"
              options={visibleSubcatsForFilter.sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ id: c.id, label: c.name }))}
              selected={subcatFilter}
              onChange={setSubcatFilter}
            />
            <button
              onClick={() => window.print()}
              className="h-9 px-3 rounded-md text-[13px] font-medium border inline-flex items-center gap-1.5 hover:bg-muted/40"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.18)", color: "hsl(var(--brand-navy))" }}
            >
              <Printer className="h-4 w-4" /> Print PDF
            </button>
            <button
              onClick={() => addDraft()}
              className="h-9 px-3.5 rounded-md text-[13px] font-semibold inline-flex items-center gap-1.5 text-white"
              style={{ background: "hsl(var(--brand-orange))" }}
            >
              <Plus className="h-4 w-4" /> Add Product
            </button>
          </div>
        </header>

        {/* Table */}
        <main className="print-area">
          {loading ? (
            <p className="text-sm text-muted-foreground p-6">Loading…</p>
          ) : filteredProducts.length === 0 && drafts.length === 0 ? (
            <div className="m-6 rounded-xl border p-10 text-center text-sm text-muted-foreground"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }}>
              {products.length === 0 ? "No products yet — click + Add Product to start." : "No products match the filters."}
            </div>
          ) : (
            <table
              className="products-table"
              style={{
                borderCollapse: "separate",
                borderSpacing: 0,
                width: "100%",
                minWidth: COLS.reduce((s, c) => s + c.w, 0),
                tableLayout: "fixed",
                fontSize: 13,
                color: "hsl(var(--brand-navy))",
              }}
            >
              <colgroup>
                {COLS.map((c) => <col key={c.key} style={{ width: c.w }} />)}
              </colgroup>
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      className="th-sticky"
                      style={{
                        position: "sticky", top: 73, zIndex: 5,
                        background: "hsl(var(--brand-navy) / 0.04)",
                        borderBottom: "1px solid hsl(var(--brand-navy) / 0.15)",
                        borderRight: "1px solid hsl(var(--brand-navy) / 0.06)",
                        padding: "6px 8px",
                        textAlign: c.key === "qty" || c.key === "unit" || c.key === "setup" || c.key === "pack" || c.key === "l" || c.key === "w" || c.key === "h" || c.key === "wt" ? "right" : "left",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "hsl(var(--brand-navy) / 0.6)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.label}
                      {c.hint && <span style={{ marginLeft: 4, fontStyle: "italic", fontWeight: 400, color: "hsl(var(--muted-foreground))", textTransform: "none", letterSpacing: 0, fontSize: 9 }}>{c.hint}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {renderItems.map((item, idx) => {
                  const isLast = idx === renderItems.length - 1;
                  if (item.kind === "draft") {
                    const d = item.draft;
                    return (
                      <DraftTableRow
                        key={d.tempId}
                        draft={d}
                        suppliers={md.suppliers}
                        subcategoryGroups={subcategoryGroups}
                        onUpdate={(patch) => updateDraft(d.tempId, patch)}
                        onRemove={() => removeDraft(d.tempId)}
                      />
                    );
                  }
                  const p = item.product;
                  return (
                    <ProductRows
                      key={p.id}
                      product={p}
                      isSub={item.isSub}
                      isLast={isLast}
                      catById={catById}
                      labelById={labelById}
                      mdById={mdById}
                      dmById={dmById}
                      suppliers={md.suppliers}
                      subcategoryGroups={subcategoryGroups}
                      methodGroups={methodGroups}
                      allLabels={labels}
                      details={detailsByProduct.get(p.id) ?? []}
                      decorations={decosByProduct.get(p.id) ?? []}
                      bandsByDeco={bandsByDeco}
                      onPatchProduct={(patch) => patchProduct(p.id, patch)}
                      onPatchDetail={patchDetail}
                      onRemoveDetail={removeDetail}
                      onAddDetail={(lid) => addDetail(p.id, lid)}
                      onCreateLabel={(n) => createLabelAndAdd(p.id, n)}
                      onAddDecoration={(mdId) => addDecoration(p.id, mdId)}
                      onPatchDeco={patchDeco}
                      onRemoveDeco={(dec) => setConfirmDeleteDeco(dec)}
                      onUploadDecoRef={uploadDecoRef}
                      onAddBand={addBand}
                      onPatchBand={patchBand}
                      onRemoveBand={removeBand}
                      onUploadImage={(f) => uploadProductImage(p.id, f)}
                      onDuplicate={() => duplicateProduct(p)}
                      onDelete={() => setConfirmDeleteProduct(p)}
                      onAddSubProduct={() => addSubProductDraft(p)}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </main>


        <ConfirmDialog
          open={!!confirmDeleteProduct}
          onCancel={() => setConfirmDeleteProduct(null)}
          title={`Delete ${confirmDeleteProduct?.name ?? "product"}?`}
          description={
            confirmDeleteProduct && (childrenByParent.get(confirmDeleteProduct.id)?.length ?? 0) > 0
              ? `This product has ${childrenByParent.get(confirmDeleteProduct.id)!.length} sub-product(s). Deleting will unlink them and they'll become top-level products. Continue?`
              : "The product, all its details, decorations and pricing tiers will be removed."
          }
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
// Product rows — emits all <tr> for one product block
// ────────────────────────────────────────────────────────────────────────
function ProductRows(props: {
  product: Product;
  isLast: boolean;
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
  bandsByDeco: Map<string, Band[]>;
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
    product: p, isLast, catById, labelById, mdById, dmById, suppliers,
    subcategoryGroups, methodGroups, allLabels, details, decorations, bandsByDeco,
  } = props;

  const supplier = suppliers.find((s) => s.id === p.supplier_id);
  const sub = catById.get(p.subcategory_id);
  const parent = sub?.parent_id ? catById.get(sub.parent_id) : null;

  // Build a flat row-spec list. Always at least one row (an "add decoration" row when no decos).
  type RowSpec =
    | { kind: "band"; deco: Deco; band: Band; firstOfDeco: boolean; lastOfDeco: boolean; decoSpan: number }
    | { kind: "addDeco" };

  const rowSpecs: RowSpec[] = [];
  for (const d of decorations) {
    const bs = bandsByDeco.get(d.id) ?? [];
    if (bs.length === 0) {
      rowSpecs.push({ kind: "band", deco: d, band: { id: `placeholder-${d.id}`, product_decoration_id: d.id, qty: 0, unit_cost: 0, setup_cost: 0 } as Band, firstOfDeco: true, lastOfDeco: true, decoSpan: 1 });
    } else {
      bs.forEach((b, i) => {
        rowSpecs.push({ kind: "band", deco: d, band: b, firstOfDeco: i === 0, lastOfDeco: i === bs.length - 1, decoSpan: bs.length });
      });
    }
  }
  rowSpecs.push({ kind: "addDeco" });

  const totalRows = rowSpecs.length;
  const productBorderBottom = isLast ? "none" : "2px solid hsl(var(--brand-navy) / 0.28)";
  const decoBorderBottom = "1px solid hsl(var(--brand-navy) / 0.12)";
  const cellBorder = "1px solid hsl(var(--brand-navy) / 0.06)";

  const dimsUnit = supplier?.weight_unit === "lbs" ? "in" : "cm";
  const wtUnit = supplier?.weight_unit ?? "kg";

  return (
    <>
      {rowSpecs.map((row, rIdx) => {
        const isFirstRow = rIdx === 0;
        const isLastRow = rIdx === totalRows - 1;
        const tdBase: React.CSSProperties = {
          borderRight: cellBorder,
          borderBottom: isLastRow ? productBorderBottom : cellBorder,
          padding: "2px 6px",
          verticalAlign: "top",
          background: "white",
        };

        return (
          <tr key={`${p.id}-r${rIdx}`} id={isFirstRow ? `p-${p.id}` : undefined}>
            {isFirstRow && (
              <>
                {/* IMG */}
                <td rowSpan={totalRows} style={{ ...tdBase, borderBottom: productBorderBottom, textAlign: "center", verticalAlign: "top", padding: 6 }}>
                  <ImageThumb url={p.image_url} size={64} onFile={props.onUploadImage} />
                </td>
                {/* NAME / # / DETAILS */}
                <td rowSpan={totalRows} style={{ ...tdBase, borderBottom: productBorderBottom, verticalAlign: "top", padding: "6px 8px" }}>
                  <IdentityStack
                    product={p}
                    parentName={parent?.name ?? "—"}
                    subName={sub?.name ?? "—"}
                    supplier={supplier ?? null}
                    suppliers={suppliers}
                    subcategoryGroups={subcategoryGroups}
                    details={details}
                    labelById={labelById}
                    allLabels={allLabels}
                    onPatchProduct={props.onPatchProduct}
                    onPatchDetail={props.onPatchDetail}
                    onRemoveDetail={props.onRemoveDetail}
                    onAddDetail={props.onAddDetail}
                    onCreateLabel={props.onCreateLabel}
                  />
                </td>
                {/* PACK */}
                <td rowSpan={totalRows} style={{ ...tdBase, borderBottom: productBorderBottom, textAlign: "right", verticalAlign: "top" }}>
                  <CellNum value={p.carton_pack} onCommit={(v) => props.onPatchProduct({ carton_pack: v as any })} />
                </td>
                <td rowSpan={totalRows} style={{ ...tdBase, borderBottom: productBorderBottom, textAlign: "right", verticalAlign: "top" }}>
                  <CellNum value={p.carton_length} onCommit={(v) => props.onPatchProduct({ carton_length: v as any })} />
                </td>
                <td rowSpan={totalRows} style={{ ...tdBase, borderBottom: productBorderBottom, textAlign: "right", verticalAlign: "top" }}>
                  <CellNum value={p.carton_width} onCommit={(v) => props.onPatchProduct({ carton_width: v as any })} />
                </td>
                <td rowSpan={totalRows} style={{ ...tdBase, borderBottom: productBorderBottom, textAlign: "right", verticalAlign: "top" }} title={dimsUnit}>
                  <CellNum value={p.carton_height} onCommit={(v) => props.onPatchProduct({ carton_height: v as any })} />
                </td>
                <td rowSpan={totalRows} style={{ ...tdBase, borderBottom: productBorderBottom, textAlign: "right", verticalAlign: "top" }} title={wtUnit}>
                  <CellNum value={p.carton_weight} onCommit={(v) => props.onPatchProduct({ carton_weight: v as any })} />
                </td>
                <td rowSpan={totalRows} style={{ ...tdBase, borderBottom: productBorderBottom, textAlign: "right", verticalAlign: "top" }}>

                  <LeadCell
                    min={p.production_days_min}
                    max={p.production_days_max}
                    onMin={(v) => props.onPatchProduct({ production_days_min: (v ?? 1) as any })}
                    onMax={(v) => props.onPatchProduct({ production_days_max: v as any })}
                  />
                </td>
              </>
            )}

            {row.kind === "addDeco" ? (
              <>
                <td colSpan={4} style={{ ...tdBase, padding: "4px 8px", background: "hsl(var(--brand-navy) / 0.015)" }}>
                  <AddDecorationPopover methodGroups={methodGroups} onPick={props.onAddDecoration} />
                </td>
              </>
            ) : (
              <>
                {row.firstOfDeco && (
                  <td
                    rowSpan={row.decoSpan}
                    style={{
                      ...tdBase,
                      borderBottom: row.lastOfDeco ? (isLastRow ? productBorderBottom : decoBorderBottom) : cellBorder,
                      padding: 6,
                      background: "hsl(var(--brand-navy) / 0.015)",
                    }}
                  >
                    <DecoCell
                      deco={row.deco}
                      mdById={mdById}
                      dmById={dmById}
                      methodGroups={methodGroups}
                      onPatch={(patch) => props.onPatchDeco(row.deco, patch)}
                      onUploadRef={(f) => props.onUploadDecoRef(row.deco, f)}
                      onRemove={() => props.onRemoveDeco(row.deco)}
                    />
                  </td>
                )}
                {/* QTY */}
                <td style={{ ...tdBase, borderBottom: row.lastOfDeco ? (isLastRow ? productBorderBottom : decoBorderBottom) : cellBorder, textAlign: "right" }}>
                  {row.band.id.startsWith("placeholder-") ? (
                    <span className="text-[11px] italic text-muted-foreground">—</span>
                  ) : (
                    <BandRowCell band={row.band} field="qty" onPatch={props.onPatchBand} onRemove={() => props.onRemoveBand(row.band)} />
                  )}
                  {row.lastOfDeco && !row.band.id.startsWith("placeholder-") && (
                    <button
                      onClick={() => props.onAddBand(row.deco.id)}
                      className="block w-full text-[10px] text-left mt-0.5 print-hide hover:underline"
                      style={{ color: "hsl(var(--brand-orange))" }}
                    >
                      + tier
                    </button>
                  )}
                  {row.lastOfDeco && row.band.id.startsWith("placeholder-") && (
                    <button
                      onClick={() => props.onAddBand(row.deco.id)}
                      className="block w-full text-[10px] text-left print-hide hover:underline"
                      style={{ color: "hsl(var(--brand-orange))" }}
                    >
                      + tier
                    </button>
                  )}
                </td>
                {/* UNIT */}
                <td style={{ ...tdBase, borderBottom: row.lastOfDeco ? (isLastRow ? productBorderBottom : decoBorderBottom) : cellBorder, textAlign: "right" }}>
                  {!row.band.id.startsWith("placeholder-") && (
                    <BandRowCell band={row.band} field="unit_cost" onPatch={props.onPatchBand} />
                  )}
                </td>
                {/* SETUP */}
                <td style={{ ...tdBase, borderBottom: row.lastOfDeco ? (isLastRow ? productBorderBottom : decoBorderBottom) : cellBorder, textAlign: "right" }}>
                  {!row.band.id.startsWith("placeholder-") && (
                    <BandRowCell band={row.band} field="setup_cost" onPatch={props.onPatchBand} />
                  )}
                </td>
              </>
            )}

            {isFirstRow && (
              <td rowSpan={totalRows} className="print-hide" style={{ ...tdBase, borderBottom: productBorderBottom, textAlign: "center", verticalAlign: "top", padding: 2 }}>
                <KebabMenu onDuplicate={props.onDuplicate} onDelete={props.onDelete} />
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Identity stack (col 2)
// ────────────────────────────────────────────────────────────────────────
function IdentityStack({
  product: p, parentName, subName, supplier, suppliers, subcategoryGroups,
  details, labelById, allLabels,
  onPatchProduct, onPatchDetail, onRemoveDetail, onAddDetail, onCreateLabel,
}: {
  product: Product;
  parentName: string;
  subName: string;
  supplier: { id: string; name: string; origin_id?: string | null } | null;
  suppliers: ReturnType<typeof useMasterData>["suppliers"];
  subcategoryGroups: { parent: Cat; subs: Cat[] }[];
  details: PDetail[];
  labelById: Map<string, DetailLabel>;
  allLabels: DetailLabel[];
  onPatchProduct: (patch: Partial<Product>) => void;
  onPatchDetail: (d: PDetail, v: string) => void;
  onRemoveDetail: (d: PDetail) => void;
  onAddDetail: (labelId: string) => void;
  onCreateLabel: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <FlatInput
        value={p.name}
        placeholder="Product name"
        onCommit={(v) => onPatchProduct({ name: v })}
        style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--brand-navy))" }}
      />
      <div className="flex items-center gap-1.5 text-[11px] font-mono leading-none">
        <span style={{ color: "hsl(var(--brand-navy) / 0.45)" }} title="System item number">{p.primary_item_number}</span>
        <span style={{ color: "hsl(var(--brand-navy) / 0.25)" }}>·</span>
        <FlatInput
          value={p.supplier_item_number ?? ""}
          placeholder="Sup #"
          onCommit={(v) => onPatchProduct({ supplier_item_number: v || null })}
          style={{ fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, monospace", color: "hsl(var(--brand-navy) / 0.7)", flex: 1, minWidth: 70, border: "1px dashed hsl(var(--brand-navy) / 0.18)" }}
        />
      </div>
      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
        <SupplierPill supplier={supplier} suppliers={suppliers}
          onPick={(id) => onPatchProduct({ supplier_id: id, origin_id: suppliers.find((s) => s.id === id)?.origin_id ?? p.origin_id } as any)} />
        <SubcatPill name={subName} subcategoryGroups={subcategoryGroups} onPick={(id) => onPatchProduct({ subcategory_id: id })} />
      </div>
      <div className="text-[10px] italic text-muted-foreground leading-none mt-0.5">{parentName}</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {details.map((d) => (
          <DetailChipInline
            key={d.id}
            label={labelById.get(d.detail_label_id)?.label ?? "—"}
            value={d.value}
            onCommit={(v) => onPatchDetail(d, v)}
            onRemove={() => onRemoveDetail(d)}
          />
        ))}
        <AddDetailPopover
          availableLabels={allLabels.filter((l) => !details.some((d) => d.detail_label_id === l.id))}
          onPick={onAddDetail}
          onCreateNew={onCreateLabel}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Decoration cell (col 9) — spans the deco's bands
// ────────────────────────────────────────────────────────────────────────
function DecoCell({
  deco, mdById, dmById, methodGroups, onPatch, onUploadRef, onRemove,
}: {
  deco: Deco;
  mdById: Map<string, MDetail>;
  dmById: Map<string, DMethod>;
  methodGroups: { method: DMethod | undefined; mds: MDetail[] }[];
  onPatch: (p: Partial<Deco>) => void;
  onUploadRef: (f: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 group/deco">
      <div className="flex items-start gap-1.5">
        <ImageThumb url={deco.ref_image_url} size={32} onFile={onUploadRef} />
        <div className="flex-1 min-w-0">
          <Select value={deco.method_detail_id} onValueChange={(v) => onPatch({ method_detail_id: v })}>
            <SelectTrigger className="h-7 text-[12px] px-1.5 border-transparent hover:border-input">
              <SelectValue placeholder="Method…" />
            </SelectTrigger>
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
        </div>
      </div>
      <FlatInput
        value={deco.notes ?? ""}
        placeholder="Notes"
        onCommit={(v) => onPatch({ notes: v || null })}
        style={{ fontSize: 11, color: "hsl(var(--brand-navy) / 0.7)" }}
      />
      <button
        onClick={onRemove}
        className="text-[10px] text-left opacity-0 group-hover/deco:opacity-100 print-hide hover:underline"
        style={{ color: "hsl(var(--urgent))" }}
      >
        × remove
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Inline editing primitives
// ────────────────────────────────────────────────────────────────────────
function FlatInput({
  value, onCommit, placeholder, style, mono,
}: { value: string; onCommit: (v: string) => void; placeholder?: string; style?: React.CSSProperties; mono?: boolean }) {
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
          setTimeout(() => setSaved(false), 400);
        }
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
      className="cell-input"
      style={{
        width: "100%", border: "1px solid transparent", background: saved ? "hsl(140 50% 60% / 0.18)" : "transparent",
        outline: "none", padding: "3px 6px", height: 26, borderRadius: 3, minWidth: 0,
        fontFamily: mono ? "ui-monospace, SFMono-Regular, monospace" : undefined,
        transition: "background 200ms, border-color 100ms",
        ...style,
      }}
    />
  );
}

function CellNum({ value, onCommit }: { value: number | null | undefined; onCommit: (v: number | null) => void }) {
  const [local, setLocal] = useState<string>(value == null ? "" : String(value));
  const [saved, setSaved] = useState(false);
  useEffect(() => setLocal(value == null ? "" : String(value)), [value]);
  return (
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
          setTimeout(() => setSaved(false), 400);
        }
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
      className="cell-input tabular"
      style={{
        width: "100%", border: "1px solid transparent", background: saved ? "hsl(140 50% 60% / 0.18)" : "transparent",
        outline: "none", padding: "3px 6px", height: 26, borderRadius: 3,
        textAlign: "right", fontVariantNumeric: "tabular-nums",
        transition: "background 200ms, border-color 100ms",
      }}
    />
  );
}

function LeadCell({ min, max, onMin, onMax }: { min: number | null; max: number | null; onMin: (v: number | null) => void; onMax: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-0.5 justify-end">
      <div style={{ width: 36 }}><CellNum value={min} onCommit={onMin} /></div>
      <span className="text-[10px] text-muted-foreground">–</span>
      <div style={{ width: 36 }}><CellNum value={max} onCommit={onMax} /></div>
    </div>
  );
}

function BandRowCell({ band, field, onPatch, onRemove }: {
  band: Band;
  field: "qty" | "unit_cost" | "setup_cost";
  onPatch: (b: Band, p: Partial<Band>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="relative group/band">
      <CellNum
        value={band[field]}
        onCommit={(v) => onPatch(band, { [field]: (v ?? 0) as any } as any)}
      />
      {field === "qty" && onRemove && (
        <button
          onClick={onRemove}
          aria-label="Remove tier"
          className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover/band:opacity-100 text-muted-foreground hover:text-destructive print-hide"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Misc cell renderers
// ────────────────────────────────────────────────────────────────────────
function ImageThumb({ url, size, onFile }: { url: string | null; size: number; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="shrink-0 rounded border overflow-hidden flex items-center justify-center hover:bg-muted/30 mx-auto"
        style={{ width: size, height: size, borderColor: "hsl(var(--brand-navy) / 0.18)" }}
      >
        {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />}
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
        className="h-6 w-auto min-w-0 px-2 rounded-full border-0 text-[10px] font-semibold gap-0.5 focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.3)]"
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
function SubcatPill({ name, subcategoryGroups, onPick }: {
  name: string;
  subcategoryGroups: { parent: Cat; subs: Cat[] }[];
  onPick: (id: string) => void;
}) {
  return (
    <Select value="" onValueChange={onPick}>
      <SelectTrigger
        className="h-6 w-auto min-w-0 px-2 rounded-full border text-[10px] font-medium gap-0.5 bg-background focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.3)]"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.18)", color: "hsl(var(--brand-navy))" }}
      >
        <span className="truncate max-w-[120px]">{name}</span>
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
        <button className="p-1 rounded hover:bg-muted/50" aria-label="More">
          <MoreVertical className="h-3.5 w-3.5" />
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

function DetailChipInline({
  label, value, onCommit, onRemove,
}: { label: string; value: string; onCommit: (v: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <span
      className="group inline-flex items-center gap-1 rounded px-1.5 h-5 text-[10px] leading-none"
      style={{ background: "hsl(var(--brand-navy) / 0.05)", color: "hsl(var(--brand-navy) / 0.8)" }}
    >
      <span style={{ fontWeight: 600 }}>{label}:</span>
      {editing ? (
        <input
          autoFocus
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => { setEditing(false); if (local !== value) onCommit(local); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); if (e.key === "Escape") { setLocal(value); setEditing(false); } }}
          className="bg-transparent outline-none border-b border-dotted"
          style={{ width: Math.max(40, local.length * 6 + 10), fontSize: 10 }}
        />
      ) : (
        <button onClick={() => setEditing(true)} className="hover:underline" style={{ fontWeight: 400 }}>
          {value || <span className="italic opacity-60">empty</span>}
        </button>
      )}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 hover:text-destructive print-hide"
        aria-label="Remove"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
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
          className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded text-[10px] font-medium border border-dashed hover:bg-muted/30 print-hide"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.20)", color: "hsl(var(--brand-orange))" }}
        >
          <Plus className="h-2.5 w-2.5" /> detail
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
          className="inline-flex items-center gap-1 px-2 h-6 rounded text-[11px] font-medium border border-dashed hover:bg-muted/30 print-hide"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.20)", color: "hsl(var(--brand-orange))" }}
        >
          <Plus className="h-3 w-3" /> Add decoration
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

// ────────────────────────────────────────────────────────────────────────
// Inline draft row — pre-empty new product at top of table.
// Persists silently once Name + Supplier + Subcategory are all populated.
// ────────────────────────────────────────────────────────────────────────
function DraftTableRow({
  draft, suppliers, subcategoryGroups, onUpdate, onRemove,
}: {
  draft: { tempId: string; name: string; supplier_id: string; subcategory_id: string; supplier_item_number: string };
  suppliers: ReturnType<typeof useMasterData>["suppliers"];
  subcategoryGroups: { parent: Cat; subs: Cat[] }[];
  onUpdate: (patch: Partial<{ name: string; supplier_id: string; subcategory_id: string; supplier_item_number: string }>) => void;
  onRemove: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  const supplier = suppliers.find((s) => s.id === draft.supplier_id) ?? null;
  const sub = subcategoryGroups.flatMap((g) => g.subs).find((s) => s.id === draft.subcategory_id);
  const supplierColorStyle = supplier ? supplierColor(supplier.name) : "hsl(var(--muted))";
  const tdBase: React.CSSProperties = {
    borderRight: "1px solid hsl(var(--brand-navy) / 0.06)",
    borderBottom: "2px solid hsl(var(--brand-orange) / 0.35)",
    padding: "6px 8px",
    verticalAlign: "top",
    background: "hsl(var(--brand-orange) / 0.04)",
  };
  return (
    <tr style={{ outline: "2px solid hsl(var(--brand-orange))", outlineOffset: -2 }}>
      <td style={{ ...tdBase, padding: 6, textAlign: "center" }}>
        <div className="w-16 h-16 rounded border flex items-center justify-center mx-auto" style={{ borderColor: "hsl(var(--brand-orange) / 0.4)" }}>
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </td>
      <td style={tdBase}>
        <div className="flex flex-col gap-1 min-w-0">
          <input
            ref={nameRef}
            value={draft.name}
            placeholder="Product name"
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="w-full h-7 px-2 rounded border bg-white text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-orange)/0.4)]"
            style={{ color: "hsl(var(--brand-navy))", borderColor: "hsl(var(--brand-orange) / 0.45)" }}
          />
          <div className="flex items-center gap-1.5 text-[11px] font-mono leading-none">
            <span style={{ color: "hsl(var(--brand-navy) / 0.35)" }} title="Item number — generated on save">—</span>
            <span style={{ color: "hsl(var(--brand-navy) / 0.25)" }}>·</span>
            <input
              value={draft.supplier_item_number}
              placeholder="Sup #"
              onChange={(e) => onUpdate({ supplier_item_number: e.target.value })}
              className="flex-1 h-6 px-1.5 rounded border bg-white text-[11px] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-orange)/0.4)]"
              style={{ borderColor: "hsl(var(--brand-orange) / 0.3)", minWidth: 60, fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
            />
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <Select value={draft.supplier_id} onValueChange={(v) => onUpdate({ supplier_id: v })}>
              <SelectTrigger
                className="h-6 w-auto min-w-0 px-2 rounded-full border-0 text-[10px] font-semibold gap-0.5 focus:ring-2 focus:ring-[hsl(var(--brand-orange)/0.45)]"
                style={{ background: supplier ? supplierColorStyle : "hsl(var(--brand-navy) / 0.10)", color: supplier ? "white" : "hsl(var(--brand-navy) / 0.6)" }}
              >
                <SelectValue placeholder="Choose supplier" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {[...suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={draft.subcategory_id} onValueChange={(v) => onUpdate({ subcategory_id: v })}>
              <SelectTrigger
                className="h-6 w-auto min-w-0 px-2 rounded-full border text-[10px] font-medium gap-0.5 bg-white focus:ring-2 focus:ring-[hsl(var(--brand-orange)/0.45)]"
                style={{ borderColor: "hsl(var(--brand-orange) / 0.4)", color: sub ? "hsl(var(--brand-navy))" : "hsl(var(--brand-navy) / 0.5)" }}
              >
                <span className="truncate max-w-[120px]">{sub?.name ?? "Choose subcategory"}</span>
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
          </div>
        </div>
      </td>
      {/* Empty spec cells */}
      <td style={tdBase}>&nbsp;</td>
      <td style={tdBase}>&nbsp;</td>
      <td style={tdBase}>&nbsp;</td>
      <td style={tdBase}>&nbsp;</td>
      <td style={tdBase}>&nbsp;</td>
      <td style={tdBase}>&nbsp;</td>
      <td colSpan={4} style={{ ...tdBase, color: "hsl(var(--muted-foreground))", fontStyle: "italic", fontSize: 11 }}>
        Fill Name + Supplier + Subcategory to save · decorations and pricing can be added after.
      </td>
      <td style={{ ...tdBase, textAlign: "center", padding: 2 }} className="print-hide">
        <button onClick={onRemove} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Discard draft">
          <X className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

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
// Styles
// ────────────────────────────────────────────────────────────────────────
function PrintStyles() {
  return (
    <style>{`
      .products-table .cell-input:hover { border-color: hsl(var(--brand-navy) / 0.18) !important; }
      .products-table .cell-input:focus { border-color: hsl(var(--brand-navy) / 0.6) !important; background: white !important; }
      .products-table tbody tr:hover td { background: hsl(var(--brand-navy) / 0.02); }
      @media print {
        @page { margin: 10mm; size: A4 landscape; }
        body { background: white !important; }
        .print-hide, [data-sidebar], header.sticky button { display: none !important; }
        .sticky, .th-sticky { position: static !important; }
        .products-table { font-size: 10px !important; }
        .products-table input, .products-table select, .products-table button {
          color: black !important; background: transparent !important; border-color: transparent !important;
          padding: 0 !important; height: auto !important;
        }
        .products-table tbody tr { break-inside: avoid; page-break-inside: avoid; }
        .products-table td { border-color: rgba(0,0,0,0.15) !important; }
      }
    `}</style>
  );
}
