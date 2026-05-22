/**
 * Inline draft product card. Draft is LOCAL-ONLY until all required identity
 * fields are filled and the user clicks Save. Click Discard (or unmount) and
 * nothing is written to the DB. This is the only path to creating a product
 * (the modal flow has been removed).
 *
 * Required-to-commit identity fields:
 *   - supplier
 *   - subcategory
 *   - name
 *   - supplier_item_number suffix
 *   - production_days_min
 *
 * After commit, optional engine-critical specs (carton pack/L/W/H/weight)
 * may still be NULL — the live card will flag them with an amber "specs
 * incomplete" marker (no silent zeros).
 */
import { useEffect, useMemo, useState } from "react";
import { X, Save } from "lucide-react";
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

interface DraftProductCardProps {
  draftId: string;
  onCommitted: () => void;
  onDiscard: () => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#6B7280",
  marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "0.5px solid #D1D5DB",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 13,
  color: "#0E2849",
  background: "#FFFFFF",
  fontFamily: "inherit",
};

export function DraftProductCard({ draftId, onCommitted, onDiscard }: DraftProductCardProps) {
  const { suppliers, origins } = useMasterData();
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [saving, setSaving] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [name, setName] = useState("");
  const [variantName, setVariantName] = useState("");
  const [itemSuffix, setItemSuffix] = useState("");
  const [leadMin, setLeadMin] = useState("");
  const [leadMax, setLeadMax] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_categories")
        .select("id, name, code, parent_id")
        .order("name");
      if (cancelled) return;
      const subs = (data ?? []).filter((c) => c.parent_id && c.code && c.code.length === 3) as Subcategory[];
      setSubcategories(subs);
    })();
    return () => { cancelled = true; };
  }, []);

  const supplier = useMemo(() => suppliers.find((s) => s.id === supplierId) ?? null, [suppliers, supplierId]);
  const subcategory = useMemo(() => subcategories.find((s) => s.id === subcategoryId) ?? null, [subcategories, subcategoryId]);
  const supplierOrigin = useMemo(() => origins.find((o) => o.id === supplier?.origin_id) ?? null, [origins, supplier]);

  const canSave =
    !!supplier?.code &&
    !!supplier?.origin_id &&
    !!subcategory?.code &&
    name.trim().length > 0 &&
    itemSuffix.trim().length > 0 &&
    leadMin.trim().length > 0 &&
    Number.isFinite(parseInt(leadMin, 10)) &&
    parseInt(leadMin, 10) >= 1;

  const handleSave = async () => {
    if (!canSave || saving) return;
    if (!supplier || !supplier.code || !supplier.origin_id) return toast.error("Supplier missing code or origin");
    if (!supplierOrigin) return toast.error("Origin not found");
    const originLetter = originLetterFromCode(supplierOrigin.code);
    if (!originLetter) return toast.error(`Origin ${supplierOrigin.code} has no letter mapping`);
    if (!subcategory || !subcategory.code) return toast.error("Subcategory missing code");

    setSaving(true);
    try {
      const { data: existing, error: exErr } = await supabase
        .from("products")
        .select("primary_item_number");
      if (exErr) throw new Error(exErr.message);
      const nums = (existing ?? []).map((r) => r.primary_item_number).filter(Boolean) as string[];
      const seq = nextSequenceFor(subcategory.code, nums);
      const primaryItemNumber = composePrimaryItemNumber(subcategory.code, seq, originLetter);

      const cleanSuffix = itemSuffix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
      const supplierItemNumber = `${supplier.code}-${cleanSuffix}`;

      const leadMinNum = parseInt(leadMin, 10);
      const leadMaxRaw = leadMax.trim() ? parseInt(leadMax, 10) : null;
      const leadMaxNum = leadMaxRaw != null && Number.isFinite(leadMaxRaw) && leadMaxRaw >= leadMinNum ? leadMaxRaw : null;

      const insert = {
        name: name.trim(),
        supplier_id: supplier.id,
        origin_id: supplier.origin_id,
        subcategory_id: subcategory.id,
        primary_item_number: primaryItemNumber,
        supplier_item_number: supplierItemNumber,
        variant_name: variantName.trim() || null,
        production_days_min: leadMinNum,
        production_days_max: leadMaxNum,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("products").insert(insert as any);
      if (error) throw new Error(error.message);
      toast.success(`Created ${insert.name}`);
      onCommitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px dashed #E97817",
        borderRadius: 12,
        padding: "20px 22px",
        position: "relative",
      }}
      data-draft-id={draftId}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#C2410C",
              background: "#FEF3E2",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            Draft · finish this card to save
          </span>
          {!canSave && (
            <span style={{ fontSize: 11, color: "#6B7280" }}>
              Required: supplier, subcategory, name, item suffix, lead time min
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "0.5px solid #E5E7EB",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              color: "#6B7280",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            <X size={12} /> Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: canSave ? "#E97817" : "#E5E7EB",
              color: canSave ? "#FFFFFF" : "#9CA3AF",
              border: "none",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: canSave && !saving ? "pointer" : "not-allowed",
            }}
          >
            <Save size={12} /> {saving ? "Saving…" : "Save product"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>Supplier *</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle}>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : " — no code"}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Subcategory *</label>
          <select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} style={inputStyle}>
            <option value="">Select subcategory…</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Origin (auto from supplier)</label>
          <input readOnly value={supplierOrigin?.name ?? ""} placeholder="—" style={{ ...inputStyle, background: "#F9FAFB", color: "#6B7280" }} />
        </div>

        <div style={{ gridColumn: "1 / span 2" }}>
          <label style={labelStyle}>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Product name" />
        </div>
        <div>
          <label style={labelStyle}>Variant (optional)</label>
          <input value={variantName} onChange={(e) => setVariantName(e.target.value)} style={inputStyle} placeholder="e.g. SMALL" />
        </div>

        <div>
          <label style={labelStyle}>Supplier item suffix *</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>
              {supplier?.code ? `${supplier.code}-` : "{code}-"}
            </span>
            <input
              value={itemSuffix}
              onChange={(e) => setItemSuffix(e.target.value.toUpperCase())}
              style={inputStyle}
              placeholder="A1B2"
            />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Lead time min (days) *</label>
          <input type="number" min={1} value={leadMin} onChange={(e) => setLeadMin(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Lead time max (days)</label>
          <input type="number" min={1} value={leadMax} onChange={(e) => setLeadMax(e.target.value)} style={inputStyle} placeholder="Optional" />
        </div>
      </div>

      <p style={{ marginTop: 12, fontSize: 11, color: "#6B7280" }}>
        Carton pack, dimensions and weight can be filled after saving — the card will flag them as incomplete until they are set.
      </p>
    </div>
  );
}
