/**
 * Suppliers master list — spreadsheet-style with inline editing.
 *
 * Mirrors the Customers page interaction model: every cell is click-to-edit.
 * Add Supplier opens the existing InlineAdd BottomSheet (kind="supplier").
 * Three-dots row menu provides Delete only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import { sanitizeSupplierCodeInput, isSupplierCodeChar, validateSupplierCode } from "@/lib/supplierCode";
import type { ShippingMode } from "@/data/pipelines";

const UNIT_SYSTEM_OPTIONS = ["metric", "imperial"] as const;
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
                  <Th>Units</Th>
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
                    <td colSpan={8} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
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

  const saveCode = async (next: string | null) => {
    if ((next ?? null) === (supplier.code ?? null)) return;
    try { await md.updateSupplier(supplier.id, { code: next }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); throw err; }
  };

  const updateOrigin = async (id: string) => {
    try { await md.updateSupplier(supplier.id, { origin_id: id || null }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); }
  };
  const updateUnitSystem = async (v: string) => {
    const next = (v === "imperial" ? "imperial" : "metric") as "metric" | "imperial";
    if (next === (supplier.unit_system ?? "metric")) return;
    try { await md.updateSupplier(supplier.id, { unit_system: next }); }
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
        <EditableCode
          supplierId={supplier.id}
          value={supplier.code ?? ""}
          onSave={saveCode}
        />
      </Td>
      <Td>
        <OriginSelect
          value={supplier.origin_id ?? ""}
          fallback={supplier.country}
          onSave={updateOrigin}
        />
      </Td>
      <Td>
        <UnitSystemCell
          value={(supplier.unit_system ?? "metric") as "metric" | "imperial"}
          onSave={updateUnitSystem}
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

// ─── Unit system chip + inline editor ─────────────────────────────────
const UnitSystemCell = ({
  value,
  onSave,
}: { value: "metric" | "imperial"; onSave: (v: string) => void }) => {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <select
        autoFocus
        value={value}
        onChange={(e) => { onSave(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        className="rounded-md border border-border bg-card px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-navy)/0.4)]"
      >
        <option value="metric">metric (kg, cm)</option>
        <option value="imperial">imperial (lbs, in)</option>
      </select>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      style={{
        background: "#E5EAF1",
        color: "#0E2849",
        padding: "1px 7px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        cursor: "pointer",
      }}
    >
      {value}
    </button>
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

// ─── Editable supplier-code cell ────────────────────────────────────
// Restricts keystrokes to A-Z/0-9, auto-uppercases, caps at 3 chars.
// Inline error UI (red border + message). Esc reverts. Blur/Enter saves
// only when valid. Allows clearing back to NULL.
const EditableCode = ({
  supplierId, value, onSave,
}: {
  supplierId: string;
  value: string;
  onSave: (next: string | null) => Promise<void>;
}) => {
  const md = useMasterData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      setError(null);
      setTimeout(() => ref.current?.select(), 0);
    }
  }, [editing, value]);

  // Live-validate the draft so the error message updates as the user types.
  useEffect(() => {
    if (!editing) return;
    const cleaned = sanitizeSupplierCodeInput(draft);
    if (!cleaned) { setError(null); return; }
    if (cleaned.length !== 3) { setError("Code must be exactly 3 characters"); return; }
    const dup = md.suppliers.find(
      (s) => s.id !== supplierId && (s.code ?? "").toUpperCase() === cleaned,
    );
    setError(dup ? `Code already in use by ${dup.name}` : null);
  }, [draft, editing, md.suppliers, supplierId]);

  const commit = async () => {
    const result = validateSupplierCode(draft, md.suppliers, supplierId);
    if (result.ok === false) {
      setError(result.error);
      ref.current?.focus();
      return;
    }
    setEditing(false);
    setError(null);
    if ((result.value ?? null) === (value || null)) return;
    try { await onSave(result.value); }
    catch { /* parent toasted */ }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-0.5">
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(sanitizeSupplierCodeInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); return; }
            if (e.key === "Escape") {
              setDraft(value); setError(null); setEditing(false);
              return;
            }
            if (e.key.length === 1 && !isSupplierCodeChar(e.key) && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
            }
          }}
          onBlur={commit}
          maxLength={3}
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          className={cn(
            "w-[64px] px-1.5 py-0.5 rounded border bg-background text-[12px] font-mono tracking-wider uppercase focus:outline-none focus:ring-2",
            error
              ? "border-[hsl(var(--urgent))] focus:ring-[hsl(var(--urgent)/0.4)]"
              : "border-[hsl(var(--brand-navy)/0.3)] focus:ring-[hsl(var(--brand-navy)/0.4)]",
          )}
        />
        {error && (
          <span className="text-[10px]" style={{ color: "hsl(var(--urgent))" }}>{error}</span>
        )}
      </div>
    );
  }

  const isEmpty = !value;
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "w-full text-left px-1.5 py-0.5 rounded hover:bg-muted/40 truncate font-mono tracking-wider text-[12px]",
        isEmpty && "italic text-muted-foreground",
      )}
      style={{ minHeight: 28 }}
    >
      {value || "—"}
    </button>
  );
};
