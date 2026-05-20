/**
 * Product detail page — edit identity, specs, description (detail labels),
 * and decorations with tier pricing. Supports both /products/:id (edit) and
 * /products/new (create). Autosave on blur.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, Plus, Tag, Trash2, X, Search } from "lucide-react";
import { toast } from "sonner";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMasterData } from "@/hooks/useMasterData";
import { originLetterFromCode } from "@/lib/originLetter";
import { composePrimaryItemNumber, nextSequenceFor } from "@/lib/productItemNumber";

// ── Types ────────────────────────────────────────────────────────────────
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
}
interface Cat { id: string; parent_id: string | null; code: string | null; name: string }
interface DetailLabel { id: string; label: string; sort_order: number }
interface PDetail { id: string; product_id: string; detail_label_id: string; value: string; sort_order: number }
interface MDetail { id: string; decoration_method_id: string; detail: string; code: string }
interface DMethod { id: string; name: string }
interface Deco { id: string; product_id: string; method_detail_id: string; notes: string | null; ref_image_url: string | null; sort_order: number }
interface Band { id: string; product_decoration_id: string; qty: number; unit_cost: number; setup_cost: number }

const SECTION_BG = "#FFFFFF";
const SECTION_BORDER = "hsl(var(--brand-navy) / 0.08)";

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const md = useMasterData();
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [product, setProduct] = useState<Product | null>(null);

  // Create-mode drafts
  const [draftName, setDraftName] = useState("");
  const [draftSupplierId, setDraftSupplierId] = useState("");
  const [draftSubcategoryId, setDraftSubcategoryId] = useState("");
  const [draftSupNum, setDraftSupNum] = useState("");
  const [saving, setSaving] = useState(false);

  // Reference data
  const [cats, setCats] = useState<Cat[]>([]);
  const [labels, setLabels] = useState<DetailLabel[]>([]);
  const [methodDetails, setMethodDetails] = useState<MDetail[]>([]);
  const [decoMethods, setDecoMethods] = useState<DMethod[]>([]);

  // Product-scoped data
  const [details, setDetails] = useState<PDetail[]>([]);
  const [decorations, setDecorations] = useState<Deco[]>([]);
  const [bands, setBands] = useState<Band[]>([]);

  const [confirmDeleteDeco, setConfirmDeleteDeco] = useState<Deco | null>(null);

  // ── Load reference data once ───────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      const [c, dl, mdl, dm] = await Promise.all([
        supabase.from("product_categories").select("id,parent_id,code,name"),
        supabase.from("detail_labels").select("*").order("sort_order"),
        supabase.from("method_details").select("id,decoration_method_id,detail,code").order("detail"),
        supabase.from("decoration_methods").select("id,name").order("name"),
      ]);
      if (!active) return;
      setCats((c.data ?? []) as any);
      setLabels((dl.data ?? []) as any);
      setMethodDetails((mdl.data ?? []) as any);
      setDecoMethods((dm.data ?? []) as any);
    })();
    return () => { active = false; };
  }, []);

  // ── Load product + scoped data ─────────────────────────────────────────
  const reload = async () => {
    if (!id) return;
    const [p, pd, dec, bd] = await Promise.all([
      supabase.from("products").select("*").eq("id", id).maybeSingle(),
      supabase.from("product_details").select("*").eq("product_id", id).order("sort_order"),
      supabase.from("product_decorations").select("*").eq("product_id", id).order("sort_order"),
      supabase.from("product_decoration_bands").select("*").order("qty"),
    ]);
    setProduct((p.data ?? null) as any);
    setDetails((pd.data ?? []) as any);
    setDecorations((dec.data ?? []) as any);
    // Filter bands by current decorations
    const decoIds = new Set((dec.data ?? []).map((d: any) => d.id));
    setBands(((bd.data ?? []) as any[]).filter((b) => decoIds.has(b.product_decoration_id)) as any);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  // ── Lookups ────────────────────────────────────────────────────────────
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const mdById = useMemo(() => new Map(methodDetails.map((m) => [m.id, m])), [methodDetails]);
  const dmById = useMemo(() => new Map(decoMethods.map((m) => [m.id, m])), [decoMethods]);

  const subcategoryGroups = useMemo(() => {
    const parents = cats.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name));
    return parents.map((p) => ({
      parent: p,
      subs: cats.filter((c) => c.parent_id === p.id).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [cats]);

  const methodGroups = useMemo(() => {
    const map = new Map<string, MDetail[]>();
    for (const m of methodDetails) {
      const arr = map.get(m.decoration_method_id) ?? [];
      arr.push(m); map.set(m.decoration_method_id, arr);
    }
    return Array.from(map.entries())
      .map(([dmId, mds]) => ({ method: dmById.get(dmId), mds: mds.sort((a, b) => a.detail.localeCompare(b.detail)) }))
      .filter((g) => g.method)
      .sort((a, b) => (a.method!.name).localeCompare(b.method!.name));
  }, [methodDetails, dmById]);

  // ── Resolved fields for display in edit mode ───────────────────────────
  const supplier = product ? md.suppliers.find((s) => s.id === product.supplier_id) : null;
  const dimsUnit = supplier?.weight_unit === "lbs" ? "in" : "cm";
  const wtUnit = supplier?.weight_unit ?? "kg";
  const sub = product ? catById.get(product.subcategory_id) : null;
  const parent = sub?.parent_id ? catById.get(sub.parent_id) : null;

  // ── Autosave helpers ───────────────────────────────────────────────────
  async function patchProduct(patch: Partial<Product>) {
    if (!product) return;
    const { error } = await supabase.from("products").update(patch as any).eq("id", product.id);
    if (error) toast.error(`Save failed: ${error.message}`);
    else setProduct({ ...product, ...patch } as Product);
  }
  async function patchDetail(d: PDetail, value: string) {
    const { error } = await supabase.from("product_details").update({ value } as any).eq("id", d.id);
    if (error) toast.error(`Save failed: ${error.message}`);
    else setDetails((arr) => arr.map((x) => (x.id === d.id ? { ...x, value } : x)));
  }
  async function removeDetail(d: PDetail) {
    const { error } = await supabase.from("product_details").delete().eq("id", d.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else setDetails((arr) => arr.filter((x) => x.id !== d.id));
  }
  async function addDetail(labelId: string) {
    if (!product) return;
    const sortOrder = (details.length ? Math.max(...details.map((d) => d.sort_order)) : 0) + 1;
    const { data, error } = await supabase.from("product_details").insert({
      product_id: product.id, detail_label_id: labelId, value: "", sort_order: sortOrder,
    } as any).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    setDetails((arr) => [...arr, data as any]);
  }
  async function createLabelAndAdd(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextSort = (labels.length ? Math.max(...labels.map((l) => l.sort_order)) : 0) + 1;
    const { data, error } = await supabase.from("detail_labels").insert({ label: trimmed, sort_order: nextSort } as any).select().single();
    if (error) { toast.error(`Add label failed: ${error.message}`); return; }
    setLabels((arr) => [...arr, data as any]);
    await addDetail((data as any).id);
  }

  async function patchBand(b: Band, patch: Partial<Band>) {
    const { error } = await supabase.from("product_decoration_bands").update(patch as any).eq("id", b.id);
    if (error) toast.error(`Save failed: ${error.message}`);
    else setBands((arr) => arr.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
  }
  async function addBand(decoId: string) {
    const decoBands = bands.filter((b) => b.product_decoration_id === decoId);
    const nextQty = decoBands.length ? Math.max(...decoBands.map((b) => b.qty)) * 2 : 100;
    const { data, error } = await supabase.from("product_decoration_bands").insert({
      product_decoration_id: decoId, qty: nextQty, unit_cost: 0, setup_cost: 0,
    } as any).select().single();
    if (error) { toast.error(`Add tier failed: ${error.message}`); return; }
    setBands((arr) => [...arr, data as any]);
  }
  async function removeBand(b: Band) {
    const { error } = await supabase.from("product_decoration_bands").delete().eq("id", b.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else setBands((arr) => arr.filter((x) => x.id !== b.id));
  }
  async function patchDeco(d: Deco, patch: Partial<Deco>) {
    const { error } = await supabase.from("product_decorations").update(patch as any).eq("id", d.id);
    if (error) toast.error(`Save failed: ${error.message}`);
    else setDecorations((arr) => arr.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
  }
  async function addDecoration(methodDetailId: string) {
    if (!product) return;
    const nextSort = (decorations.length ? Math.max(...decorations.map((d) => d.sort_order)) : 0) + 1;
    const { data, error } = await supabase.from("product_decorations").insert({
      product_id: product.id, method_detail_id: methodDetailId, sort_order: nextSort,
    } as any).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    const newDeco = data as any as Deco;
    setDecorations((arr) => [...arr, newDeco]);
    // Seed default tiers 100 / 250 / 500 / 1000
    const seeds = [100, 250, 500, 1000].map((qty) => ({
      product_decoration_id: newDeco.id, qty, unit_cost: 0, setup_cost: 0,
    }));
    const { data: bandData, error: bErr } = await supabase.from("product_decoration_bands").insert(seeds as any).select();
    if (bErr) toast.error(`Tier seed failed: ${bErr.message}`);
    else setBands((arr) => [...arr, ...((bandData ?? []) as any)]);
  }
  async function deleteDecorationConfirmed() {
    if (!confirmDeleteDeco) return;
    const d = confirmDeleteDeco;
    // Bands first (no CASCADE FK defined)
    await supabase.from("product_decoration_bands").delete().eq("product_decoration_id", d.id);
    const { error } = await supabase.from("product_decorations").delete().eq("id", d.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else {
      setDecorations((arr) => arr.filter((x) => x.id !== d.id));
      setBands((arr) => arr.filter((x) => x.product_decoration_id !== d.id));
    }
    setConfirmDeleteDeco(null);
  }

  // ── Image upload ───────────────────────────────────────────────────────
  async function uploadProductImage(file: File) {
    if (!product) return;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${product.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
    if (upErr) { toast.error(`Upload failed: ${upErr.message}`); return; }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    await patchProduct({ image_url: data.publicUrl });
  }
  async function uploadDecoRef(d: Deco, file: File) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${d.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("decoration-refs").upload(path, file, { upsert: true });
    if (upErr) { toast.error(`Upload failed: ${upErr.message}`); return; }
    const { data } = supabase.storage.from("decoration-refs").getPublicUrl(path);
    await patchDeco(d, { ref_image_url: data.publicUrl });
  }

  // ── Create (new) ───────────────────────────────────────────────────────
  async function handleCreate() {
    if (!draftName.trim() || !draftSupplierId || !draftSubcategoryId) {
      toast.error("Name, Supplier and Subcategory are required."); return;
    }
    const sup = md.suppliers.find((s) => s.id === draftSupplierId);
    if (!sup?.origin_id) { toast.error("Selected supplier has no origin."); return; }
    const subc = cats.find((c) => c.id === draftSubcategoryId);
    if (!subc?.code) { toast.error("Subcategory has no code."); return; }
    const origin = md.origins.find((o) => o.id === sup.origin_id);
    const letter = originLetterFromCode(origin?.code);
    if (!letter) { toast.error("Supplier origin has no letter mapping."); return; }

    // fetch existing item numbers to compute sequence
    setSaving(true);
    const { data: existing } = await supabase.from("products").select("primary_item_number");
    const seq = nextSequenceFor(subc.code, (existing ?? []).map((x: any) => x.primary_item_number).filter(Boolean));
    const itemNumber = composePrimaryItemNumber(subc.code, seq, letter);

    const { data, error } = await supabase.from("products").insert({
      primary_item_number: itemNumber,
      name: draftName.trim(),
      subcategory_id: draftSubcategoryId,
      origin_id: sup.origin_id,
      supplier_id: sup.id,
      supplier_item_number: draftSupNum.trim() || null,
      production_days_min: 1,
    } as any).select().single();
    setSaving(false);
    if (error) { toast.error(`Create failed: ${error.message}`); return; }
    toast.success(`Created ${itemNumber}`);
    navigate(`/products/${(data as any).id}`);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const title = isNew
    ? "New product"
    : product
      ? `${product.name || product.primary_item_number}${product.supplier_item_number ? ` · ${product.supplier_item_number}` : ""}`
      : "Not found";

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        <header
          className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: SECTION_BORDER }}
        >
          <div className="px-4 sm:px-6 lg:px-8 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
            <button onClick={() => navigate("/products")} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted/50">
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
                MASTER DATA / PRODUCTS
              </div>
              <h1
                className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}
              >
                {loading ? "Loading…" : title}
              </h1>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isNew ? (
            <Section title="New product">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Name *">
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
                  />
                </Field>
                <Field label="Supplier *">
                  <Select value={draftSupplierId} onValueChange={setDraftSupplierId}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Choose supplier…" /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {[...md.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Subcategory *">
                  <Select value={draftSubcategoryId} onValueChange={setDraftSubcategoryId}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Choose subcategory…" /></SelectTrigger>
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
                </Field>
                <Field label="Supplier item number">
                  <input
                    value={draftSupNum}
                    onChange={(e) => setDraftSupNum(e.target.value)}
                    placeholder="optional"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
                  />
                </Field>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => navigate("/products")}
                  className="px-4 h-10 rounded-md text-sm font-medium border border-input hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="px-4 h-10 rounded-md text-sm font-semibold disabled:opacity-50"
                  style={{ background: "hsl(var(--brand-orange))", color: "white" }}
                >
                  {saving ? "Creating…" : "Create product"}
                </button>
              </div>
            </Section>
          ) : !product ? (
            <p className="text-sm text-muted-foreground">Product not found.</p>
          ) : (
            <>
              {/* Identity */}
              <Section title="Identity">
                <div className="flex gap-6">
                  <ProductImageUpload url={product.image_url} onFile={uploadProductImage} />
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Name">
                      <TextInput value={product.name ?? ""} onCommit={(v) => patchProduct({ name: v })} />
                    </Field>
                    <Field label="Supplier item number">
                      <TextInput
                        value={product.supplier_item_number ?? ""}
                        onCommit={(v) => patchProduct({ supplier_item_number: v || null })}
                        placeholder="—"
                      />
                    </Field>
                    <Field label="Supplier">
                      <Select value={product.supplier_id} onValueChange={(v) => patchProduct({ supplier_id: v })}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {[...md.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Subcategory">
                      <Select value={product.subcategory_id} onValueChange={(v) => patchProduct({ subcategory_id: v })}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
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
                    </Field>
                    <Field label="Category">
                      <div className="h-10 px-3 inline-flex items-center text-sm rounded-md border border-input bg-muted/40 text-muted-foreground">
                        {parent?.name ?? "—"}
                      </div>
                    </Field>
                    <Field label="Item number">
                      <div className="h-10 px-3 inline-flex items-center text-sm rounded-md border border-input bg-muted/40 text-muted-foreground tabular font-mono">
                        {product.primary_item_number}
                      </div>
                    </Field>
                  </div>
                </div>
              </Section>

              {/* Specs */}
              <Section title="Specs">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Pack">
                    <NumberInput
                      value={product.carton_pack}
                      onCommit={(v) => patchProduct({ carton_pack: v as any })}
                      suffix="/ ctn"
                    />
                  </Field>
                  <Field label="Weight">
                    <NumberInput
                      value={product.carton_weight}
                      onCommit={(v) => patchProduct({ carton_weight: v as any })}
                      suffix={wtUnit}
                    />
                  </Field>
                  <Field label="Min lead time">
                    <NumberInput
                      value={product.production_days_min}
                      onCommit={(v) => patchProduct({ production_days_min: (v ?? 1) as any })}
                      suffix="days"
                    />
                  </Field>
                  <Field label="Max lead time (optional)">
                    <NumberInput
                      value={product.production_days_max}
                      onCommit={(v) => patchProduct({ production_days_max: v as any })}
                      suffix="days"
                    />
                  </Field>
                  <Field label={`Carton L × W × H (${dimsUnit})`} span={2}>
                    <div className="flex items-center gap-2">
                      <NumberInput value={product.carton_length} onCommit={(v) => patchProduct({ carton_length: v as any })} />
                      <span className="text-muted-foreground">×</span>
                      <NumberInput value={product.carton_width} onCommit={(v) => patchProduct({ carton_width: v as any })} />
                      <span className="text-muted-foreground">×</span>
                      <NumberInput value={product.carton_height} onCommit={(v) => patchProduct({ carton_height: v as any })} />
                      <span className="text-[12px] text-muted-foreground">{dimsUnit}</span>
                    </div>
                  </Field>
                  <Field label="MOQ (optional)">
                    <NumberInput value={product.moq} onCommit={(v) => patchProduct({ moq: v as any })} />
                  </Field>
                </div>
              </Section>

              {/* Description / Details */}
              <Section title="Description">
                <div className="space-y-2">
                  {details.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No details yet.</p>
                  )}
                  {details
                    .slice()
                    .sort((a, b) => {
                      const la = labelById.get(a.detail_label_id)?.sort_order ?? 0;
                      const lb = labelById.get(b.detail_label_id)?.sort_order ?? 0;
                      return la - lb || a.sort_order - b.sort_order;
                    })
                    .map((d) => (
                      <DetailRow
                        key={d.id}
                        label={labelById.get(d.detail_label_id)?.label ?? "—"}
                        value={d.value}
                        onCommit={(v) => patchDetail(d, v)}
                        onRemove={() => removeDetail(d)}
                      />
                    ))}
                  <AddDetailPopover
                    availableLabels={labels.filter((l) => !details.some((d) => d.detail_label_id === l.id))}
                    onPick={addDetail}
                    onCreateNew={createLabelAndAdd}
                  />
                </div>
              </Section>

              {/* Decorations */}
              <Section title="Decorations">
                <div className="space-y-4">
                  {decorations.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No decorations yet.</p>
                  )}
                  {decorations.map((d) => (
                    <DecorationCard
                      key={d.id}
                      deco={d}
                      methodGroups={methodGroups}
                      mdById={mdById}
                      dmById={dmById}
                      bands={bands.filter((b) => b.product_decoration_id === d.id).sort((a, b) => a.qty - b.qty)}
                      onPatchDeco={(p) => patchDeco(d, p)}
                      onUploadRef={(f) => uploadDecoRef(d, f)}
                      onRemove={() => setConfirmDeleteDeco(d)}
                      onAddBand={() => addBand(d.id)}
                      onPatchBand={patchBand}
                      onRemoveBand={removeBand}
                    />
                  ))}
                  <AddDecorationPopover methodGroups={methodGroups} onPick={addDecoration} />
                </div>
              </Section>
            </>
          )}
        </main>

        <ConfirmDialog
          open={!!confirmDeleteDeco}
          onCancel={() => setConfirmDeleteDeco(null)}
          title="Remove decoration?"
          description="This decoration and all its pricing tiers will be deleted."
          confirmLabel="Remove"
          destructive
          onConfirm={deleteDecorationConfirmed}
        />
      </div>
    </DesktopAppShell>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: SECTION_BORDER, backgroundColor: SECTION_BG }}
    >
      <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: "hsl(var(--brand-navy))", letterSpacing: "0.08em" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: 2 }) {
  return (
    <div className={span === 2 ? "md:col-span-2" : undefined}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function TextInput({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onCommit(local); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
      placeholder={placeholder}
      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
    />
  );
}

function NumberInput({
  value, onCommit, suffix,
}: { value: number | null | undefined; onCommit: (v: number | null) => void; suffix?: string }) {
  const [local, setLocal] = useState<string>(value == null ? "" : String(value));
  useEffect(() => setLocal(value == null ? "" : String(value)), [value]);
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const trimmed = local.trim();
          const next = trimmed === "" ? null : Number(trimmed);
          if (next != null && !Number.isFinite(next)) return;
          if (next !== (value ?? null)) onCommit(next);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm tabular focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
        style={{ paddingRight: suffix ? 48 : undefined }}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">{suffix}</span>
      )}
    </div>
  );
}

function ProductImageUpload({ url, onFile }: { url: string | null; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="h-32 w-32 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden hover:bg-muted/30 transition-colors"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.18)" }}
      >
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="text-center px-3">
            <ImageIcon className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            <div className="text-[11px] text-muted-foreground">Click to upload</div>
          </div>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }}
      />
    </div>
  );
}

function DetailRow({
  label, value, onCommit, onRemove,
}: { label: string; value: string; onCommit: (v: string) => void; onRemove: () => void }) {
  return (
    <div className="group flex items-center gap-2">
      <span
        className="inline-flex items-center px-2 h-7 rounded text-[11px] font-medium shrink-0"
        style={{ backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
      >
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <TextInput value={value} onCommit={onCommit} placeholder="value…" />
      </div>
      <button
        onClick={onRemove}
        className="p-1.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity"
        aria-label="Remove detail"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddDetailPopover({
  availableLabels, onPick, onCreateNew,
}: {
  availableLabels: DetailLabel[];
  onPick: (id: string) => void;
  onCreateNew: (name: string) => void;
}) {
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
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium border border-dashed hover:bg-muted/30 transition-colors"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.18)", color: "hsl(var(--brand-navy))" }}
        >
          <Plus className="h-4 w-4" /> Add detail
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search labels…"
              className="w-full h-8 pl-8 pr-2 rounded text-sm bg-muted/40 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {availableLabels.length === 0 ? "All labels are already added." : "No matches."}
            </div>
          ) : (
            filtered.map((l) => (
              <button
                key={l.id}
                onClick={() => { onPick(l.id); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60 flex items-center gap-2"
              >
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{l.label}</span>
              </button>
            ))
          )}
        </div>
        <div className="border-t p-2">
          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted/60 flex items-center gap-2"
              style={{ color: "hsl(var(--brand-orange))" }}
            >
              <Plus className="h-4 w-4" /> Add new label…
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Label name"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) { onCreateNew(newName); setOpen(false); }
                  if (e.key === "Escape") setCreating(false);
                }}
                className="flex-1 h-8 px-2 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              />
              <button
                onClick={() => { if (newName.trim()) { onCreateNew(newName); setOpen(false); } }}
                className="px-2 h-8 rounded text-xs font-semibold"
                style={{ background: "hsl(var(--brand-orange))", color: "white" }}
              >
                Add
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DecorationCard({
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
  onPatchBand: (b: Band, patch: Partial<Band>) => void;
  onRemoveBand: (b: Band) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: SECTION_BORDER, backgroundColor: "#FDFCF8" }}
    >
      <div className="flex gap-4">
        {/* Ref image */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="h-20 w-20 rounded border-2 border-dashed flex items-center justify-center overflow-hidden hover:bg-muted/30"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.18)" }}
          >
            {deco.ref_image_url ? (
              <img src={deco.ref_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
          <input
            ref={ref}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadRef(f); e.currentTarget.value = ""; }}
          />
        </div>

        {/* Method + notes */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Method">
            <Select value={deco.method_detail_id} onValueChange={(v) => onPatchDeco({ method_detail_id: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {methodGroups.map((g) => (
                  <SelectGroup key={g.method!.id}>
                    <SelectLabel>{g.method!.name}</SelectLabel>
                    {g.mds.map((m) => (
                      <SelectItem key={m.id} value={m.id}>[{m.code}] {m.detail}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notes">
            <TextInput
              value={deco.notes ?? ""}
              onCommit={(v) => onPatchDeco({ notes: v || null })}
              placeholder="optional"
            />
          </Field>
        </div>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="self-start p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove decoration"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Tier table */}
      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Pricing tiers</div>
        <div className="rounded-md border overflow-hidden" style={{ borderColor: SECTION_BORDER }}>
          <div
            className="grid text-[11px] uppercase tracking-wide font-semibold py-1.5 px-3"
            style={{
              gridTemplateColumns: "1fr 1fr 1fr 40px",
              color: "hsl(var(--brand-navy) / 0.55)",
              backgroundColor: "hsl(var(--brand-navy) / 0.03)",
            }}
          >
            <div>Qty</div><div>Unit cost</div><div>Setup cost</div><div />
          </div>
          {bands.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground italic">No tiers.</div>
          )}
          {bands.map((b) => (
            <div
              key={b.id}
              className="grid items-center gap-2 px-3 py-1.5 border-t group"
              style={{ gridTemplateColumns: "1fr 1fr 1fr 40px", borderColor: SECTION_BORDER }}
            >
              <NumberInput value={b.qty} onCommit={(v) => onPatchBand(b, { qty: (v ?? 0) as any })} />
              <NumberInput value={b.unit_cost} onCommit={(v) => onPatchBand(b, { unit_cost: (v ?? 0) as any })} suffix="$" />
              <NumberInput value={b.setup_cost} onCommit={(v) => onPatchBand(b, { setup_cost: (v ?? 0) as any })} suffix="$" />
              <button
                onClick={() => onRemoveBand(b)}
                className="p-1.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove tier"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={onAddBand}
            className="w-full px-3 py-2 text-xs text-left border-t flex items-center gap-1.5 hover:bg-muted/30"
            style={{ borderColor: SECTION_BORDER, color: "hsl(var(--brand-orange))" }}
          >
            <Plus className="h-3.5 w-3.5" /> Add tier
          </button>
        </div>
      </div>
    </div>
  );
}

function AddDecorationPopover({
  methodGroups, onPick,
}: {
  methodGroups: { method: DMethod | undefined; mds: MDetail[] }[];
  onPick: (mdId: string) => void;
}) {
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
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium border border-dashed hover:bg-muted/30"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.18)", color: "hsl(var(--brand-navy))" }}
        >
          <Plus className="h-4 w-4" /> Add decoration
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search methods…"
              className="w-full h-8 pl-8 pr-2 rounded text-sm bg-muted/40 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No matches.</div>
          ) : filtered.map((g) => (
            <div key={g.method.id} className="py-1">
              <div className="px-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                {g.method.name}
              </div>
              {g.mds.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onPick(m.id); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60"
                >
                  <span className="font-mono text-[11px] text-muted-foreground mr-1.5">[{m.code}]</span>
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
