/**
 * AddProductSheet — BottomSheet drawer for creating a new product.
 *
 * Required: Subcategory, Supplier, Name. As Subcategory + Supplier are
 * selected the primary_item_number preview builds live:
 *   {subCode}{nextSequence}{originLetter}
 *
 * Blocks save when supplier has no origin_id assigned (origin letter
 * cannot be derived).
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sheet } from "@/components/leads/Sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useMasterData } from "@/hooks/useMasterData";
import { originLetterFromCode } from "@/lib/originLetter";
import { composePrimaryItemNumber, nextSequenceFor } from "@/lib/productItemNumber";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

interface Cat { id: string; parent_id: string | null; code: string | null; name: string }

export const AddProductSheet = ({ open, onClose, onCreated }: Props) => {
  const md = useMasterData();
  const [cats, setCats] = useState<Cat[]>([]);
  const [existingNumbers, setExistingNumbers] = useState<string[]>([]);

  const [subcategoryId, setSubcategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset when opened.
  useEffect(() => {
    if (!open) return;
    setSubcategoryId(""); setSupplierId(""); setName(""); setSaving(false);
    void (async () => {
      const [c, p] = await Promise.all([
        supabase.from("product_categories").select("id,parent_id,code,name").order("name"),
        supabase.from("products").select("primary_item_number"),
      ]);
      setCats((c.data ?? []) as Cat[]);
      setExistingNumbers(((p.data ?? []) as { primary_item_number: string }[]).map((r) => r.primary_item_number));
    })();
  }, [open]);

  const parents = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);
  const subcategoriesByParent = useMemo(() => {
    const m = new Map<string, Cat[]>();
    for (const c of cats) {
      if (!c.parent_id) continue;
      const arr = m.get(c.parent_id) ?? [];
      arr.push(c);
      m.set(c.parent_id, arr);
    }
    return m;
  }, [cats]);

  const subcategory = cats.find((c) => c.id === subcategoryId) ?? null;
  const supplier = md.suppliers.find((s) => s.id === supplierId) ?? null;
  const supplierOrigin = supplier?.origin_id ? md.origins.find((o) => o.id === supplier.origin_id) : null;
  const originLetter = originLetterFromCode(supplierOrigin?.code);

  const previewItemNumber = (() => {
    if (!subcategory?.code || !originLetter) return null;
    const seq = nextSequenceFor(subcategory.code, existingNumbers);
    return composePrimaryItemNumber(subcategory.code, seq, originLetter);
  })();

  const supplierHasOriginIssue = supplier && !originLetter;

  const canSave = !!subcategory?.code && !!supplier && !!originLetter && !!name.trim() && !saving;

  const handleSave = async () => {
    if (!canSave || !subcategory?.code || !supplier || !originLetter) return;
    setSaving(true);
    // Re-derive sequence at save time in case another tab created a product.
    const { data: latest } = await supabase.from("products").select("primary_item_number");
    const numbers = ((latest ?? []) as { primary_item_number: string }[]).map((r) => r.primary_item_number);
    const seq = nextSequenceFor(subcategory.code, numbers);
    const primary = composePrimaryItemNumber(subcategory.code, seq, originLetter);

    const { data, error } = await supabase.from("products").insert({
      primary_item_number: primary,
      name: name.trim(),
      subcategory_id: subcategory.id,
      origin_id: supplier.origin_id!,
      supplier_id: supplier.id,
    }).select("id").single();
    setSaving(false);
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    toast.success(`Created ${primary}`);
    onCreated?.((data as { id: string }).id);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} eyebrow="Catalog" title="Add Product">
      <div className="space-y-5">
        <div>
          <Label className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">Subcategory</Label>
          <select
            value={subcategoryId}
            onChange={(e) => setSubcategoryId(e.target.value)}
            className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          >
            <option value="">— Select subcategory —</option>
            {parents.map((p) => (
              <optgroup key={p.id} label={`${p.code ?? "??"} ${p.name}`}>
                {(subcategoriesByParent.get(p.id) ?? []).map((s) => (
                  <option key={s.id} value={s.id}>[{s.code ?? "???"}] {s.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">Supplier</Label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          >
            <option value="">— Select supplier —</option>
            {[...md.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
              const o = s.origin_id ? md.origins.find((x) => x.id === s.origin_id) : null;
              return (
                <option key={s.id} value={s.id}>
                  {s.code ? `[${s.code}] ` : ""}{s.name}{o ? ` (${o.name})` : ""}
                </option>
              );
            })}
          </select>
          {supplierHasOriginIssue && (
            <p className="mt-1.5 text-[12px]" style={{ color: "hsl(var(--urgent))" }}>
              Supplier must have an origin assigned. Set it on the Suppliers page.
            </p>
          )}
        </div>

        <div>
          <Label className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" className="mt-1.5" />
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">Primary Item Number</div>
          <div className="text-[20px] font-mono tracking-wider" style={{ color: "hsl(var(--brand-navy))" }}>
            {previewItemNumber ?? <span className="text-muted-foreground italic text-[14px] font-sans">Pick subcategory + supplier</span>}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}
            style={{ background: "hsl(var(--brand-orange))", color: "white" }}>
            {saving ? "Creating…" : "Create Product"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
