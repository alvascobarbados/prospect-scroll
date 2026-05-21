import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMasterData } from "@/hooks/useMasterData";
import { composePrimaryItemNumber, nextSequenceFor } from "@/lib/productItemNumber";
import { originLetterFromCode } from "@/lib/originLetter";

interface Subcategory {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
}

interface AddProductDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#6B7280",
  marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "0.5px solid #D1D5DB",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  color: "#0E2849",
  background: "#FFFFFF",
  fontFamily: "inherit",
};

export function AddProductDialog({ open, onClose, onCreated }: AddProductDialogProps) {
  const { suppliers, origins } = useMasterData();
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [saving, setSaving] = useState(false);

  // Form state
  const [supplierId, setSupplierId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [name, setName] = useState("");
  const [parentName, setParentName] = useState("");
  const [variantName, setVariantName] = useState("");
  const [itemSuffix, setItemSuffix] = useState("");
  const [cartonPack, setCartonPack] = useState("");
  const [cartonL, setCartonL] = useState("");
  const [cartonW, setCartonW] = useState("");
  const [cartonH, setCartonH] = useState("");
  const [cartonWeight, setCartonWeight] = useState("");
  const [leadMin, setLeadMin] = useState("");
  const [leadMax, setLeadMax] = useState("");

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setSupplierId("");
    setSubcategoryId("");
    setName("");
    setParentName("");
    setVariantName("");
    setItemSuffix("");
    setCartonPack("");
    setCartonL("");
    setCartonW("");
    setCartonH("");
    setCartonWeight("");
    setLeadMin("");
    setLeadMax("");
  }, [open]);

  // Load subcategories
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name, code, parent_id")
        .order("name");
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load categories");
        return;
      }
      // Subcategories: parent_id IS NOT NULL and 3-char code
      const subs = (data ?? []).filter(
        (c) => c.parent_id && c.code && c.code.length === 3,
      ) as Subcategory[];
      setSubcategories(subs);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  const supplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );
  const subcategory = useMemo(
    () => subcategories.find((s) => s.id === subcategoryId) ?? null,
    [subcategories, subcategoryId],
  );
  const supplierOrigin = useMemo(
    () => origins.find((o) => o.id === supplier?.origin_id) ?? null,
    [origins, supplier],
  );

  const supplierItemPreview =
    supplier?.code && itemSuffix.trim()
      ? `${supplier.code}-${itemSuffix.trim().toUpperCase()}`
      : "";

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // Validate
    if (!supplier) return toast.error("Supplier required");
    if (!supplier.code) return toast.error("Supplier has no code — set one first");
    if (!supplier.origin_id) return toast.error("Supplier has no origin — set one first");
    if (!supplierOrigin) return toast.error("Supplier origin not found");
    const originLetter = originLetterFromCode(supplierOrigin.code);
    if (!originLetter) return toast.error(`Origin ${supplierOrigin.code} has no letter mapping`);
    if (!subcategory) return toast.error("Subcategory required");
    if (!subcategory.code) return toast.error("Subcategory has no code — set one first");
    const trimmedName = name.trim();
    if (!trimmedName) return toast.error("Name required");
    const cleanSuffix = itemSuffix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!cleanSuffix) return toast.error("Supplier item suffix required");

    const leadMinNum = leadMin.trim() ? parseInt(leadMin, 10) : null;
    const leadMaxNum = leadMax.trim() ? parseInt(leadMax, 10) : null;
    if (leadMinNum === null || !Number.isFinite(leadMinNum) || leadMinNum < 1) {
      return toast.error("Lead time (min) required");
    }
    if (leadMaxNum !== null && (!Number.isFinite(leadMaxNum) || leadMaxNum < leadMinNum)) {
      return toast.error("Lead time max must be ≥ min");
    }

    setSaving(true);
    try {
      // Compute primary_item_number
      const { data: existing, error: exErr } = await supabase
        .from("products")
        .select("primary_item_number");
      if (exErr) throw new Error(exErr.message);
      const nums = (existing ?? []).map((r) => r.primary_item_number).filter(Boolean) as string[];
      const seq = nextSequenceFor(subcategory.code!, nums);
      const primaryItemNumber = composePrimaryItemNumber(subcategory.code!, seq, originLetter);

      const supplierItemNumber = `${supplier.code}-${cleanSuffix}`;

      const toNum = (s: string) => {
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : null;
      };
      const toInt = (s: string) => {
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : null;
      };

      const insert = {
        name: trimmedName,
        supplier_id: supplier.id,
        origin_id: supplier.origin_id,
        subcategory_id: subcategory.id,
        primary_item_number: primaryItemNumber,
        supplier_item_number: supplierItemNumber,
        parent_name: parentName.trim() || null,
        variant_name: variantName.trim() || null,
        production_days_min: leadMinNum,
        production_days_max: leadMaxNum,
        carton_pack: toInt(cartonPack),
        carton_length: toNum(cartonL),
        carton_width: toNum(cartonW),
        carton_height: toNum(cartonH),
        carton_weight: toNum(cartonWeight),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("products").insert(insert as any);
      if (error) throw new Error(error.message);

      toast.success(`Created ${trimmedName}`);
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => !saving && onClose()} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-2xl rounded-2xl bg-card shadow-[var(--shadow-section)] border animate-fade-in"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "hsl(var(--brand-navy) / 0.12)" }}>
          <h3 className="text-lg font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>
            Add product
          </h3>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
            className="p-1 rounded-md hover:bg-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1 / span 2" }}>
            <label style={labelStyle}>Supplier *</label>
            <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.code ? ` (${s.code})` : " — no code"}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "1 / span 2" }}>
            <label style={labelStyle}>Subcategory *</label>
            <select required value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} style={inputStyle}>
              <option value="">Select subcategory…</option>
              {subcategories.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "1 / span 2" }}>
            <label style={labelStyle}>Name *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Product name" />
          </div>

          <div>
            <label style={labelStyle}>Parent name (optional)</label>
            <input value={parentName} onChange={(e) => setParentName(e.target.value)} style={inputStyle} placeholder="Leave blank for standalone" />
          </div>
          <div>
            <label style={labelStyle}>Variant name (optional)</label>
            <input value={variantName} onChange={(e) => setVariantName(e.target.value)} style={inputStyle} placeholder="e.g. SMALL" />
          </div>

          <div style={{ gridColumn: "1 / span 2" }}>
            <label style={labelStyle}>Supplier item suffix *</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#6B7280", whiteSpace: "nowrap" }}>
                {supplier?.code ? `${supplier.code}-` : "{supplier}-"}
              </span>
              <input
                required
                value={itemSuffix}
                onChange={(e) => setItemSuffix(e.target.value.toUpperCase())}
                style={inputStyle}
                placeholder="A1B2"
              />
            </div>
            {supplierItemPreview && (
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
                Full code: <strong style={{ color: "#0E2849" }}>{supplierItemPreview}</strong>
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Lead time min (days) *</label>
            <input required type="number" min={1} value={leadMin} onChange={(e) => setLeadMin(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Lead time max (days)</label>
            <input type="number" min={1} value={leadMax} onChange={(e) => setLeadMax(e.target.value)} style={inputStyle} placeholder="Optional" />
          </div>

          <div>
            <label style={labelStyle}>Carton pack</label>
            <input type="number" min={1} value={cartonPack} onChange={(e) => setCartonPack(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Carton weight</label>
            <input type="number" step="0.01" min={0} value={cartonWeight} onChange={(e) => setCartonWeight(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ gridColumn: "1 / span 2" }}>
            <label style={labelStyle}>Carton dimensions (L × W × H)</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <input type="number" step="0.1" min={0} value={cartonL} onChange={(e) => setCartonL(e.target.value)} style={inputStyle} placeholder="L" />
              <input type="number" step="0.1" min={0} value={cartonW} onChange={(e) => setCartonW(e.target.value)} style={inputStyle} placeholder="W" />
              <input type="number" step="0.1" min={0} value={cartonH} onChange={(e) => setCartonH(e.target.value)} style={inputStyle} placeholder="H" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: "hsl(var(--brand-navy) / 0.12)" }}>
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))" }}>
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "hsl(var(--brand-orange))" }}>
            {saving ? "Creating…" : "Create product"}
          </button>
        </div>
      </form>
    </div>
  );
}
