/**
 * Product Categories — parent/child rendering like Customers/Buyers.
 *
 * Top-level categories (parent_id = null) render as bold rows; subcategories
 * (parent_id = parent.id) render nested underneath with indented Name.
 *
 * CODE column (leftmost-data) is inline-editable using the shared
 * src/lib/categoryCode.ts helpers — 2 chars for categories, 3 chars for
 * subcategories (first 2 must equal parent code), uppercase alphanumeric,
 * case-insensitively unique. Empty saves NULL.
 *
 * Add Category / Add Subcategory pre-fill base_margin_pct + step_size_pct
 * from the "Pricing Defaults" rows in app_settings, so the values stay
 * editable globally without code changes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, MoreVertical, Trash2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditableCell } from "@/components/leads/SimpleMasterPage";
import { supabase } from "@/integrations/supabase/client";
import {
  isCategoryCodeChar,
  sanitizeCategoryCodeInput,
  validateCategoryCode,
  type CategoryCodeRef,
} from "@/lib/categoryCode";

interface Category {
  id: string;
  parent_id: string | null;
  code: string | null;
  name: string;
  base_margin_pct: number | null;
  step_size_pct: number | null;
  duty_rate_pct: number | null;
  notes: string | null;
}

const numOrNull = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const DEFAULT_MARGIN_FALLBACK = 40;
const DEFAULT_STEP_FALLBACK = 5;

export default function ProductCategoriesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [defaultMargin, setDefaultMargin] = useState<number>(DEFAULT_MARGIN_FALLBACK);
  const [defaultStep, setDefaultStep] = useState<number>(DEFAULT_STEP_FALLBACK);

  // Load categories + pricing defaults; subscribe to changes on both tables.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [cats, settings] = await Promise.all([
        supabase.from("product_categories").select("*").order("name"),
        supabase
          .from("app_settings")
          .select("key,value")
          .in("key", ["default_category_margin_pct", "default_category_step_size_pct"]),
      ]);
      if (!mounted) return;
      if (cats.error) { toast.error(`Load failed: ${cats.error.message}`); }
      else setRows((cats.data ?? []) as Category[]);
      if (settings.data) {
        for (const s of settings.data as { key: string; value: string | null }[]) {
          const n = s.value == null ? NaN : Number(s.value);
          if (!Number.isFinite(n)) continue;
          if (s.key === "default_category_margin_pct") setDefaultMargin(n);
          if (s.key === "default_category_step_size_pct") setDefaultStep(n);
        }
      }
    };
    load();
    const ch = supabase.channel("master-product_categories")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_categories" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const parents = rows.filter((r) => !r.parent_id).sort((a, b) => (a.code ?? "zz").localeCompare(b.code ?? "zz"));
    return parents.map((p) => {
      const subs = rows
        .filter((r) => r.parent_id === p.id)
        .sort((a, b) => (a.code ?? "zzz").localeCompare(b.code ?? "zzz"));
      const matchSelf = !term || p.name.toLowerCase().includes(term) || (p.code ?? "").toLowerCase().includes(term);
      const matchSub = subs.filter((s) => s.name.toLowerCase().includes(term) || (s.code ?? "").toLowerCase().includes(term));
      const include = matchSelf || matchSub.length > 0;
      return { parent: p, subs, include };
    }).filter((g) => g.include);
  }, [rows, q]);

  const codeRefs = useMemo<CategoryCodeRef[]>(
    () => rows.map((r) => ({ id: r.id, name: r.name, code: r.code })),
    [rows],
  );

  const updateField = async (row: Category, key: keyof Category, raw: string) => {
    let value: any = raw.trim();
    if (key === "name") {
      if (!value) { toast.error("Name is required"); return false; }
    } else if (key === "base_margin_pct" || key === "step_size_pct" || key === "duty_rate_pct") {
      value = numOrNull(raw);
      if (value === null && (key === "base_margin_pct" || key === "step_size_pct")) {
        toast.error(`${String(key).replace(/_/g, " ")} is required`); return false;
      }
    } else if (!value) value = null;
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, [key]: value } as Category : r)));
    const { error } = await supabase.from("product_categories").update({ [key]: value } as any).eq("id", row.id);
    if (error) { setRows(prev); toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  // Code save uses the shared validator. Returns null on success or an
  // inline error string on failure (so the CodeCell can surface it).
  const updateCode = async (row: Category, raw: string): Promise<string | null> => {
    const parent = row.parent_id ? rows.find((r) => r.id === row.parent_id) ?? null : null;
    const v = validateCategoryCode(raw, {
      isSubcategory: !!row.parent_id,
      parentCode: parent?.code ?? null,
      existing: codeRefs,
      excludeId: row.id,
    });
    if (!v.ok) return v.error;
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, code: v.value } as Category : r)));
    const { error } = await supabase
      .from("product_categories")
      .update({ code: v.value } as any)
      .eq("id", row.id);
    if (error) { setRows(prev); return error.message; }
    return null;
  };

  const addParent = async () => {
    const { data, error } = await supabase.from("product_categories").insert({
      name: "New category", base_margin_pct: defaultMargin, step_size_pct: defaultStep,
    }).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    if (data) setRows((rs) => [...rs.filter((r) => r.id !== (data as any).id), data as Category]);
  };
  const addSub = async (parentId: string) => {
    const { data, error } = await supabase.from("product_categories").insert({
      parent_id: parentId, name: "New subcategory",
      base_margin_pct: defaultMargin, step_size_pct: defaultStep,
    }).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    if (data) setRows((rs) => [...rs.filter((r) => r.id !== (data as any).id), data as Category]);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== id));
    const { error } = await supabase.from("product_categories").delete().eq("id", id);
    if (error) { setRows(prev); toast.error(`Delete failed: ${error.message}`); }
    else toast.success(`${confirmDelete.name} deleted`);
    setConfirmDelete(null);
  };

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        <header className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
            <button onClick={() => navigate("/")} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted/50">
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Master data</div>
              <h1 className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}>
                Product Categories <span className="text-muted-foreground font-light">· {rows.filter((r) => !r.parent_id).length}</span>
              </h1>
            </div>
            <button onClick={addParent}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{ background: "hsl(var(--brand-orange))", color: "white", minHeight: 40 }}>
              <Plus className="h-4 w-4" /> Add Category
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
          <div className="relative my-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }} />
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                  <Th className="w-20">Code</Th>
                  <Th>Name</Th>
                  <Th>Base Margin %</Th>
                  <Th>Step Size %</Th>
                  <Th>Duty Rate %</Th>
                  <Th>Notes</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {groups.map(({ parent, subs }) => (
                  <CategoryGroup
                    key={parent.id}
                    parent={parent}
                    subs={subs}
                    onUpdate={updateField}
                    onUpdateCode={updateCode}
                    onDelete={(c) => setConfirmDelete(c)}
                    onAddSub={() => addSub(parent.id)}
                  />
                ))}
                {groups.length === 0 && (
                  <tr><td colSpan={7} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
                    {q ? "No matches." : "No categories yet."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        <ConfirmDialog
          open={!!confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          title={confirmDelete ? `Delete ${confirmDelete.name}?` : ""}
          description={confirmDelete && !confirmDelete.parent_id ? "Subcategories will become top-level. This cannot be undone." : "This cannot be undone."}
          confirmLabel="Delete"
          destructive
          onConfirm={handleDelete}
        />
      </div>
    </DesktopAppShell>
  );
}

const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th className={cn("text-left text-[10px] uppercase tracking-[0.18em] font-semibold px-3 py-2.5", className)}
    style={{ color: "hsl(var(--brand-navy) / 0.65)" }}>{children}</th>
);

const CategoryGroup = ({
  parent, subs, onUpdate, onUpdateCode, onDelete, onAddSub,
}: {
  parent: Category; subs: Category[];
  onUpdate: (row: Category, key: keyof Category, raw: string) => Promise<boolean>;
  onUpdateCode: (row: Category, raw: string) => Promise<boolean>;
  onDelete: (row: Category) => void;
  onAddSub: () => void;
}) => (
  <>
    <CategoryRow row={parent} parentCode={null} bold onUpdate={onUpdate} onUpdateCode={onUpdateCode} onDelete={onDelete} onAddSub={onAddSub} />
    {subs.map((s) => (
      <CategoryRow
        key={s.id}
        row={s}
        parentCode={parent.code}
        indent
        onUpdate={onUpdate}
        onUpdateCode={onUpdateCode}
        onDelete={onDelete}
      />
    ))}
  </>
);

const CategoryRow = ({
  row, parentCode, bold, indent, onUpdate, onUpdateCode, onDelete, onAddSub,
}: {
  row: Category; parentCode: string | null; bold?: boolean; indent?: boolean;
  onUpdate: (row: Category, key: keyof Category, raw: string) => Promise<boolean>;
  onUpdateCode: (row: Category, raw: string) => Promise<boolean>;
  onDelete: (row: Category) => void;
  onAddSub?: () => void;
}) => (
  <tr className="hover:bg-muted/20 transition-colors" style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.07)" }}>
    <td className="px-3 py-2 align-top">
      <CodeCell row={row} parentCode={parentCode} onSave={(raw) => onUpdateCode(row, raw)} />
    </td>
    <td className="px-3 py-2 align-top" style={indent ? { paddingLeft: 28 } : undefined}>
      <div className={cn(bold && "font-semibold")}>
        <EditableCell value={row.name} onSave={(v) => onUpdate(row, "name", v)} />
      </div>
    </td>
    <td className="px-3 py-2 align-top">
      <EditableCell value={row.base_margin_pct == null ? "" : String(row.base_margin_pct)}
        onSave={(v) => onUpdate(row, "base_margin_pct", v)} />
    </td>
    <td className="px-3 py-2 align-top">
      <EditableCell value={row.step_size_pct == null ? "" : String(row.step_size_pct)}
        onSave={(v) => onUpdate(row, "step_size_pct", v)} />
    </td>
    <td className="px-3 py-2 align-top">
      <EditableCell value={row.duty_rate_pct == null ? "" : String(row.duty_rate_pct)}
        onSave={(v) => onUpdate(row, "duty_rate_pct", v)} />
    </td>
    <td className="px-3 py-2 align-top">
      <EditableCell value={row.notes ?? ""} onSave={(v) => onUpdate(row, "notes", v)} />
    </td>
    <td className="px-2 py-2 align-top">
      <Popover>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-muted/50 text-muted-foreground" aria-label="Row actions">
            <MoreVertical className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          {onAddSub && (
            <button onClick={onAddSub}
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
              style={{ color: "hsl(var(--brand-navy))" }}>
              <FolderPlus className="h-4 w-4" /> Add subcategory
            </button>
          )}
          <button onClick={() => onDelete(row)}
            className="w-full text-left px-3 py-2 text-sm rounded hover:bg-destructive/10 text-destructive flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </PopoverContent>
      </Popover>
    </td>
  </tr>
);

// ─── Inline-editable CODE cell ───────────────────────────────────────────
// Strict: keystroke filter (alphanumeric only), auto-uppercase, length cap
// (2 for category, 3 for subcategory). On commit runs the shared validator;
// on failure shows inline red border + error and keeps the cell open. Esc
// reverts. Empty saves NULL. Display em-dash when NULL.
const CodeCell = ({
  row, parentCode, onSave,
}: {
  row: Category;
  parentCode: string | null;
  onSave: (raw: string) => Promise<boolean>;
}) => {
  const isSub = !!row.parent_id;
  const maxLen = isSub ? 3 : 2;
  const stored = row.code ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) { setDraft(stored); setError(null); } }, [stored, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (!editing) {
    const empty = !stored;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "w-full text-left rounded px-1 py-0.5 -mx-1 hover:bg-muted/40 min-h-[1.5rem] font-mono",
          empty && "text-muted-foreground italic",
        )}
      >
        {empty ? "—" : stored}
      </button>
    );
  }

  const commit = async () => {
    const ok = await onSave(draft);
    if (ok) { setEditing(false); setError(null); return; }
    // Re-run validator locally to surface the message inline (onSave already
    // returned false, so no DB write occurred).
    // We don't have the existing[] list here; surface a generic length / prefix
    // message via the helper using just the parent code rule (uniqueness errors
    // will have already been surfaced via toast in the parent if needed).
    if (draft && draft.length !== maxLen) {
      setError(`Code must be exactly ${maxLen} characters`);
    } else if (isSub && parentCode && draft.slice(0, 2).toUpperCase() !== parentCode.toUpperCase()) {
      setError(`Must start with parent code ${parentCode.toUpperCase()}`);
    } else {
      setError("Code already in use");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(sanitizeCategoryCodeInput(e.target.value, isSub));
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); return; }
          if (e.key === "Escape") { setDraft(stored); setError(null); setEditing(false); return; }
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !isCategoryCodeChar(e.key)) {
            e.preventDefault();
          }
        }}
        onBlur={commit}
        maxLength={maxLen}
        className={cn(
          "w-full rounded border bg-background px-1.5 py-0.5 text-[13px] font-mono uppercase focus:outline-none focus:ring-2",
          error
            ? "border-destructive focus:ring-destructive/40"
            : "border-[hsl(var(--brand-navy)/0.25)] focus:ring-[hsl(var(--brand-navy)/0.4)]",
        )}
        style={{ textTransform: "uppercase" }}
      />
      {error && <p className="text-[11px] text-destructive leading-tight">{error}</p>}
    </div>
  );
};
