/**
 * Detail Labels — master list of reusable product detail names (Material,
 * Size, Color, etc.). Inline edit + delete with referential check.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { EditableCell } from "@/components/leads/SimpleMasterPage";
import { supabase } from "@/integrations/supabase/client";

interface Label { id: string; label: string; sort_order: number }

export default function DetailLabelsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Label[]>([]);
  const [q, setQ] = useState("");
  const [confirmDel, setConfirmDel] = useState<Label | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("detail_labels").select("*").order("sort_order");
      if (!mounted) return;
      if (error) { toast.error(`Load failed: ${error.message}`); return; }
      setRows((data ?? []) as Label[]);
    };
    load();
    const ch = supabase.channel("detail-labels-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "detail_labels" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => r.label.toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  const addNew = async () => {
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error } = await supabase.from("detail_labels").insert({
      label: `New label ${rows.length + 1}`, sort_order: maxSort + 10,
    });
    if (error) toast.error(`Add failed: ${error.message}`);
  };

  const updateLabel = async (row: Label, key: "label" | "sort_order", raw: string) => {
    let value: any = raw.trim();
    if (key === "label") {
      if (!value) { toast.error("Label is required"); return false; }
      const dup = rows.find((r) => r.id !== row.id && r.label.toLowerCase() === value.toLowerCase());
      if (dup) { toast.error("Label already exists"); return false; }
    } else {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) { toast.error("Sort order must be an integer"); return false; }
      value = n;
    }
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, [key]: value } as Label : r)));
    const { error } = await supabase.from("detail_labels")
      .update({ [key]: value } as any).eq("id", row.id);
    if (error) { setRows(prev); toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    const { count } = await supabase
      .from("product_details").select("id", { count: "exact", head: true })
      .eq("detail_label_id", confirmDel.id);
    if ((count ?? 0) > 0) {
      toast.error(`Used by ${count} products; remove those references first`);
      setConfirmDel(null);
      return;
    }
    const { error } = await supabase.from("detail_labels").delete().eq("id", confirmDel.id);
    if (error) toast.error(`Delete failed: ${error.message}`);
    else toast.success(`${confirmDel.label} deleted`);
    setConfirmDel(null);
  };

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        <header className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-3 pb-3 flex items-center gap-3">
            <button onClick={() => navigate("/")} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted/50">
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Master data</div>
              <h1 className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}>
                Detail Labels <span className="text-muted-foreground font-light">· {rows.length}</span>
              </h1>
            </div>
            <button onClick={addNew}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{ background: "hsl(var(--brand-orange))", color: "white", minHeight: 40 }}>
              <Plus className="h-4 w-4" /> Add Label
            </button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
          <div className="relative my-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search labels…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }} />
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                  <th className={cn("text-left text-[10px] uppercase tracking-[0.18em] font-semibold px-3 py-2.5")}
                    style={{ color: "hsl(var(--brand-navy) / 0.65)" }}>Label</th>
                  <th className="text-left text-[10px] uppercase tracking-[0.18em] font-semibold px-3 py-2.5 w-28"
                    style={{ color: "hsl(var(--brand-navy) / 0.65)" }}>Sort order</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20"
                    style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.06)" }}>
                    <td className="px-3 py-2 align-middle font-medium" style={{ color: "hsl(var(--brand-navy))" }}>
                      <EditableCell value={r.label} onSave={(v) => updateLabel(r, "label", v)} />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <EditableCell value={String(r.sort_order)} onSave={(v) => updateLabel(r, "sort_order", v)} />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <button onClick={() => setConfirmDel(r)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        aria-label="Delete label">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={3} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
                    {q ? "No matches." : "No labels yet."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        <ConfirmDialog
          open={!!confirmDel}
          onCancel={() => setConfirmDel(null)}
          title={confirmDel ? `Delete ${confirmDel.label}?` : ""}
          description="This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDelete}
        />
      </div>
    </DesktopAppShell>
  );
}
