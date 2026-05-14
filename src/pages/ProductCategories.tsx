/**
 * Product Categories — parent/child rendering like Customers/Buyers.
 * Top-level categories (parent_id = null) render as bold rows; subcategories
 * (parent_id = parent.id) render nested underneath with indented Name.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, MoreVertical, Trash2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditableCell } from "@/components/leads/SimpleMasterPage";
import { supabase } from "@/integrations/supabase/client";

interface Category {
  id: string;
  parent_id: string | null;
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

export default function ProductCategoriesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase.from("product_categories").select("*").order("name");
      if (!mounted) return;
      if (error) { toast.error(`Load failed: ${error.message}`); return; }
      setRows((data ?? []) as Category[]);
    };
    load();
    const ch = supabase.channel("master-product_categories")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_categories" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const parents = rows.filter((r) => !r.parent_id).sort((a, b) => a.name.localeCompare(b.name));
    return parents.map((p) => {
      const subs = rows
        .filter((r) => r.parent_id === p.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      const matchSelf = !term || p.name.toLowerCase().includes(term);
      const matchSub = subs.filter((s) => s.name.toLowerCase().includes(term));
      const include = matchSelf || matchSub.length > 0;
      return { parent: p, subs, include };
    }).filter((g) => g.include);
  }, [rows, q]);

  const updateField = async (row: Category, key: keyof Category, raw: string) => {
    let value: any = raw.trim();
    if (key === "name") {
      if (!value) { toast.error("Name is required"); return false; }
    } else if (key === "base_margin_pct" || key === "step_size_pct" || key === "duty_rate_pct") {
      value = numOrNull(raw);
      if (value === null && (key === "base_margin_pct" || key === "step_size_pct")) {
        toast.error(`${key.replaceAll("_", " ")} is required`); return false;
      }
    } else if (!value) value = null;
    const { error } = await supabase.from("product_categories").update({ [key]: value }).eq("id", row.id);
    if (error) { toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  const addParent = async () => {
    const { error } = await supabase.from("product_categories").insert({
      name: "New category", base_margin_pct: 0, step_size_pct: 0,
    });
    if (error) toast.error(`Add failed: ${error.message}`);
  };
  const addSub = async (parentId: string) => {
    const { error } = await supabase.from("product_categories").insert({
      parent_id: parentId, name: "New subcategory", base_margin_pct: 0, step_size_pct: 0,
    });
    if (error) toast.error(`Add failed: ${error.message}`);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from("product_categories").delete().eq("id", confirmDelete.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
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
                    onDelete={(c) => setConfirmDelete(c)}
                    onAddSub={() => addSub(parent.id)}
                  />
                ))}
                {groups.length === 0 && (
                  <tr><td colSpan={6} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
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
  parent, subs, onUpdate, onDelete, onAddSub,
}: {
  parent: Category; subs: Category[];
  onUpdate: (row: Category, key: keyof Category, raw: string) => Promise<boolean>;
  onDelete: (row: Category) => void;
  onAddSub: () => void;
}) => (
  <>
    <CategoryRow row={parent} bold onUpdate={onUpdate} onDelete={onDelete} onAddSub={onAddSub} />
    {subs.map((s) => (
      <CategoryRow key={s.id} row={s} indent onUpdate={onUpdate} onDelete={onDelete} />
    ))}
  </>
);

const CategoryRow = ({
  row, bold, indent, onUpdate, onDelete, onAddSub,
}: {
  row: Category; bold?: boolean; indent?: boolean;
  onUpdate: (row: Category, key: keyof Category, raw: string) => Promise<boolean>;
  onDelete: (row: Category) => void;
  onAddSub?: () => void;
}) => (
  <tr className="hover:bg-muted/20 transition-colors" style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.07)" }}>
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
