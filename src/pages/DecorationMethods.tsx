/**
 * Decoration Methods — parent (decoration_methods) / child (method_details)
 * rendering, mirroring the Customers ↔ Buyers pattern.
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

interface DMethod {
  id: string; code: string; name: string;
  sub_rule_type: "A" | "B" | "C"; notes: string | null;
}
interface MDetail {
  id: string; decoration_method_id: string;
  code: string; detail: string;
  n_setup: number; n_run: number; notes: string | null;
}

const numOrZero = (raw: string): number => {
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

export default function DecorationMethodsPage() {
  const navigate = useNavigate();
  const [methods, setMethods] = useState<DMethod[]>([]);
  const [details, setDetails] = useState<MDetail[]>([]);
  const [q, setQ] = useState("");
  const [confirmDelMethod, setConfirmDelMethod] = useState<DMethod | null>(null);
  const [confirmDelDetail, setConfirmDelDetail] = useState<MDetail | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [m, d] = await Promise.all([
        supabase.from("decoration_methods").select("*").order("code"),
        supabase.from("method_details").select("*").order("code"),
      ]);
      if (!mounted) return;
      if (m.data) setMethods(m.data as DMethod[]);
      if (d.data) setDetails(d.data as MDetail[]);
    };
    load();
    const ch = supabase.channel("master-decmethods")
      .on("postgres_changes", { event: "*", schema: "public", table: "decoration_methods" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "method_details" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return methods.slice().sort((a, b) => a.code.localeCompare(b.code)).map((m) => {
      const ds = details.filter((d) => d.decoration_method_id === m.id)
        .sort((a, b) => a.code.localeCompare(b.code));
      const matchSelf = !term
        || m.code.toLowerCase().includes(term)
        || m.name.toLowerCase().includes(term);
      const matchD = ds.filter((d) =>
        d.code.toLowerCase().includes(term) || d.detail.toLowerCase().includes(term));
      const include = matchSelf || matchD.length > 0;
      return { method: m, details: ds, include };
    }).filter((g) => g.include);
  }, [methods, details, q]);

  const updateMethod = async (row: DMethod, key: keyof DMethod, raw: string) => {
    let value: any = raw.trim();
    if (key === "code") {
      if (!value) { toast.error("Code is required"); return false; }
      value = value.toUpperCase();
    } else if (key === "name") {
      if (!value) { toast.error("Name is required"); return false; }
    } else if (key === "sub_rule_type") {
      const v = value.toUpperCase();
      if (!["A", "B", "C"].includes(v)) { toast.error("Sub-rule type must be A, B or C"); return false; }
      value = v;
    } else if (!value) value = null;
    const prev = methods;
    setMethods((ms) => ms.map((m) => (m.id === row.id ? { ...m, [key]: value } as DMethod : m)));
    const { error } = await supabase.from("decoration_methods").update({ [key]: value } as any).eq("id", row.id);
    if (error) { setMethods(prev); toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  const updateDetail = async (row: MDetail, key: keyof MDetail, raw: string) => {
    let value: any = raw.trim();
    if (key === "code") {
      if (!value) { toast.error("Code is required"); return false; }
      value = value.toUpperCase();
    } else if (key === "detail") {
      if (!value) { toast.error("Detail is required"); return false; }
    } else if (key === "n_setup" || key === "n_run") {
      value = numOrZero(raw);
    } else if (!value) value = null;
    const prev = details;
    setDetails((ds) => ds.map((d) => (d.id === row.id ? { ...d, [key]: value } as MDetail : d)));
    const { error } = await supabase.from("method_details").update({ [key]: value } as any).eq("id", row.id);
    if (error) { setDetails(prev); toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  const addMethod = async () => {
    const code = `NEW${Math.floor(Math.random() * 999)}`;
    const { data, error } = await supabase.from("decoration_methods").insert({
      code, name: "New decoration method", sub_rule_type: "A",
    }).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    if (data) setMethods((ms) => [...ms.filter((m) => m.id !== (data as any).id), data as DMethod]);
  };
  const addDetail = async (methodId: string, methodCode: string) => {
    const code = `${methodCode}-NEW${Math.floor(Math.random() * 999)}`;
    const { data, error } = await supabase.from("method_details").insert({
      decoration_method_id: methodId, code, detail: "New detail", n_setup: 0, n_run: 0,
    }).select().single();
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    if (data) setDetails((ds) => [...ds.filter((d) => d.id !== (data as any).id), data as MDetail]);
  };

  const handleDeleteMethod = async () => {
    if (!confirmDelMethod) return;
    const id = confirmDelMethod.id;
    const prev = methods;
    setMethods((ms) => ms.filter((m) => m.id !== id));
    const { error } = await supabase.from("decoration_methods").delete().eq("id", id);
    if (error) { setMethods(prev); toast.error(`Delete failed: ${error.message}`); }
    else toast.success(`${confirmDelMethod.code} deleted`);
    setConfirmDelMethod(null);
  };
  const handleDeleteDetail = async () => {
    if (!confirmDelDetail) return;
    const id = confirmDelDetail.id;
    const prev = details;
    setDetails((ds) => ds.filter((d) => d.id !== id));
    const { error } = await supabase.from("method_details").delete().eq("id", id);
    if (error) { setDetails(prev); toast.error(`Delete failed: ${error.message}`); }
    else toast.success(`${confirmDelDetail.code} deleted`);
    setConfirmDelDetail(null);
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
                Decoration Methods <span className="text-muted-foreground font-light">· {methods.length}</span>
              </h1>
            </div>
            <button onClick={addMethod}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{ background: "hsl(var(--brand-orange))", color: "white", minHeight: 40 }}>
              <Plus className="h-4 w-4" /> Add Method
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
          <div className="relative my-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search methods or details…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }} />
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                  <Th>Code</Th>
                  <Th>Name / Detail</Th>
                  <Th>Type</Th>
                  <Th>n_setup</Th>
                  <Th>n_run</Th>
                  <Th>Notes</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {groups.map(({ method, details: ds }) => (
                  <MethodGroup
                    key={method.id}
                    method={method}
                    details={ds}
                    onUpdateMethod={updateMethod}
                    onUpdateDetail={updateDetail}
                    onAddDetail={() => addDetail(method.id, method.code)}
                    onDeleteMethod={() => setConfirmDelMethod(method)}
                    onDeleteDetail={(d) => setConfirmDelDetail(d)}
                  />
                ))}
                {groups.length === 0 && (
                  <tr><td colSpan={7} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
                    {q ? "No matches." : "No methods yet."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        <ConfirmDialog
          open={!!confirmDelMethod}
          onCancel={() => setConfirmDelMethod(null)}
          title={confirmDelMethod ? `Delete ${confirmDelMethod.code}?` : ""}
          description="All method details under this method will also be deleted. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteMethod}
        />
        <ConfirmDialog
          open={!!confirmDelDetail}
          onCancel={() => setConfirmDelDetail(null)}
          title={confirmDelDetail ? `Delete ${confirmDelDetail.code}?` : ""}
          description="This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteDetail}
        />
      </div>
    </DesktopAppShell>
  );
}

const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th className={cn("text-left text-[10px] uppercase tracking-[0.18em] font-semibold px-3 py-2.5", className)}
    style={{ color: "hsl(var(--brand-navy) / 0.65)" }}>{children}</th>
);

const MethodGroup = ({
  method, details, onUpdateMethod, onUpdateDetail, onAddDetail, onDeleteMethod, onDeleteDetail,
}: {
  method: DMethod; details: MDetail[];
  onUpdateMethod: (row: DMethod, key: keyof DMethod, raw: string) => Promise<boolean>;
  onUpdateDetail: (row: MDetail, key: keyof MDetail, raw: string) => Promise<boolean>;
  onAddDetail: () => void;
  onDeleteMethod: () => void;
  onDeleteDetail: (d: MDetail) => void;
}) => (
  <>
    <tr className="hover:bg-muted/20 transition-colors" style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.02)" }}>
      <td className="px-3 py-2 align-top font-semibold" style={{ color: "hsl(var(--brand-navy))" }}>
        <EditableCell value={method.code} uppercase onSave={(v) => onUpdateMethod(method, "code", v)} />
      </td>
      <td className="px-3 py-2 align-top font-semibold">
        <EditableCell value={method.name} onSave={(v) => onUpdateMethod(method, "name", v)} />
      </td>
      <td className="px-3 py-2 align-top">
        <EditableCell value={method.sub_rule_type} uppercase onSave={(v) => onUpdateMethod(method, "sub_rule_type", v)} />
      </td>
      <td className="px-3 py-2 align-top text-muted-foreground italic">—</td>
      <td className="px-3 py-2 align-top text-muted-foreground italic">—</td>
      <td className="px-3 py-2 align-top">
        <EditableCell value={method.notes ?? ""} onSave={(v) => onUpdateMethod(method, "notes", v)} />
      </td>
      <td className="px-2 py-2 align-top">
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-1 rounded hover:bg-muted/50 text-muted-foreground" aria-label="Method actions">
              <MoreVertical className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button onClick={onAddDetail}
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
              style={{ color: "hsl(var(--brand-navy))" }}>
              <FolderPlus className="h-4 w-4" /> Add detail
            </button>
            <button onClick={onDeleteMethod}
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-destructive/10 text-destructive flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Delete method
            </button>
          </PopoverContent>
        </Popover>
      </td>
    </tr>
    {details.map((d) => (
      <tr key={d.id} className="hover:bg-muted/20 transition-colors" style={{ borderBottom: "1px dashed hsl(var(--brand-navy) / 0.06)" }}>
        <td className="px-3 py-2 align-top" style={{ paddingLeft: 28 }}>
          <EditableCell value={d.code} uppercase onSave={(v) => onUpdateDetail(d, "code", v)} />
        </td>
        <td className="px-3 py-2 align-top">
          <EditableCell value={d.detail} onSave={(v) => onUpdateDetail(d, "detail", v)} />
        </td>
        <td className="px-3 py-2 align-top text-muted-foreground italic">—</td>
        <td className="px-3 py-2 align-top">
          <EditableCell value={String(d.n_setup)} onSave={(v) => onUpdateDetail(d, "n_setup", v)} />
        </td>
        <td className="px-3 py-2 align-top">
          <EditableCell value={String(d.n_run)} onSave={(v) => onUpdateDetail(d, "n_run", v)} />
        </td>
        <td className="px-3 py-2 align-top">
          <EditableCell value={d.notes ?? ""} onSave={(v) => onUpdateDetail(d, "notes", v)} />
        </td>
        <td className="px-2 py-2 align-top">
          <button onClick={() => onDeleteDetail(d)}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete detail">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
    ))}
  </>
);
