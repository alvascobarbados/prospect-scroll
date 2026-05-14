/**
 * Generic spreadsheet-style master-data page for flat code/name/notes tables.
 * Used for Origins, Destinations, Shipping Methods.
 *
 * Pattern matches CustomerListPage (back arrow, eyebrow + Raleway-300 H1,
 * search, navy-edged table with uppercase Th, three-dots delete, em-dash
 * placeholders, click-to-edit cells).
 */
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

export interface SimpleColumn<R> {
  key: keyof R & string;
  label: string;
  /** Column may be left blank → render em-dash. Default true. */
  nullable?: boolean;
  /** Field is uppercased on save (e.g. code). */
  uppercase?: boolean;
  /** Width hint for the column header. */
  width?: string;
}

interface Props<R extends { id: string }> {
  table: "origins" | "destinations" | "shipping_methods";
  title: string;
  eyebrow?: string;
  columns: SimpleColumn<R>[];
  /** Display label for a row (used in delete confirm). */
  rowLabel: (row: R) => string;
  /** Default values when the user adds a new row. */
  newRowDefaults?: Partial<R>;
}

export function SimpleMasterPage<R extends { id: string; created_at?: string; updated_at?: string }>(
  { table, title, eyebrow = "Master data", columns, rowLabel, newRowDefaults }: Props<R>,
) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<R | null>(null);

  // Refresh + realtime
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase.from(table).select("*").order(columns[0].key as any);
      if (!mounted) return;
      if (error) { toast.error(`Load failed: ${error.message}`); setLoading(false); return; }
      setRows((data ?? []) as unknown as R[]);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel(`master-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [table]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      columns.some((c) => String((r as any)[c.key] ?? "").toLowerCase().includes(term)),
    );
  }, [rows, q, columns]);

  const handleSave = async (row: R, key: keyof R & string, raw: string) => {
    const col = columns.find((c) => c.key === key)!;
    let value: string | null = raw.trim();
    if (col.uppercase) value = value.toUpperCase();
    if (!value) {
      if (col.nullable === false) {
        toast.error(`${col.label} is required`);
        return false;
      }
      value = null;
    }
    if ((row as any)[key] === value) return true;
    const prev = (row as any)[key];
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, [key]: value } as R : r)));
    const { error } = await supabase.from(table).update({ [key]: value } as any).eq("id", row.id);
    if (error) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, [key]: prev } as R : r)));
      toast.error(`Save failed: ${error.message}`);
      return false;
    }
    return true;
  };

  const handleAdd = async () => {
    const insert: any = { ...(newRowDefaults ?? {}) };
    for (const c of columns) {
      if (c.nullable === false && !insert[c.key]) insert[c.key] = "NEW";
    }
    const { data, error } = await supabase.from(table).insert(insert).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    if (data) setRows((rs) => [...rs.filter((r) => r.id !== (data as any).id), data as unknown as R]);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== id));
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { setRows(prev); toast.error(`Delete failed: ${error.message}`); }
    else toast.success(`${rowLabel(confirmDelete)} deleted`);
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
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">{eyebrow}</div>
              <h1
                className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}
              >
                {title} <span className="text-muted-foreground font-light">· {rows.length}</span>
              </h1>
            </div>
            <button
              onClick={handleAdd}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{ background: "hsl(var(--brand-orange))", color: "white", minHeight: 40 }}
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
          <div className="relative my-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }}
            />
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className="text-left text-[10px] uppercase tracking-[0.18em] font-semibold px-3 py-2.5"
                      style={{ color: "hsl(var(--brand-navy) / 0.65)", width: c.width }}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/20 transition-colors" style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.07)" }}>
                    {columns.map((c) => (
                      <td key={c.key} className="px-3 py-2 align-top">
                        <EditableCell
                          value={String((row as any)[c.key] ?? "")}
                          uppercase={c.uppercase}
                          onSave={(v) => handleSave(row, c.key, v)}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 align-top">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="p-1 rounded hover:bg-muted/50 text-muted-foreground" aria-label="Row actions">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-44 p-1">
                          <button
                            onClick={() => setConfirmDelete(row)}
                            className="w-full text-left px-3 py-2 text-sm rounded hover:bg-destructive/10 text-destructive flex items-center gap-2"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </PopoverContent>
                      </Popover>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
                      {q ? "No matches." : "No rows yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        <ConfirmDialog
          open={!!confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          title={confirmDelete ? `Delete ${rowLabel(confirmDelete)}?` : ""}
          description="This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDelete}
        />
      </div>
    </DesktopAppShell>
  );
}

// ─── Inline editable cell ───────────────────────────────────────────────
export const EditableCell = ({
  value, onSave, uppercase, placeholder = "—",
}: { value: string; onSave: (v: string) => Promise<boolean | void>; uppercase?: boolean; placeholder?: string }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (!editing) {
    const empty = !value;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "w-full text-left rounded px-1 py-0.5 -mx-1 hover:bg-muted/40 min-h-[1.5rem]",
          empty && "text-muted-foreground italic",
        )}
        style={uppercase ? { fontVariantCaps: "all-small-caps", letterSpacing: "0.04em" } : undefined}
      >
        {empty ? placeholder : value}
      </button>
    );
  }

  const commit = async () => {
    const ok = await onSave(uppercase ? draft.toUpperCase() : draft);
    if (ok !== false) setEditing(false);
  };

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      className="w-full rounded border border-[hsl(var(--brand-navy)/0.25)] bg-background px-1.5 py-0.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
      style={uppercase ? { textTransform: "uppercase" } : undefined}
    />
  );
};
