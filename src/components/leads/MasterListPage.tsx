/**
 * Generic master-data list management page. Used by 4 routes:
 *   /customers · /suppliers · /team · /products
 *
 * Layout (mobile-first, matches existing app shell):
 *   ← Back · Title · count               + Add new
 *   ────────────────────────────────────────────────
 *   [search]
 *   ────────────────────────────────────────────────
 *   [Sortable column headers]
 *   …rows… (tap row → entity detail/edit sheet)
 *
 * Merge feature is intentionally deferred to a follow-up pass per the
 * locked scope ("Phase 1: pickers + list pages, Merge in pass 2").
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, ChevronUp, ChevronDown, Trash2, MoreVertical, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/leads/Sheet";
import { useMasterData, EntityKind } from "@/hooks/useMasterData";
import { InlineAdd, CodedSelect } from "@/components/leads/EntityPicker";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { BottomSheet } from "@/components/leads/EditorSheets";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ShippingMode } from "@/data/pipelines";

interface Column { key: string; label: string; align?: "left" | "right" }
interface Row { id: string; cells: React.ReactNode[]; usage: number; raw: any }

interface Props { kind: EntityKind }

const KIND_CONFIG: Record<EntityKind, { title: string; subtitle: string; eyebrow: string }> = {
  customer: { title: "Customers", subtitle: "Master list", eyebrow: "Master data" },
  supplier: { title: "Suppliers", subtitle: "Master list", eyebrow: "Master data" },
  team:     { title: "Team",      subtitle: "Sales reps & internal owners", eyebrow: "Master data" },
  product:  { title: "Products",  subtitle: "Line item catalogue (placeholder)", eyebrow: "Master data" },
};

export const MasterListPage = ({ kind }: Props) => {
  const navigate = useNavigate();
  const md = useMasterData();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string; usage: number } | null>(null);

  // ─── Build columns + rows per kind ─────────────────────────────────────
  const { columns, rows } = useMemo<{ columns: Column[]; rows: Row[] }>(() => {
    const term = q.trim().toLowerCase();
    if (kind === "customer") {
      const cols: Column[] = [
        { key: "name", label: "Name" },
        { key: "country", label: "Country" },
        { key: "usage", label: "Used in", align: "right" },
      ];
      const r: Row[] = md.customers
        .filter((c) => !term || c.name.toLowerCase().includes(term) || (c.country ?? "").toLowerCase().includes(term))
        .map((c) => ({
          id: c.id, raw: c,
          usage: md.customerUsage(c.name),
          cells: [c.name, c.country ?? "—", md.customerUsage(c.name)],
        }));
      return { columns: cols, rows: r };
    }
    if (kind === "supplier") {
      const cols: Column[] = [
        { key: "name", label: "Name" },
        { key: "code", label: "Code" },
        { key: "origin", label: "Origin" },
        { key: "unit_system", label: "Units" },
        { key: "default_shipping_mode", label: "Default mode" },
        { key: "usage", label: "Used in", align: "right" },
      ];
      const originById = new Map(md.origins.map((o) => [o.id, o.name]));
      const r: Row[] = md.suppliers
        .filter((s) => {
          if (!term) return true;
          const oname = s.origin_id ? (originById.get(s.origin_id) ?? "") : "";
          return s.name.toLowerCase().includes(term)
            || (s.code ?? "").toLowerCase().includes(term)
            || oname.toLowerCase().includes(term)
            || (s.country ?? "").toLowerCase().includes(term);
        })
        .map((s) => {
          const oname = s.origin_id ? originById.get(s.origin_id) : null;
          const originCell = oname
            ? <span>{oname}</span>
            : <span className="italic text-muted-foreground/70">{s.country ?? "—"}</span>;
          const codeCell = s.code
            ? <span className="font-mono text-[12px] tracking-wider" style={{ color: "hsl(var(--brand-navy))" }}>{s.code}</span>
            : <span className="text-muted-foreground/60">—</span>;
          return {
            id: s.id, raw: s,
            usage: md.supplierUsage(s.id, s.legacy_id),
            cells: [s.name, codeCell, originCell, s.weight_unit ?? "kg", s.volume_unit ?? "cbm", s.default_shipping_mode ?? "—", md.supplierUsage(s.id, s.legacy_id)],
          };
        });
      return { columns: cols, rows: r };
    }
    if (kind === "team") {
      const cols: Column[] = [
        { key: "initials", label: "Initials" },
        { key: "full_name", label: "Full name" },
        { key: "role", label: "Role" },
        { key: "usage", label: "Used in", align: "right" },
      ];
      const r: Row[] = md.teamMembers
        .filter((t) => !term || t.initials.toLowerCase().includes(term) || t.full_name.toLowerCase().includes(term))
        .map((t) => ({
          id: t.id, raw: t,
          usage: md.teamUsage(t.initials),
          cells: [t.initials, t.full_name, t.role ?? "—", md.teamUsage(t.initials)],
        }));
      return { columns: cols, rows: r };
    }
    // product
    const cols: Column[] = [
      { key: "name", label: "Name" },
      { key: "default_unit", label: "Unit" },
      { key: "usage", label: "Used in", align: "right" },
    ];
    const r: Row[] = md.products
      .filter((p) => !term || p.name.toLowerCase().includes(term))
      .map((p) => ({
        id: p.id, raw: p,
        usage: md.productUsage(p.name),
        cells: [p.name, p.default_unit ?? "—", md.productUsage(p.name)],
      }));
    return { columns: cols, rows: r };
  }, [kind, q, md]);

  const sorted = useMemo(() => {
    const colIdx = columns.findIndex((c) => c.key === sortKey);
    if (colIdx < 0) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    const originById = new Map(md.origins.map((o) => [o.id, o.name]));
    const sortVal = (r: Row): string | number => {
      if (sortKey === "usage") return r.usage;
      if (sortKey === "origin") {
        const oname = r.raw.origin_id ? originById.get(r.raw.origin_id) : null;
        return (oname ?? r.raw.country ?? "").toString().toLowerCase();
      }
      const c = r.cells[colIdx];
      if (typeof c === "number") return c;
      if (typeof c === "string") return c.toLowerCase();
      return String(r.raw[sortKey] ?? "").toLowerCase();
    };
    return [...rows].sort((a, b) => {
      const av = sortVal(a); const bv = sortVal(b);
      if (typeof av === "number" && typeof bv === "number") return dir * (av - bv);
      return dir * String(av).localeCompare(String(bv));
    });
  }, [rows, columns, sortKey, sortDir, md.origins]);

  const onSortClick = (key: string) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const cfg = KIND_CONFIG[kind];

  const handleDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.usage > 0) {
      toast.error(`Cannot delete — used in ${confirmDelete.usage} project${confirmDelete.usage === 1 ? "" : "s"}.`);
      setConfirmDelete(null);
      return;
    }
    const snapshot = rows.find((r) => r.id === confirmDelete.id)?.raw;
    const label = confirmDelete.label;
    try {
      if (kind === "customer") await md.deleteCustomer(confirmDelete.id);
      else if (kind === "supplier") await md.deleteSupplier(confirmDelete.id);
      else if (kind === "team") await md.deleteTeamMember(confirmDelete.id);
      else await md.deleteProduct(confirmDelete.id);

      const kindLabel =
        kind === "customer" ? "Customer" :
        kind === "supplier" ? "Supplier" :
        kind === "team" ? "Team member" : "Product";

      toast.success(`${kindLabel} "${label}" deleted`, {
        duration: 8000,
        action: snapshot ? {
          label: "Undo",
          onClick: async () => {
            try {
              if (kind === "customer") await md.addCustomer(snapshot);
              else if (kind === "supplier") await md.addSupplier(snapshot);
              else if (kind === "team") await md.addTeamMember(snapshot);
              else await md.addProduct(snapshot);
              toast.success(`${label} restored`);
            } catch (err: any) {
              toast.error(err?.message ?? "Restore failed");
            }
          },
        } : undefined,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
    setConfirmDelete(null);
  };

  const editingRow = editingId ? rows.find((r) => r.id === editingId) : null;

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
      <div className="lg:flex-1 lg:min-w-0">
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 backdrop-blur-md border-b"
        style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            aria-label="Back"
            className="p-2 -ml-2 rounded-full hover:bg-muted/50"
          >
            <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">{cfg.eyebrow}</div>
            <h1
              className="text-[22px] leading-tight font-light tracking-tight truncate"
              style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}
            >
              {cfg.title} <span className="text-muted-foreground font-light">· {rows.length}</span>
            </h1>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors"
            style={{ background: "hsl(var(--brand-orange))", color: "white", minHeight: 40 }}
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {/* Search */}
        <div className="relative my-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${cfg.title.toLowerCase()}…`}
            className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ minHeight: 48 }}
          />
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "text-[10px] uppercase tracking-[0.18em] font-semibold px-3 py-2.5 select-none",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                    style={{ color: "hsl(var(--brand-navy) / 0.65)" }}
                  >
                    <button
                      onClick={() => onSortClick(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground transition-colors",
                        c.align === "right" && "justify-end",
                      )}
                    >
                      {c.label}
                      {sortKey === c.key && (
                        sortDir === "asc"
                          ? <ChevronUp className="h-3 w-3" />
                          : <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-muted/20 transition-colors"
                  style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.07)" }}
                >
                  {r.cells.map((cell, i) => {
                    const col = columns[i];
                    const isUsage = col.key === "usage";
                    const isEmpty = cell === "—" || cell === null || cell === undefined || cell === "";
                    return (
                      <td
                        key={i}
                        className={cn(
                          "px-3 py-2.5 text-[13px] align-middle",
                          col.align === "right" && "text-right tabular",
                          i === 0 ? "font-medium" : "",
                          isEmpty && !isUsage && "text-muted-foreground italic",
                        )}
                        style={{ color: i === 0 ? "hsl(var(--brand-navy))" : undefined }}
                      >
                        {isUsage ? `${cell} project${cell === 1 ? "" : "s"}` : cell}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 align-middle w-8">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="p-1 rounded hover:bg-muted/50"
                          aria-label="Row actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" style={{ color: "hsl(var(--brand-navy) / 0.6)" }} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-44 p-1">
                        <button
                          onClick={() => setEditingId(r.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-muted/50"
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </button>
                        <div className="my-1 h-px" style={{ backgroundColor: "hsl(var(--brand-navy) / 0.1)" }} />
                        <button
                          onClick={() => setConfirmDelete({ id: r.id, label: r.cells[0] as string, usage: r.usage })}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-destructive/10"
                          style={{ color: "hsl(var(--urgent))" }}
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </PopoverContent>
                    </Popover>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
                    {q ? "No matches." : `No ${cfg.title.toLowerCase()} yet.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Add new */}
      <InlineAdd
        open={adding}
        kind={kind}
        onClose={() => setAdding(false)}
        onCreated={() => setAdding(false)}
      />

      {/* Edit / detail sheet */}
      {editingRow && (
        <EditEntitySheet
          kind={kind}
          row={editingRow}
          onClose={() => setEditingId(null)}
          onDelete={() => {
            const label = editingRow.cells[0] as string;
            setConfirmDelete({ id: editingRow.id, label, usage: editingRow.usage });
            setEditingId(null);
          }}
        />
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        title={confirmDelete ? `Delete ${confirmDelete.label}?` : ""}
        description={
          confirmDelete && confirmDelete.usage > 0
            ? `Used in ${confirmDelete.usage} project${confirmDelete.usage === 1 ? "" : "s"}. Reassign or merge those projects first.`
            : "This cannot be undone."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
      </div>
      </div>
    </DesktopAppShell>
  );
};

// ─── Edit sheet (inline form bound to selected entity) ───────────────────
interface EditProps {
  kind: EntityKind;
  row: Row;
  onClose: () => void;
  onDelete: () => void;
}
const EditEntitySheet = ({ kind, row, onClose, onDelete }: EditProps) => {
  const md = useMasterData();
  const ent = row.raw;
  const [form, setForm] = useState<Record<string, any>>(() => ({ ...ent }));
  const [saving, setSaving] = useState(false);

  const labelCls = "block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5";
  const inputCls = "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]";
  const setField = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      if (kind === "customer") {
        await md.updateCustomer(ent.id, {
          name: form.name,
          country: (form.country || "Local") as any,
          incoterms: (form.incoterms || null) as any,
        });
      } else if (kind === "supplier") {
        const codeRaw = (form.code ?? "").trim().toUpperCase();
        if (codeRaw) {
          if (!/^[A-Z0-9]{3}$/.test(codeRaw)) {
            toast.error("Code must be exactly 3 letters or digits");
            setSaving(false);
            return;
          }
          const dup = md.suppliers.find(
            (s) => s.id !== ent.id && (s.code ?? "").toUpperCase() === codeRaw,
          );
          if (dup) {
            toast.error(`Code already in use by ${dup.name}`);
            setSaving(false);
            return;
          }
        }
        await md.updateSupplier(ent.id, {
          name: form.name,
          code: codeRaw || null,
          origin_id: form.origin_id || null,
          unit_system: (form.unit_system === "imperial" ? "imperial" : "metric"),
          default_shipping_mode: form.default_shipping_mode || null, notes: form.notes || null,
        });
      } else if (kind === "team") {
        await md.updateTeamMember(ent.id, {
          initials: form.initials, full_name: form.full_name,
          role: form.role || null, email: form.email || null,
        });
      } else {
        await md.updateProduct(ent.id, {
          name: form.name, default_unit: form.default_unit || null, notes: form.notes || null,
        });
      }
      toast.success("Saved");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    }
    setSaving(false);
  };

  const titles: Record<EntityKind, string> = {
    customer: "Edit customer", supplier: "Edit supplier",
    team: "Edit team member", product: "Edit product",
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={titles[kind]}
      onSave={submit}
      saveDisabled={saving}
      saveLabel="Save"
    >
      <div className="space-y-3">
        {kind === "customer" && (
          <>
            <Field label="Name"><input className={inputCls} style={{ minHeight: 48 }} value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} /></Field>
            <Field label="Country">
              <select className={inputCls} style={{ minHeight: 48 }} value={form.country ?? "Local"} onChange={(e) => setField("country", e.target.value)}>
                <option value="Local">Local</option>
                <option value="Regional">Regional</option>
              </select>
            </Field>
            <Field label="Incoterms">
              <select className={inputCls} style={{ minHeight: 48 }} value={form.incoterms ?? ""} onChange={(e) => setField("incoterms", e.target.value || null)}>
                <option value="">—</option>
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
                <option value="LDP">LDP</option>
                <option value="LDF">LDF</option>
              </select>
            </Field>
          </>
        )}
        {kind === "supplier" && (
          <>
            <Field label="Name"><input className={inputCls} style={{ minHeight: 48 }} value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} /></Field>
            <Field label="Code">
              <input
                className={inputCls}
                style={{ minHeight: 48, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: "0.08em" }}
                value={form.code ?? ""}
                maxLength={3}
                onChange={(e) => setField("code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3))}
                placeholder="SAD"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Three-character supplier code (e.g. SAD for Shanghai Admax). Optional.</p>
            </Field>
            <Field label="Origin">
              <CodedSelect
                kind="origin"
                value={form.origin_id ?? ""}
                onChange={(id) => setField("origin_id", id || null)}
                className={inputCls}
                style={{ minHeight: 48 }}
                fallbackHint={!form.origin_id && form.country ? `Legacy country: ${form.country}` : null}
              />
            </Field>
            <Field label="Unit system">
              <div className="flex gap-2">
                {(["metric", "imperial"] as const).map((opt) => {
                  const active = (form.unit_system ?? "metric") === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setField("unit_system", opt)}
                      className={inputCls}
                      style={{
                        flex: 1,
                        minHeight: 48,
                        textAlign: "center",
                        textTransform: "uppercase",
                        fontSize: 12,
                        letterSpacing: "0.06em",
                        fontWeight: active ? 600 : 400,
                        background: active ? "#E5EAF1" : undefined,
                        color: active ? "#0E2849" : undefined,
                        cursor: "pointer",
                      }}
                    >
                      {opt === "metric" ? "Metric (kg, cm)" : "Imperial (lbs, in)"}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Default shipping">
              <select className={inputCls} style={{ minHeight: 48 }} value={form.default_shipping_mode ?? ""} onChange={(e) => setField("default_shipping_mode", e.target.value as ShippingMode || null)}>
                <option value="">—</option><option value="Air">Air</option><option value="Ocean">Ocean</option><option value="Local">Local</option>
              </select>
            </Field>
            <Field label="Notes"><textarea className={inputCls} rows={3} value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} /></Field>
          </>
        )}
        {kind === "team" && (
          <>
            <Field label="Initials"><input className={inputCls} style={{ minHeight: 48 }} value={form.initials ?? ""} onChange={(e) => setField("initials", e.target.value.toUpperCase())} /></Field>
            <Field label="Full name"><input className={inputCls} style={{ minHeight: 48 }} value={form.full_name ?? ""} onChange={(e) => setField("full_name", e.target.value)} /></Field>
            <Field label="Role">
              <select className={inputCls} style={{ minHeight: 48 }} value={form.role ?? ""} onChange={(e) => setField("role", e.target.value || null)}>
                <option value="">—</option><option value="Sales">Sales</option><option value="Production">Production</option>
                <option value="Finance">Finance</option><option value="Admin">Admin</option><option value="Mixed">Mixed</option>
              </select>
            </Field>
            <Field label="Email"><input className={inputCls} style={{ minHeight: 48 }} value={form.email ?? ""} onChange={(e) => setField("email", e.target.value)} /></Field>
          </>
        )}
        {kind === "product" && (
          <>
            <Field label="Name"><input className={inputCls} style={{ minHeight: 48 }} value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} /></Field>
            <Field label="Default unit"><input className={inputCls} style={{ minHeight: 48 }} value={form.default_unit ?? ""} onChange={(e) => setField("default_unit", e.target.value)} /></Field>
            <Field label="Notes"><textarea className={inputCls} rows={3} value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} /></Field>
          </>
        )}

        <div className="pt-2 border-t border-border/60">
          <div className="text-[11px] text-muted-foreground mb-2">
            Used in {row.usage} project{row.usage === 1 ? "" : "s"}.
          </div>
          <button
            onClick={onDelete}
            disabled={row.usage > 0}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-xl border text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: "hsl(var(--urgent) / 0.4)", color: "hsl(var(--urgent))", minHeight: 48 }}
            title={row.usage > 0 ? `Cannot delete — used in ${row.usage} projects. Reassign or merge first.` : ""}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">{label}</label>
    {children}
  </div>
);
