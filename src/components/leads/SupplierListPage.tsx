/**
 * Suppliers master list — spreadsheet-style with inline editing.
 *
 * Mirrors the Customers page interaction model: every cell is click-to-edit.
 * Add Supplier opens the existing InlineAdd BottomSheet (kind="supplier").
 * Three-dots row menu provides Delete only.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { InlineAdd, OriginAddSheet } from "@/components/leads/EntityPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMasterData, type SupplierRecord } from "@/hooks/useMasterData";
import { EditableText, EditableSelect } from "@/components/leads/CustomerListPage";
import type { ShippingMode } from "@/data/pipelines";

const WEIGHT_OPTIONS = ["kg", "lbs"] as const;
const VOLUME_OPTIONS = ["cbm", "cuft"] as const;
const SHIPPING_OPTIONS = ["", "Air", "Ocean", "Local"] as const;

export const SupplierListPage = () => {
  const navigate = useNavigate();
  const md = useMasterData();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SupplierRecord | null>(null);

  const originById = useMemo(() => new Map(md.origins.map((o) => [o.id, o.name])), [md.origins]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return md.suppliers
      .filter((s) => {
        if (!term) return true;
        const oname = s.origin_id ? (originById.get(s.origin_id) ?? "") : "";
        return s.name.toLowerCase().includes(term)
          || (s.code ?? "").toLowerCase().includes(term)
          || oname.toLowerCase().includes(term)
          || (s.country ?? "").toLowerCase().includes(term)
          || (s.notes ?? "").toLowerCase().includes(term);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [md.suppliers, q, originById]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const usage = md.supplierUsage(confirmDelete.id, confirmDelete.legacy_id);
    if (usage > 0) {
      toast.error(`Cannot delete — used in ${usage} project${usage === 1 ? "" : "s"}.`);
      setConfirmDelete(null);
      return;
    }
    try {
      await md.deleteSupplier(confirmDelete.id);
      toast.success(`Supplier "${confirmDelete.name}" deleted`);
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
    setConfirmDelete(null);
  };

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        <header
          className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
            <button onClick={() => navigate("/")} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted/50">
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Master data</div>
              <h1 className="text-[22px] leading-tight font-light tracking-tight truncate" style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}>
                Suppliers <span className="text-muted-foreground font-light">· {md.suppliers.length}</span>
              </h1>
            </div>
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{ background: "hsl(var(--brand-orange))", color: "white", minHeight: 40 }}
            >
              <Plus className="h-4 w-4" /> Add Supplier
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
          <div className="relative my-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search suppliers, codes, origin, notes…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }}
            />
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-x-auto">
            <table className="w-full text-[13px] border-collapse min-w-[900px]">
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                  <Th>Name</Th>
                  <Th>Code</Th>
                  <Th>Origin</Th>
                  <Th>Weight</Th>
                  <Th>Volume</Th>
                  <Th>Default mode</Th>
                  <Th>Notes</Th>
                  <Th align="right">Used in</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <SupplierRow
                    key={s.id}
                    supplier={s}
                    onDelete={() => setConfirmDelete(s)}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
                      {q ? "No matches." : "No suppliers yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        <InlineAdd
          open={adding}
          kind="supplier"
          onClose={() => setAdding(false)}
          onCreated={() => setAdding(false)}
        />

        <ConfirmDialog
          open={!!confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          title={confirmDelete ? `Delete ${confirmDelete.name}?` : ""}
          description={(() => {
            if (!confirmDelete) return "";
            const usage = md.supplierUsage(confirmDelete.id, confirmDelete.legacy_id);
            if (usage > 0) return `Cannot delete — used in ${usage} project${usage === 1 ? "" : "s"}. Reassign or merge first.`;
            return "This cannot be undone.";
          })()}
          confirmLabel="Delete"
          destructive
          onConfirm={handleDelete}
        />
      </div>
    </DesktopAppShell>
  );
};

const Th = ({ children, className, align }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) => (
  <th
    className={cn(
      "text-[10px] uppercase tracking-[0.18em] font-semibold px-3 py-2.5",
      align === "right" ? "text-right" : "text-left",
      className,
    )}
    style={{ color: "hsl(var(--brand-navy) / 0.65)" }}
  >
    {children}
  </th>
);

const Td = ({ children, className, align }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) => (
  <td className={cn("px-3 py-2 text-[13px] align-middle", align === "right" && "text-right tabular-nums", className)} style={{ color: "hsl(var(--brand-navy))" }}>
    {children}
  </td>
);

// ─── Row ─────────────────────────────────────────────────────────────
const SupplierRow = ({ supplier, onDelete }: { supplier: SupplierRecord; onDelete: () => void }) => {
  const md = useMasterData();
  const [nameRevert, setNameRevert] = useState(0);
  const [codeRevert, setCodeRevert] = useState(0);
  const usage = md.supplierUsage(supplier.id, supplier.legacy_id);

  const updateName = async (v: string) => {
    const t = v.trim();
    if (!t) { toast.error("Name is required"); setNameRevert((n) => n + 1); return; }
    if (t.toLowerCase() === supplier.name.toLowerCase()) { setNameRevert((n) => n + 1); return; }
    const dup = md.suppliers.find((s) => s.id !== supplier.id && s.name.toLowerCase() === t.toLowerCase());
    if (dup) { toast.error(`A supplier named "${dup.name}" already exists.`); setNameRevert((n) => n + 1); return; }
    try { await md.updateSupplier(supplier.id, { name: t }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); setNameRevert((n) => n + 1); }
  };

  const updateCode = async (v: string) => {
    const raw = (v ?? "").trim().toUpperCase();
    const cleaned = raw.replace(/[^A-Z0-9]/g, "").slice(0, 3);
    const current = (supplier.code ?? "").toUpperCase();
    if (cleaned === current) { setCodeRevert((n) => n + 1); return; }
    if (cleaned && cleaned.length !== 3) {
      toast.error("Code must be exactly 3 letters or digits");
      setCodeRevert((n) => n + 1);
      return;
    }
    if (cleaned) {
      const dup = md.suppliers.find((s) => s.id !== supplier.id && (s.code ?? "").toUpperCase() === cleaned);
      if (dup) { toast.error(`Code already in use by ${dup.name}`); setCodeRevert((n) => n + 1); return; }
    }
    try { await md.updateSupplier(supplier.id, { code: cleaned || null }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); setCodeRevert((n) => n + 1); }
  };

  const updateOrigin = async (id: string) => {
    try { await md.updateSupplier(supplier.id, { origin_id: id || null }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); }
  };
  const updateWeight = async (v: string) => {
    try { await md.updateSupplier(supplier.id, { weight_unit: (v || "kg") as any }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); }
  };
  const updateVolume = async (v: string) => {
    try { await md.updateSupplier(supplier.id, { volume_unit: (v || "cbm") as any }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); }
  };
  const updateMode = async (v: string) => {
    try { await md.updateSupplier(supplier.id, { default_shipping_mode: (v || null) as ShippingMode | null }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); }
  };
  const updateNotes = async (v: string) => {
    const t = v.trim();
    if ((t || null) === (supplier.notes ?? null)) return;
    try { await md.updateSupplier(supplier.id, { notes: t || null }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); }
  };

  return (
    <tr className="hover:bg-muted/20 transition-colors" style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.07)" }}>
      <Td><EditableText key={`name-${nameRevert}`} value={supplier.name} onSave={updateName} bold /></Td>
      <Td>
        <span className="font-mono tracking-wider text-[12px]">
          <EditableText
            key={`code-${codeRevert}`}
            value={supplier.code ?? ""}
            placeholder="—"
            onSave={updateCode}
          />
        </span>
      </Td>
      <Td>
        <OriginSelect
          value={supplier.origin_id ?? ""}
          fallback={supplier.country}
          onSave={updateOrigin}
        />
      </Td>
      <Td>
        <EditableSelect
          value={supplier.weight_unit ?? "kg"}
          options={WEIGHT_OPTIONS}
          onSave={updateWeight}
        />
      </Td>
      <Td>
        <EditableSelect
          value={supplier.volume_unit ?? "cbm"}
          options={VOLUME_OPTIONS}
          onSave={updateVolume}
        />
      </Td>
      <Td>
        <EditableSelect
          value={supplier.default_shipping_mode ?? ""}
          options={SHIPPING_OPTIONS}
          onSave={updateMode}
          placeholder="—"
        />
      </Td>
      <Td>
        <EditableText value={supplier.notes ?? ""} placeholder="—" onSave={updateNotes} />
      </Td>
      <Td align="right">
        <span className={cn("text-[12px]", usage === 0 && "text-muted-foreground")}>
          {usage} project{usage === 1 ? "" : "s"}
        </span>
      </Td>
      <Td className="w-8">
        <Popover>
          <PopoverTrigger asChild>
            <button aria-label="Row actions" className="p-1 rounded hover:bg-muted/50" onClick={(e) => e.stopPropagation()}>
              <MoreVertical className="h-4 w-4" style={{ color: "hsl(var(--brand-navy) / 0.6)" }} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button
              onClick={onDelete}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-destructive/10"
              style={{ color: "hsl(var(--urgent))" }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </PopoverContent>
        </Popover>
      </Td>
    </tr>
  );
};

// ─── Origin select with "+ Add new origin" affordance ─────────────────
const ADD_NEW_ORIGIN = "__add_new_origin__";

const OriginSelect = ({
  value, fallback, onSave,
}: { value: string; fallback?: string | null; onSave: (v: string) => void }) => {
  const md = useMasterData();
  const [adding, setAdding] = useState(false);
  const options = useMemo(
    () => [{ value: "", label: fallback ? `— (${fallback})` : "—" },
           ...[...md.origins].sort((a, b) => a.name.localeCompare(b.name)).map((o) => ({ value: o.id, label: o.name }))],
    [md.origins, fallback],
  );
  return (
    <>
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === ADD_NEW_ORIGIN) { setAdding(true); return; }
          onSave(v);
        }}
        className={cn(
          "w-full px-1.5 py-0.5 rounded text-[13px] bg-transparent hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)] cursor-pointer",
          !value && "italic text-muted-foreground",
        )}
        style={{ minHeight: 28, color: value ? "hsl(var(--brand-navy))" : undefined }}
        title={!value && fallback ? `Legacy country: ${fallback}` : undefined}
      >
        {options.map((o) => <option key={o.value || "_"} value={o.value}>{o.label}</option>)}
        <option disabled>──────────</option>
        <option value={ADD_NEW_ORIGIN} style={{ color: "hsl(var(--brand-orange))", fontWeight: 600 }}>+ Add new origin</option>
      </select>
      <OriginAddSheet
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => { setAdding(false); onSave(id); }}
      />
    </>
  );
};
