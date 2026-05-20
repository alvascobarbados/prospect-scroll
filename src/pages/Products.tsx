/**
 * Products v3 — wide-table layout per locked design.
 *
 * Single dense table. One row per (product × decoration) pair.
 * Multi-decoration continuation rows are tinted cream.
 *
 * Brand palette is applied inline (page-specific, intentionally).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Search, MoreVertical, Trash2, Image as ImageIcon,
  Tag, X, Copy as CopyIcon, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { EditableCell } from "@/components/leads/SimpleMasterPage";
import { supabase } from "@/integrations/supabase/client";
import { useMasterData } from "@/hooks/useMasterData";
import { originLetterFromCode } from "@/lib/originLetter";
import {
  composePrimaryItemNumber, nextSequenceFor, parsePrimaryItemNumber,
} from "@/lib/productItemNumber";

// ── Palette ───────────────────────────────────────────────────────────
const C = {
  pageBg: "#FAF6F0",
  card: "#ffffff",
  border: "#E6DDC9",
  divider: "#F1ECE0",
  continTint: "#FDF9F2",
  continHover: "#F9F3E9",
  navy: "#1A2942",
  tan: "#8B7B65",
  tertiary: "#B7A98D",
  orange: "#E97817",
  supplierBg: "#F2E5D2",
  supplierFg: "#6B4F2A",
  catBg: "#E8EDF5",
  catFg: "#5B6B85",
  subBg: "#F0E8DE",
  subFg: "#7A5C3F",
  rowHover: "#FDFAF5",
} as const;

// ── Types ─────────────────────────────────────────────────────────────
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
interface Decoration {
  id: string; product_id: string; method_detail_id: string; sort_order: number;
  ref_image_url: string | null;
}
interface Band {
  id: string; product_decoration_id: string; qty: number; unit_cost: number; setup_cost: number;
}
interface Cat { id: string; parent_id: string | null; code: string | null; name: string }
interface MDetail { id: string; decoration_method_id: string; detail: string }
interface DMethod { id: string; name: string }
interface DetailLabel { id: string; label: string; sort_order: number }
interface ProductDetail {
  id: string; product_id: string; detail_label_id: string; value: string; sort_order: number;
}

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const intOrNull = (raw: string): number | null => {
  const t = raw.trim(); if (!t) return null;
  const n = parseInt(t, 10); return Number.isFinite(n) ? n : null;
};
const numOrNull = (raw: string): number | null => {
  const t = raw.trim(); if (!t) return null;
  const n = Number(t); return Number.isFinite(n) ? n : null;
};

const QTY_SEED = [100, 250, 500, 1000];

interface Draft {
  subcategoryId: string;
  supplierId: string;
  name: string;
  sequence: string;
}
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
        supabase.from("products").select("*").order("created_at", { ascending: false }),
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
      setProducts((p.data ?? []) as any as Product[]);
      setDecorations((d.data ?? []) as any as Decoration[]);
      setBands((b.data ?? []) as any as Band[]);
      setCats((c.data ?? []) as Cat[]);
      setMethodDetails((mdl.data ?? []) as MDetail[]);
      setDecoMethods((dm.data ?? []) as DMethod[]);
      setLabels((dl.data ?? []) as DetailLabel[]);
      setProductDetails((pd.data ?? []) as ProductDetail[]);
    };
    load();
    const ch = supabase.channel("products-v3")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_decorations" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_decoration_bands" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "detail_labels" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_details" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  // ── Lookup maps ───────────────────────────────────────────────────────
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const mdById = useMemo(() => new Map(methodDetails.map((m) => [m.id, m])), [methodDetails]);
  const dmById = useMemo(() => new Map(decoMethods.map((m) => [m.id, m])), [decoMethods]);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  const decosByProduct = useMemo(() => {
    const m = new Map<string, Decoration[]>();
    for (const d of [...decorations].sort((a, b) => a.sort_order - b.sort_order)) {
      const arr = m.get(d.product_id) ?? []; arr.push(d); m.set(d.product_id, arr);
    }
    return m;
  }, [decorations]);
  const bandsByDeco = useMemo(() => {
    const m = new Map<string, Band[]>();
    for (const b of [...bands].sort((a, b) => a.qty - b.qty)) {
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

  const supplierById = useMemo(
    () => new Map(md.suppliers.map((s) => [s.id, s])), [md.suppliers],
  );

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

  const decorationGroups = useMemo(() => {
    const parents = [...decoMethods].sort((a, b) => a.name.localeCompare(b.name));
    return parents.map((p) => ({
      parent: p,
      details: methodDetails
        .filter((m) => m.decoration_method_id === p.id)
        .sort((a, b) => a.detail.localeCompare(b.detail)),
    })).filter((g) => g.details.length > 0);
  }, [decoMethods, methodDetails]);

  // ── Filter ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return products;
    return products.filter((p) => {
      const sup = supplierById.get(p.supplier_id);
      const sub = catById.get(p.subcategory_id);
      const parent = sub?.parent_id ? catById.get(sub.parent_id) : null;
      const hay = [
        p.name, p.supplier_item_number, p.primary_item_number,
        sup?.name, sub?.name, parent?.name,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(t);
    });
  }, [products, q, supplierById, catById]);

  // ── Mutations ─────────────────────────────────────────────────────────
  const updateProduct = async (id: string, patch: Partial<Product>) => {
    setProducts((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("products").update(patch as any).eq("id", id);
    if (error) toast.error(`Save failed: ${error.message}`);
  };

  const changeSupplier = async (product: Product, newSupplierId: string) => {
    const newSup = supplierById.get(newSupplierId);
    if (!newSup) return;
    if (!newSup.origin_id) {
      toast.error("Supplier must have an origin assigned. Set it on the Suppliers page.");
      return;
    }
    await updateProduct(product.id, {
      supplier_id: newSupplierId,
      origin_id: newSup.origin_id,
    });
  };

  const changeSubcategory = async (product: Product, newSubId: string) => {
    await updateProduct(product.id, { subcategory_id: newSubId });
  };

  const addDecoration = async (productId: string) => {
    const first = methodDetails[0];
    if (!first) { toast.error("Add a Decoration Method first."); return; }
    const existing = decorations.filter((d) => d.product_id === productId);
    const used = new Set(existing.map((d) => d.method_detail_id));
    const pick = methodDetails.find((m) => !used.has(m.id)) ?? first;
    if (used.has(pick.id)) {
      toast.error("All decoration methods already assigned to this product.");
      return;
    }
    const ins = await supabase.from("product_decorations").insert({
      product_id: productId, method_detail_id: pick.id, sort_order: existing.length,
    } as any).select("id").single();
    if (ins.error) { toast.error(`Add failed: ${ins.error.message}`); return; }
    const decoId = (ins.data as { id: string }).id;
    const { error: bErr } = await supabase.from("product_decoration_bands").insert(
      QTY_SEED.map((qty) => ({
        product_decoration_id: decoId, qty, unit_cost: 0, setup_cost: 0,
      })) as any,
    );
    if (bErr) toast.error(`Seed bands failed: ${bErr.message}`);
  };

  const updateDecoration = async (id: string, patch: Partial<Decoration>) => {
    const { error } = await supabase.from("product_decorations").update(patch as any).eq("id", id);
    if (error) toast.error(`Save failed: ${error.message}`);
  };

  const deleteDecoration = async (id: string) => {
    const { error } = await supabase.from("product_decorations").delete().eq("id", id);
    if (error) toast.error(`Delete failed: ${error.message}`);
  };

  const updateBand = async (id: string, patch: Partial<Band>) => {
    const { error } = await supabase.from("product_decoration_bands").update(patch as any).eq("id", id);
    if (error) toast.error(`Save failed: ${error.message}`);
  };
  const addBand = async (decorationId: string) => {
    const existing = bands.filter((b) => b.product_decoration_id === decorationId);
    const used = new Set(existing.map((b) => b.qty));
    const candidates = [100, 250, 500, 1000, 2500, 5000];
    const nextQty = candidates.find((q) => !used.has(q))
      ?? (existing.length ? Math.max(...existing.map((b) => b.qty)) + 1 : 1);
    const { error } = await supabase.from("product_decoration_bands").insert({
      product_decoration_id: decorationId, qty: nextQty, unit_cost: 0, setup_cost: 0,
    } as any);
    if (error) toast.error(`Add failed: ${error.message}`);
  };
  const deleteBand = async (id: string) => {
    const { error } = await supabase.from("product_decoration_bands").delete().eq("id", id);
    if (error) toast.error(`Delete failed: ${error.message}`);
  };

  const handleDeleteProduct = async () => {
    if (!confirmDelProduct) return;
    const { error } = await supabase.from("products").delete().eq("id", confirmDelProduct.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else toast.success("Product deleted");
    setConfirmDelProduct(null);
  };

  // ── Detail labels / product_details ───────────────────────────────────
  const addProductDetail = async (productId: string, labelId: string) => {
    const existing = productDetails.filter((d) => d.product_id === productId);
    if (existing.some((d) => d.detail_label_id === labelId)) {
      toast.error("This detail is already attached.");
      return;
    }
    const maxSort = existing.reduce((m, d) => Math.max(m, d.sort_order), 0);
    const { error } = await supabase.from("product_details").insert({
      product_id: productId, detail_label_id: labelId, value: "", sort_order: maxSort + 10,
    } as any);
    if (error) toast.error(`Add failed: ${error.message}`);
  };
  const updateProductDetail = async (id: string, value: string) => {
    const { error } = await supabase.from("product_details").update({ value } as any).eq("id", id);
    if (error) { toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };
  const deleteProductDetail = async (id: string) => {
    const { error } = await supabase.from("product_details").delete().eq("id", id);
    if (error) toast.error(`Delete failed: ${error.message}`);
  };
  const createDetailLabel = async (name: string): Promise<DetailLabel | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (labels.some((l) => l.label.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Label already exists");
      return null;
    }
    const maxSort = labels.reduce((m, l) => Math.max(m, l.sort_order), 0);
    const { data, error } = await supabase.from("detail_labels").insert({
      label: trimmed, sort_order: maxSort + 10,
    } as any).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return null; }
    return data as DetailLabel;
  };

  // ── Image upload helpers ──────────────────────────────────────────────
  const uploadImage = async (bucket: "product-images" | "decoration-refs", file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (error) { toast.error(`Upload failed: ${error.message}`); return null; }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  // ── Draft (Add Product) ───────────────────────────────────────────────
  const existingItemNumbers = useMemo(() => products.map((p) => p.primary_item_number), [products]);
  const draftSupplier = draft ? supplierById.get(draft.supplierId) : null;
  const draftOrigin = draftSupplier?.origin_id ? md.origins.find((o) => o.id === draftSupplier.origin_id) : null;
  const draftOriginLetter = originLetterFromCode(draftOrigin?.code);
  const draftSubcategory = draft ? catById.get(draft.subcategoryId) : null;
  const draftSubCode = draftSubcategory?.code ?? null;

  useEffect(() => {
    if (!draft || draft.sequence) return;
    if (!draftSubCode || !draftOriginLetter) return;
    const filteredNums = existingItemNumbers.filter((n) => {
      const p = parsePrimaryItemNumber(n);
      return !!p && p.subcategoryCode === draftSubCode && p.originLetter === draftOriginLetter;
    });
    const next = nextSequenceFor(draftSubCode, filteredNums);
    setDraft((d) => (d ? { ...d, sequence: next } : d));
  }, [draft, draftSubCode, draftOriginLetter, existingItemNumbers]);

  const draftItemNumber = draft && draftSubCode && draftOriginLetter && draft.sequence
    ? composePrimaryItemNumber(draftSubCode, draft.sequence, draftOriginLetter) : null;

  const savingRef = useRef(false);
  const saveDraft = async () => {
    if (!draft || savingRef.current) return;
    if (!draftItemNumber || !draftSupplier || !draft.name.trim()) return;
    if (products.some((p) => p.primary_item_number === draftItemNumber)) {
      toast.error(`Item number ${draftItemNumber} already in use.`); return;
    }
    savingRef.current = true;
    const { error } = await supabase.from("products").insert({
      primary_item_number: draftItemNumber,
      name: draft.name.trim(),
      subcategory_id: draft.subcategoryId,
      origin_id: draftSupplier.origin_id!,
      supplier_id: draftSupplier.id,
      production_days_min: 1,
    } as any);
    savingRef.current = false;
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    toast.success(`Created ${draftItemNumber}`);
    setDraft(null);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: C.pageBg }}>
        {/* Header */}
        <header className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: `${C.pageBg}EE`, borderColor: C.border }}>
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-3 pb-3 flex items-center gap-3">
            <button onClick={() => navigate("/")} aria-label="Back"
              className="p-2 -ml-2 rounded-full hover:bg-black/5">
              <ArrowLeft className="h-5 w-5" style={{ color: C.navy }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-medium"
                style={{ color: C.tan, letterSpacing: "0.1em" }}>
                MASTER DATA
              </div>
              <h1 className="text-[20px] leading-tight tracking-tight truncate"
                style={{ color: C.navy, fontWeight: 500 }}>
                Products <span style={{ color: C.tertiary, fontWeight: 400 }}>· {products.length}</span>
              </h1>
            </div>
            <button onClick={() => setDraft(EMPTY_DRAFT)} disabled={!!draft}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: C.orange, color: "white", minHeight: 40 }}>
              <Plus className="h-4 w-4" /> Add Product
            </button>
          </div>
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: C.tan }} />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search products, supplier item #, subcategory…"
                className="w-full rounded-xl pl-9 pr-3 py-2.5 text-[14px] focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: C.pageBg, border: `1px solid ${C.border}`,
                  color: C.navy, minHeight: 44,
                }} />
            </div>
          </div>
        </header>

        {/* Table */}
        <main className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-16 pt-4">
          <div className="rounded-2xl overflow-x-auto"
            style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
            <table className="w-full text-[11px] border-collapse"
              style={{ minWidth: 1170, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 116 }} /><col style={{ width: 116 }} /><col style={{ width: 46 }} />
                <col style={{ width: 148 }} /><col style={{ width: 230 }} /><col style={{ width: 30 }} />
                <col style={{ width: 76 }} /><col style={{ width: 40 }} /><col style={{ width: 52 }} />
                <col style={{ width: 134 }} /><col style={{ width: 142 }} /><col style={{ width: 18 }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.pageBg }}>
                  <Th>Supplier</Th>
                  <Th>Category</Th>
                  <Th>Img</Th>
                  <Th>Product</Th>
                  <Th>Description</Th>
                  <Th align="center">Pack</Th>
                  <Th>Carton</Th>
                  <Th>Wt</Th>
                  <Th>Lead</Th>
                  <Th>Decoration</Th>
                  <Th>
                    Tier pricing <span style={{ color: C.tertiary, fontWeight: 400 }}>(USD$)</span>
                  </Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {draft && (
                  <DraftRow
                    draft={draft}
                    subcategoryGroups={subcategoryGroups}
                    supplierOptions={supplierOptions as any}
                    itemNumber={draftItemNumber}
                    onChange={(d) => setDraft(d)}
                    onSave={saveDraft}
                    onCancel={() => setDraft(null)}
                  />
                )}
                {filtered.map((p) => {
                  const decos = decosByProduct.get(p.id) ?? [];
                  const rows = decos.length > 0 ? decos : [null];
                  return rows.map((deco, i) => (
                    <ProductRow
                      key={p.id + ":" + (deco?.id ?? "none") + ":" + i}
                      product={p}
                      decoration={deco}
                      isPrimary={i === 0}
                      decoCount={decos.length}
                      bands={deco ? (bandsByDeco.get(deco.id) ?? []) : []}
                      details={detailsByProduct.get(p.id) ?? []}
                      supplier={supplierById.get(p.supplier_id)}
                      subcategory={catById.get(p.subcategory_id)}
                      parentCat={(() => {
                        const s = catById.get(p.subcategory_id);
                        return s?.parent_id ? catById.get(s.parent_id) : undefined;
                      })()}
                      mdById={mdById}
                      dmById={dmById}
                      labels={labels}
                      labelById={labelById}
                      subcategoryGroups={subcategoryGroups}
                      supplierOptions={supplierOptions as any}
                      decorationGroups={decorationGroups}
                      C={C}
                      onChangeSupplier={(id) => changeSupplier(p, id)}
                      onChangeSubcategory={(id) => changeSubcategory(p, id)}
                      onChangeDecoration={(decoId, mid) => updateDecoration(decoId, { method_detail_id: mid })}
                      onUpdateProduct={(patch) => updateProduct(p.id, patch)}
                      onUpdateBand={updateBand}
                      onAddBand={() => deco && addBand(deco.id)}
                      onDeleteBand={deleteBand}
                      onAddDecoration={() => addDecoration(p.id)}
                      onDeleteDecoration={() => deco && deleteDecoration(deco.id)}
                      onDeleteProduct={() => setConfirmDelProduct(p)}
                      onAddDetail={(labelId) => addProductDetail(p.id, labelId)}
                      onUpdateDetail={updateProductDetail}
                      onDeleteDetail={deleteProductDetail}
                      onCreateLabel={createDetailLabel}
                      onUploadProductImage={async (file) => {
                        const url = await uploadImage("product-images", file);
                        if (url) await updateProduct(p.id, { image_url: url });
                      }}
                      onUploadDecorationRef={async (decoId, file) => {
                        const url = await uploadImage("decoration-refs", file);
                        if (url) await updateDecoration(decoId, { ref_image_url: url });
                      }}
                    />
                  ));
                })}
                {filtered.length === 0 && !draft && (
                  <tr>
                    <td colSpan={12} className="text-sm italic px-4 py-16 text-center"
                      style={{ color: C.tan }}>
                      {q ? "No matches." : "No products yet. Click + Add Product to start."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        <ConfirmDialog
          open={!!confirmDelProduct}
          onCancel={() => setConfirmDelProduct(null)}
          title={confirmDelProduct ? `Delete ${confirmDelProduct.name}?` : ""}
          description="This product, all decorations, bands, and details will be deleted. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteProduct}
        />
      </div>
    </DesktopAppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

const Th = ({ children, align }: { children?: React.ReactNode; align?: "center" | "right" }) => (
  <th
    className="text-[9px] uppercase font-semibold px-2 py-2.5"
    style={{
      color: C.tan, letterSpacing: "0.08em",
      textAlign: align ?? "left",
    }}
  >
    {children}
  </th>
);

interface ProductRowProps {
  product: Product;
  decoration: Decoration | null;
  isPrimary: boolean;
  decoCount: number;
  bands: Band[];
  details: ProductDetail[];
  supplier: any;
  subcategory: Cat | undefined;
  parentCat: Cat | undefined;
  mdById: Map<string, MDetail>;
  dmById: Map<string, DMethod>;
  labels: DetailLabel[];
  labelById: Map<string, DetailLabel>;
  subcategoryGroups: { parent: Cat; subs: Cat[] }[];
  supplierOptions: { id: string; name: string; origin_id?: string | null }[];
  decorationGroups: { parent: DMethod; details: MDetail[] }[];
  C: typeof C;
  onChangeSupplier: (id: string) => void;
  onChangeSubcategory: (id: string) => void;
  onChangeDecoration: (decoId: string, mid: string) => void;
  onUpdateProduct: (patch: Partial<Product>) => Promise<void>;
  onUpdateBand: (id: string, patch: Partial<Band>) => Promise<void>;
  onAddBand: () => void;
  onDeleteBand: (id: string) => void;
  onAddDecoration: () => void;
  onDeleteDecoration: () => void;
  onDeleteProduct: () => void;
  onAddDetail: (labelId: string) => void;
  onUpdateDetail: (id: string, value: string) => Promise<boolean>;
  onDeleteDetail: (id: string) => void;
  onCreateLabel: (name: string) => Promise<DetailLabel | null>;
  onUploadProductImage: (file: File) => Promise<void>;
  onUploadDecorationRef: (decoId: string, file: File) => Promise<void>;
}

const ProductRow = (p: ProductRowProps) => {
  const {
    product, decoration, isPrimary, bands, details, supplier, subcategory, parentCat,
    mdById, dmById, labels, labelById, subcategoryGroups, supplierOptions, decorationGroups,
  } = p;

  const bg = isPrimary ? "transparent" : C.continTint;
  const cellPad = "px-2 py-2";
  const weightUnit = supplier?.weight_unit ?? "kg";
  const dimUnit = weightUnit === "lbs" ? "in" : "cm";

  const leadDisplay = (() => {
    const min = product.production_days_min;
    const max = product.production_days_max;
    if (max == null || max === min) return String(min);
    return `${min}\u2013${max}`;
  })();

  return (
    <tr style={{
      backgroundColor: bg,
      borderBottom: `1px solid ${C.divider}`,
    }}>
      {/* 1. Supplier */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 10 }}>
        {isPrimary ? (
          <Select value={product.supplier_id} onValueChange={p.onChangeSupplier}>
            <SelectTrigger className="border-0 p-0 h-auto bg-transparent focus:ring-0 [&>svg]:hidden">
              <Pill bg={C.supplierBg} fg={C.supplierFg}>{supplier?.name ?? "—"}</Pill>
            </SelectTrigger>
            <SelectContent>
              {supplierOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </td>

      {/* 2. Category */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 10 }}>
        {isPrimary ? (
          <Select value={product.subcategory_id} onValueChange={p.onChangeSubcategory}>
            <SelectTrigger className="border-0 p-0 h-auto bg-transparent focus:ring-0 [&>svg]:hidden">
              <div className="flex flex-col items-start gap-[2px]">
                <Pill bg={C.catBg} fg={C.catFg}>{parentCat?.name ?? "—"}</Pill>
                <Pill bg={C.subBg} fg={C.subFg}>{subcategory?.name ?? "—"}</Pill>
              </div>
            </SelectTrigger>
            <SelectContent>
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
        ) : null}
      </td>

      {/* 3. Image */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 8 }}>
        {isPrimary ? (
          <ImageThumb
            url={product.image_url}
            size={46}
            onPick={p.onUploadProductImage}
          />
        ) : (
          <div style={{
            width: 46, height: 46, borderRadius: 5,
            backgroundColor: C.divider,
            borderLeft: `2px solid ${C.border}`,
          }} />
        )}
      </td>

      {/* 4. Product */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 8 }}>
        {isPrimary && (
          <div className="flex flex-col gap-[2px]">
            <InlineEditText
              value={product.name}
              onSave={(v) => p.onUpdateProduct({ name: v })}
              fontSize={13}
              weight={500}
              color={C.navy}
            />
            <div style={{ fontSize: 10, color: C.tan, fontFamily: "ui-monospace,monospace" }}>
              <InlineEditText
                value={product.supplier_item_number ?? ""}
                placeholder="—"
                onSave={(v) => p.onUpdateProduct({ supplier_item_number: v || null })}
                fontSize={10}
                color={C.tan}
              />
            </div>
            <div style={{ fontSize: 9, color: C.tertiary, fontStyle: "italic" }}>
              Updated {formatDistanceToNow(new Date(product.updated_at), { addSuffix: false })} ago
            </div>
          </div>
        )}
      </td>

      {/* 5. Description (details list) */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 8 }}>
        {isPrimary && (
          <div className="flex flex-col gap-[3px]">
            {details.map((d) => {
              const label = labelById.get(d.detail_label_id);
              return (
                <div key={d.id} className="grid gap-2 group items-start"
                  style={{ gridTemplateColumns: "72px 1fr 14px" }}>
                  <div style={{ fontSize: 10, color: C.tan }}>{label?.label ?? "—"}</div>
                  <div style={{ fontSize: 11, color: C.navy }}>
                    <InlineEditText
                      value={d.value}
                      placeholder="…"
                      onSave={async (v) => { await p.onUpdateDetail(d.id, v); }}
                      fontSize={11}
                      color={C.navy}
                    />
                  </div>
                  <button onClick={() => p.onDeleteDetail(d.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove detail">
                    <X className="h-3 w-3" style={{ color: C.tan }} />
                  </button>
                </div>
              );
            })}
            <AddDetailPopover
              labels={labels}
              attached={new Set(details.map((d) => d.detail_label_id))}
              onPick={p.onAddDetail}
              onCreate={p.onCreateLabel}
            />
          </div>
        )}
      </td>

      {/* 6. Pack */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 10, textAlign: "center" }}>
        {isPrimary && (
          <InlineEditText
            value={product.carton_pack?.toString() ?? ""}
            placeholder="—"
            onSave={(v) => p.onUpdateProduct({ carton_pack: intOrNull(v) })}
            fontSize={11}
            color={C.navy}
            tabular
          />
        )}
      </td>

      {/* 7. Carton */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 8 }}>
        {isPrimary && (
          <CartonCell
            l={product.carton_length} w={product.carton_width} h={product.carton_height}
            unit={dimUnit}
            onSave={(patch) => p.onUpdateProduct(patch)}
          />
        )}
      </td>

      {/* 8. Wt */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 8 }}>
        {isPrimary && (
          <div className="flex flex-col items-start">
            <InlineEditText
              value={product.carton_weight?.toString() ?? ""}
              placeholder="—"
              onSave={(v) => p.onUpdateProduct({ carton_weight: numOrNull(v) })}
              fontSize={11}
              color={C.navy}
              tabular
            />
            <div style={{ fontSize: 9, color: C.tan }}>{weightUnit}</div>
          </div>
        )}
      </td>

      {/* 9. Lead */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 8 }}>
        {isPrimary && (
          <LeadCell
            min={product.production_days_min}
            max={product.production_days_max}
            display={leadDisplay}
            onSave={(min, max) => p.onUpdateProduct({
              production_days_min: min,
              production_days_max: max,
            })}
          />
        )}
      </td>

      {/* 10. Decoration */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 8 }}>
        {decoration ? (
          <div className="flex items-center gap-2">
            <ImageThumb
              url={decoration.ref_image_url}
              size={32}
              radius={4}
              onPick={(file) => p.onUploadDecorationRef(decoration.id, file)}
            />
            <Select
              value={decoration.method_detail_id}
              onValueChange={(v) => p.onChangeDecoration(decoration.id, v)}
            >
              <SelectTrigger className="border-0 p-0 h-auto bg-transparent focus:ring-0 [&>svg]:hidden text-left">
                <span style={{ fontSize: 11, color: C.navy }}>
                  {mdById.get(decoration.method_detail_id)?.detail ?? "—"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {decorationGroups.map((g) => (
                  <SelectGroup key={g.parent.id}>
                    <SelectLabel>{g.parent.name}</SelectLabel>
                    {g.details.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.detail}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          isPrimary && (
            <button onClick={p.onAddDecoration}
              className="text-[10px] underline-offset-2 hover:underline"
              style={{ color: C.tan }}>
              + Add decoration
            </button>
          )
        )}
      </td>

      {/* 11. Tier pricing */}
      <td className={cellPad} style={{ verticalAlign: "top", paddingTop: 8 }}>
        {decoration && (
          <div className="rounded" style={{ border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div className="grid"
              style={{
                gridTemplateColumns: "1fr 1fr 1fr",
                background: C.pageBg,
                fontSize: 9, textTransform: "uppercase", color: C.tan,
                letterSpacing: "0.06em",
              }}>
              <div className="px-1.5 py-1 text-right">Qty</div>
              <div className="px-1.5 py-1 text-right">Unit</div>
              <div className="px-1.5 py-1 text-right">Setup</div>
            </div>
            {bands.map((b) => (
              <div key={b.id} className="grid group"
                style={{
                  gridTemplateColumns: "1fr 1fr 1fr",
                  borderTop: `1px solid ${C.divider}`,
                  fontSize: 10, color: C.navy,
                }}>
                <div className="px-1.5 py-1 text-right" style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                  <InlineEditText
                    value={String(b.qty)}
                    align="right"
                    onSave={(v) => {
                      const n = intOrNull(v);
                      if (n == null || n <= 0) return Promise.resolve(false);
                      return p.onUpdateBand(b.id, { qty: n }).then(() => true);
                    }}
                    fontSize={10}
                    color={C.navy}
                    tabular
                  />
                </div>
                <div className="px-1.5 py-1 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <InlineEditText
                    value={b.unit_cost.toFixed(2)}
                    align="right"
                    onSave={(v) => {
                      const n = numOrNull(v); if (n == null) return Promise.resolve(false);
                      return p.onUpdateBand(b.id, { unit_cost: n }).then(() => true);
                    }}
                    fontSize={10}
                    color={C.navy}
                    tabular
                  />
                </div>
                <div className="px-1.5 py-1 text-right flex items-center justify-end gap-1"
                  style={{ fontVariantNumeric: "tabular-nums" }}>
                  <InlineEditText
                    value={b.setup_cost.toFixed(2)}
                    align="right"
                    onSave={(v) => {
                      const n = numOrNull(v); if (n == null) return Promise.resolve(false);
                      return p.onUpdateBand(b.id, { setup_cost: n }).then(() => true);
                    }}
                    fontSize={10}
                    color={C.navy}
                    tabular
                  />
                  <button onClick={() => p.onDeleteBand(b.id)}
                    className="opacity-0 group-hover:opacity-100"
                    aria-label="Delete band">
                    <X className="h-2.5 w-2.5" style={{ color: C.tan }} />
                  </button>
                </div>
              </div>
            ))}
            <button onClick={p.onAddBand}
              className="w-full text-[9px] py-1"
              style={{ color: C.tan, borderTop: `1px solid ${C.divider}` }}>
              + Add tier
            </button>
          </div>
        )}
      </td>

      {/* 12. Kebab */}
      <td className="px-1" style={{ verticalAlign: "top", paddingTop: 8 }}>
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-0.5 rounded hover:bg-black/5"
              style={{ color: C.tertiary }} aria-label="Row actions">
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            {decoration && (
              <button onClick={p.onDeleteDecoration}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
                style={{ color: C.navy }}>
                <Trash2 className="h-4 w-4" /> Remove decoration
              </button>
            )}
            {isPrimary && (
              <>
                <button onClick={p.onAddDecoration}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
                  style={{ color: C.navy }}>
                  <Plus className="h-4 w-4" /> Add decoration
                </button>
                <button onClick={p.onDeleteProduct}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-destructive/10 text-destructive flex items-center gap-2">
                  <Trash2 className="h-4 w-4" /> Delete product
                </button>
              </>
            )}
          </PopoverContent>
        </Popover>
      </td>
    </tr>
  );
};

// ── Tiny presentation pieces ──────────────────────────────────────────────

const Pill = ({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) => (
  <span className="inline-block max-w-full truncate rounded-full px-2 py-0.5"
    style={{ backgroundColor: bg, color: fg, fontSize: 10, lineHeight: "1.45", fontWeight: 500 }}>
    {children}
  </span>
);

interface InlineEditTextProps {
  value: string;
  placeholder?: string;
  onSave: (v: string) => Promise<boolean | void> | void;
  fontSize?: number;
  weight?: number;
  color?: string;
  tabular?: boolean;
  align?: "left" | "right";
}
const InlineEditText = ({
  value, placeholder, onSave, fontSize = 11, weight, color, tabular, align,
}: InlineEditTextProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = async () => {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className="bg-transparent outline-none w-full"
        style={{
          fontSize, fontWeight: weight, color, textAlign: align,
          fontVariantNumeric: tabular ? "tabular-nums" : undefined,
          border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 3px",
        }}
      />
    );
  }
  return (
    <button onClick={() => setEditing(true)}
      className="text-left hover:bg-black/5 rounded px-0.5 truncate max-w-full block"
      style={{
        fontSize, fontWeight: weight, color, textAlign: align,
        fontVariantNumeric: tabular ? "tabular-nums" : undefined,
        width: align === "right" ? "100%" : undefined,
      }}>
      {value || <span style={{ color: C.tertiary }}>{placeholder ?? "—"}</span>}
    </button>
  );
};

const CartonCell = ({ l, w, h, unit, onSave }: {
  l: number | null; w: number | null; h: number | null; unit: string;
  onSave: (patch: Partial<Product>) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [L, setL] = useState(l?.toString() ?? "");
  const [W, setW] = useState(w?.toString() ?? "");
  const [H, setH] = useState(h?.toString() ?? "");
  useEffect(() => {
    setL(l?.toString() ?? ""); setW(w?.toString() ?? ""); setH(h?.toString() ?? "");
  }, [l, w, h]);
  const display = (l != null && w != null && h != null) ? `${l}\u00D7${w}\u00D7${h}` : "—";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-left">
          <div style={{ fontSize: 11, color: C.navy, fontVariantNumeric: "tabular-nums" }}>{display}</div>
          <div style={{ fontSize: 9, color: C.tan }}>{unit}</div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="text-[11px] mb-2" style={{ color: C.tan }}>Carton L × W × H ({unit})</div>
        <div className="grid grid-cols-3 gap-2">
          {[["L", L, setL], ["W", W, setW], ["H", H, setH]].map(([k, v, set]: any) => (
            <input key={k} value={v} onChange={(e) => set(e.target.value)}
              placeholder={k}
              className="rounded border px-2 py-1 text-[12px] text-center"
              style={{ borderColor: C.border }} />
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={() => setOpen(false)} className="text-[12px] px-2 py-1">Cancel</button>
          <button onClick={async () => {
            await onSave({
              carton_length: numOrNull(L),
              carton_width: numOrNull(W),
              carton_height: numOrNull(H),
            });
            setOpen(false);
          }} className="text-[12px] px-2 py-1 rounded text-white"
            style={{ background: C.orange }}>Save</button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const LeadCell = ({ min, max, display, onSave }: {
  min: number; max: number | null; display: string;
  onSave: (min: number, max: number | null) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(String(min));
  const [b, setB] = useState(max != null ? String(max) : "");
  useEffect(() => { setA(String(min)); setB(max != null ? String(max) : ""); }, [min, max]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-left">
          <div style={{ fontSize: 11, color: C.navy, fontVariantNumeric: "tabular-nums" }}>{display}</div>
          <div style={{ fontSize: 9, color: C.tan }}>days</div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="text-[11px] mb-2" style={{ color: C.tan }}>Production days (min to max)</div>
        <div className="flex items-center gap-2">
          <input value={a} onChange={(e) => setA(e.target.value)} placeholder="min"
            className="rounded border px-2 py-1 text-[12px] text-center flex-1"
            style={{ borderColor: C.border }} />
          <span style={{ color: C.tan, fontSize: 11 }}>to</span>
          <input value={b} onChange={(e) => setB(e.target.value)} placeholder="(blank = single)"
            className="rounded border px-2 py-1 text-[12px] text-center flex-1"
            style={{ borderColor: C.border }} />
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={() => setOpen(false)} className="text-[12px] px-2 py-1">Cancel</button>
          <button onClick={async () => {
            const minN = parseInt(a, 10);
            if (!Number.isFinite(minN) || minN <= 0) { toast.error("Min must be a positive number"); return; }
            const maxN = b.trim() ? parseInt(b, 10) : null;
            if (maxN != null && (!Number.isFinite(maxN) || maxN < minN)) {
              toast.error("Max must be ≥ min"); return;
            }
            await onSave(minN, maxN);
            setOpen(false);
          }} className="text-[12px] px-2 py-1 rounded text-white"
            style={{ background: C.orange }}>Save</button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ImageThumb = ({ url, size, radius, onPick }: {
  url: string | null; size: number; radius?: number; onPick: (file: File) => Promise<void>;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          width: size, height: size, borderRadius: radius ?? 5,
          backgroundColor: C.divider, overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "none", cursor: "pointer", padding: 0,
        }}
        aria-label="Upload image">
        {url ? (
          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <ImageIcon className="h-4 w-4" style={{ color: C.tertiary }} />
        )}
      </button>
      <input
        ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (f) await onPick(f);
        }}
      />
    </>
  );
};

const AddDetailPopover = ({ labels, attached, onPick, onCreate }: {
  labels: DetailLabel[];
  attached: Set<string>;
  onPick: (id: string) => void;
  onCreate: (name: string) => Promise<DetailLabel | null>;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase();
    return labels
      .filter((l) => !attached.has(l.id))
      .filter((l) => !t || l.label.toLowerCase().includes(t))
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  }, [labels, attached, search]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setCreating(false); setNewName(""); setSearch(""); } }}>
      <PopoverTrigger asChild>
        <button className="text-left text-[10px] hover:text-[#E97817]"
          style={{ color: C.tan }}>
          + Add detail
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        {!creating ? (
          <>
            <input
              autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search labels…"
              className="w-full text-[12px] px-2 py-1.5 rounded border mb-2"
              style={{ borderColor: C.border }}
            />
            <div className="max-h-56 overflow-auto">
              {visible.map((l) => (
                <button key={l.id}
                  onClick={() => { onPick(l.id); setOpen(false); }}
                  className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-[12px] rounded hover:bg-muted">
                  <Tag className="h-3 w-3" style={{ color: C.tan }} />
                  <span style={{ color: C.navy }}>{l.label}</span>
                </button>
              ))}
              {visible.length === 0 && (
                <div className="text-[11px] text-center py-3" style={{ color: C.tertiary }}>
                  No labels found.
                </div>
              )}
            </div>
            <div className="border-t my-1" style={{ borderColor: C.divider }} />
            <button onClick={() => setCreating(true)}
              className="w-full text-left px-2 py-1.5 text-[12px] rounded hover:bg-muted"
              style={{ color: C.orange, fontWeight: 500 }}>
              + Add new label…
            </button>
          </>
        ) : (
          <>
            <div className="text-[10px] mb-1" style={{ color: C.tan }}>New label name</div>
            <input
              autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  const lbl = await onCreate(newName);
                  if (lbl) { onPick(lbl.id); setOpen(false); }
                } else if (e.key === "Escape") { setCreating(false); setNewName(""); }
              }}
              className="w-full text-[12px] px-2 py-1.5 rounded border"
              style={{ borderColor: C.border }}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setCreating(false)} className="text-[11px] px-2 py-1">Cancel</button>
              <button onClick={async () => {
                const lbl = await onCreate(newName);
                if (lbl) { onPick(lbl.id); setOpen(false); }
              }} className="text-[11px] px-2 py-1 rounded text-white" style={{ background: C.orange }}>
                Create
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

// ── Draft row (Add Product) ───────────────────────────────────────────────
const DraftRow = ({
  draft, subcategoryGroups, supplierOptions, itemNumber, onChange, onSave, onCancel,
}: {
  draft: Draft;
  subcategoryGroups: { parent: Cat; subs: Cat[] }[];
  supplierOptions: { id: string; name: string; origin_id?: string | null }[];
  itemNumber: string | null;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) => (
  <tr style={{
    borderBottom: `1px solid ${C.border}`,
    background: "#FFFBEF",
  }}>
    <td className="px-2 py-2" style={{ verticalAlign: "top" }}>
      <Select value={draft.supplierId} onValueChange={(v) => onChange({ ...draft, supplierId: v })}>
        <SelectTrigger className="h-7 text-[11px]">
          <SelectValue placeholder="Supplier…" />
        </SelectTrigger>
        <SelectContent>
          {supplierOptions.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </td>
    <td className="px-2 py-2" style={{ verticalAlign: "top" }}>
      <Select value={draft.subcategoryId} onValueChange={(v) => onChange({ ...draft, subcategoryId: v })}>
        <SelectTrigger className="h-7 text-[11px]">
          <SelectValue placeholder="Subcategory…" />
        </SelectTrigger>
        <SelectContent>
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
    </td>
    <td className="px-2 py-2" style={{ verticalAlign: "top" }}>
      <div style={{ width: 46, height: 46, borderRadius: 5, backgroundColor: C.divider }} />
    </td>
    <td className="px-2 py-2" style={{ verticalAlign: "top" }}>
      <input
        autoFocus value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        placeholder="Product name"
        className="w-full text-[12px] px-1.5 py-1 rounded border"
        style={{ borderColor: C.border, color: C.navy }}
      />
      <div style={{ fontSize: 10, color: C.tan, marginTop: 4, fontFamily: "ui-monospace,monospace" }}>
        {itemNumber ?? "Item # pending…"}
      </div>
    </td>
    <td colSpan={6} className="px-2 py-2" style={{ verticalAlign: "top" }}>
      <div className="text-[10px]" style={{ color: C.tan }}>
        Save first, then add details, specs, decorations, and pricing tiers.
      </div>
    </td>
    <td colSpan={2} className="px-2 py-2" style={{ verticalAlign: "top" }}>
      <div className="flex gap-1 justify-end">
        <button onClick={onCancel} className="text-[11px] px-2 py-1 rounded hover:bg-black/5"
          style={{ color: C.tan }}>Cancel</button>
        <button onClick={onSave}
          disabled={!draft.name.trim() || !draft.subcategoryId || !draft.supplierId || !itemNumber}
          className="text-[11px] px-2 py-1 rounded text-white disabled:opacity-50"
          style={{ background: C.orange }}>Save</button>
      </div>
    </td>
  </tr>
);
