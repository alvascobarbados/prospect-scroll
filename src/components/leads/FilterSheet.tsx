import { useEffect, useMemo, useState } from "react";
import {
  X, Filter as FilterIcon, Users, Briefcase, Factory,
  Plane, Ship, MapPin, UserCircle2, Layers, Clock, AlertTriangle, Check, Search, Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINES, ShippingMode } from "@/data/pipelines";
import type { FilterState, DeadlineUrgency } from "./FilterBar";
import { EMPTY_FILTER, filterCount } from "./FilterBar";

interface Props {
  open: boolean;
  onClose: () => void;
  value: FilterState;
  onChange: (next: FilterState) => void;
  customers: string[];
  projectNames: string[];
  suppliers: { id: string; name: string; code?: string | null }[];
  salesReps: string[];
}

const ALL_MODES: (ShippingMode | "Unassigned")[] = ["Air", "Ocean", "Local", "Unassigned"];
const ALL_STAGES = PIPELINES.flatMap((p) => p.stages.map((s) => ({ id: s.id, label: s.title, pipeline: p.title })));
const URGENCY_OPTIONS: { id: Exclude<DeadlineUrgency, null>; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "this_week", label: "Due this week" },
  { id: "this_month", label: "Due this month" },
  { id: "no_deadline", label: "No deadline set" },
];

// ─── Multi-select picker (bottom sheet) ───
const MultiPicker = <T extends string>({
  open, onClose, title, icon, options, selected, onApply,
}: {
  open: boolean; onClose: () => void; title: string; icon: React.ReactNode;
  options: { id: T; label: string; sub?: string }[];
  selected: T[]; onApply: (next: T[]) => void;
}) => {
  const [draft, setDraft] = useState<T[]>(selected);
  const [q, setQ] = useState("");
  useEffect(() => { if (open) { setDraft(selected); setQ(""); } }, [open, selected]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: T) => setDraft((d) => d.includes(id) ? d.filter((x) => x !== id) : [...d, id]);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col sm:items-center sm:justify-center sm:p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 animate-fade-in" />
      <div className={cn(
        "relative bg-card shadow-[var(--shadow-section)] border animate-fade-in flex flex-col",
        "mt-auto rounded-t-3xl w-full max-h-[85vh]",
        "sm:mt-0 sm:rounded-2xl sm:max-w-md sm:w-full sm:max-h-[70vh]",
      )} style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}>
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="block w-10 h-1.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="px-5 pt-3 pb-3 flex items-center justify-between border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center rounded-full shrink-0"
              style={{ width: 32, height: 32, backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}>
              {icon}
            </span>
            <h3 className="text-base font-semibold tracking-tight truncate" style={{ color: "hsl(var(--brand-navy))" }}>{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="inline-flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground"
            style={{ width: 36, height: 36 }}><X className="h-4 w-4" /></button>
        </div>
        {options.length > 8 && (
          <div className="px-4 py-3 border-b border-border/60 shrink-0">
            <div className="flex items-center gap-2 rounded-xl border bg-background/60 px-3"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", minHeight: 44 }}>
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${title.toLowerCase()}…`}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground py-2" />
              {q && <button type="button" onClick={() => setQ("")} className="p-1 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground italic px-4 py-6 text-center">No matches.</p>
          ) : (
            <ul className="flex flex-col">
              {filtered.map((o) => {
                const isSel = draft.includes(o.id);
                return (
                  <li key={o.id}>
                    <button type="button" onClick={() => toggle(o.id)}
                      className={cn(
                        "w-full text-left rounded-xl flex items-center justify-between gap-3 px-3 transition-colors",
                        isSel ? "bg-muted/70" : "hover:bg-muted/40",
                      )} style={{ minHeight: 48 }}>
                      <span className="min-w-0">
                        <span className={cn("text-[15px] block truncate", isSel && "font-medium")}>{o.label}</span>
                        {o.sub && <span className="text-[11px] text-muted-foreground block truncate">{o.sub}</span>}
                      </span>
                      <span className={cn(
                        "inline-flex items-center justify-center rounded-md border shrink-0",
                        isSel ? "text-white" : "border-border",
                      )} style={{
                        width: 22, height: 22,
                        backgroundColor: isSel ? "hsl(var(--brand-orange))" : "transparent",
                        borderColor: isSel ? "hsl(var(--brand-orange))" : undefined,
                      }}>
                        {isSel && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] border-t border-border/60 flex gap-2 shrink-0">
          <button type="button" onClick={() => { onApply([]); onClose(); }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}>
            Clear
          </button>
          <button type="button" onClick={() => { onApply(draft); onClose(); }}
            className="flex-1 inline-flex items-center justify-center rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: "hsl(var(--brand-navy))", minHeight: 48 }}>
            Apply{draft.length > 0 ? ` (${draft.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
};

const SummaryRow = ({
  icon: Icon, label, summary, active, onClick, onClear,
}: {
  icon: typeof Users; label: string; summary: string; active: boolean;
  onClick: () => void; onClear?: () => void;
}) => (
  <div className="flex items-center gap-2">
    <button type="button" onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-between gap-3 px-3 rounded-xl border transition-colors hover:bg-muted/40",
        active ? "bg-muted/40" : "bg-background",
      )}
      style={{ minHeight: 52, borderColor: "hsl(var(--brand-navy) / 0.18)" }}>
      <span className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy))" }} />
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className={cn("block text-sm truncate", active ? "font-medium" : "text-muted-foreground")}
            style={{ color: active ? "hsl(var(--brand-navy))" : undefined }}>
            {summary}
          </span>
        </span>
      </span>
      {active && <Check className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-orange))" }} />}
    </button>
    {active && onClear && (
      <button type="button" onClick={onClear} aria-label={`Clear ${label}`}
        className="p-2.5 rounded-xl border text-muted-foreground hover:text-foreground hover:bg-muted/40"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.18)" }}>
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
);

type PickerKind =
  | "customers" | "projectNames" | "supplierIds" | "shippingModes"
  | "salesReps" | "stages" | null;

export const FilterSheet = ({
  open, onClose, value, onChange, customers, projectNames, suppliers, salesReps,
}: Props) => {
  const [picker, setPicker] = useState<PickerKind>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const supplierLabel = useMemo(() => {
    if (!value.supplierIds.length) return "Any";
    return value.supplierIds.map((id) => suppliers.find((s) => s.id === id)?.name ?? id).join(", ");
  }, [value.supplierIds, suppliers]);
  const stageLabel = useMemo(() => {
    if (!value.stages.length) return "Any";
    return value.stages.map((id) => ALL_STAGES.find((s) => s.id === id)?.label ?? id).join(", ");
  }, [value.stages]);
  const urgencyLabel = value.urgency
    ? URGENCY_OPTIONS.find((o) => o.id === value.urgency)?.label ?? "Any"
    : "Any";

  if (!open) return null;
  const count = filterCount(value);

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-6">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 animate-fade-in" />
        <div className={cn(
          "relative bg-card shadow-[var(--shadow-section)] border animate-fade-in flex flex-col",
          "mt-auto rounded-t-3xl w-full max-h-[88vh]",
          "sm:mt-0 sm:rounded-2xl sm:max-w-md sm:w-full sm:max-h-[80vh]",
        )} style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}>
          <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <span className="block w-10 h-1.5 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="px-5 pt-3 pb-3 flex items-center justify-between border-b border-border/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex items-center justify-center rounded-full"
                style={{ width: 32, height: 32, backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}>
                <FilterIcon className="h-4 w-4" />
              </span>
              <h3 className="text-base font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>
                Filter {count > 0 ? `(${count})` : ""}
              </h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="inline-flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground"
              style={{ width: 36, height: 36 }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <SummaryRow icon={Users} label="Customer"
              summary={value.customers.length ? value.customers.join(", ") : "Any"}
              active={value.customers.length > 0}
              onClick={() => setPicker("customers")}
              onClear={() => onChange({ ...value, customers: [] })} />
            <SummaryRow icon={Briefcase} label="Project"
              summary={value.projectNames.length ? value.projectNames.join(", ") : "Any"}
              active={value.projectNames.length > 0}
              onClick={() => setPicker("projectNames")}
              onClear={() => onChange({ ...value, projectNames: [] })} />
            <SummaryRow icon={Factory} label="Supplier"
              summary={supplierLabel}
              active={value.supplierIds.length > 0}
              onClick={() => setPicker("supplierIds")}
              onClear={() => onChange({ ...value, supplierIds: [] })} />
            <SummaryRow icon={Plane} label="Shipping mode"
              summary={value.shippingModes.length ? value.shippingModes.join(", ") : "Any"}
              active={value.shippingModes.length > 0}
              onClick={() => setPicker("shippingModes")}
              onClear={() => onChange({ ...value, shippingModes: [] })} />
            <SummaryRow icon={UserCircle2} label="Sales rep"
              summary={value.salesReps.length ? value.salesReps.join(", ") : "Any"}
              active={value.salesReps.length > 0}
              onClick={() => setPicker("salesReps")}
              onClear={() => onChange({ ...value, salesReps: [] })} />
            <SummaryRow icon={Layers} label="Stage"
              summary={stageLabel}
              active={value.stages.length > 0}
              onClick={() => setPicker("stages")}
              onClear={() => onChange({ ...value, stages: [] })} />

            {/* Urgency — single-select inline */}
            <div className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--brand-navy) / 0.18)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4" style={{ color: "hsl(var(--brand-navy))" }} />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Deadline urgency</span>
                <span className="ml-auto text-xs text-muted-foreground">{urgencyLabel}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {URGENCY_OPTIONS.map((o) => {
                  const sel = value.urgency === o.id;
                  return (
                    <button key={o.id} type="button"
                      onClick={() => onChange({ ...value, urgency: sel ? null : o.id })}
                      className={cn(
                        "text-xs rounded-full border px-3 py-1.5 transition-colors",
                        sel
                          ? "text-white border-transparent"
                          : "bg-background text-foreground/80 hover:border-foreground/30",
                      )}
                      style={{
                        backgroundColor: sel ? "hsl(var(--brand-navy))" : undefined,
                        borderColor: sel ? "hsl(var(--brand-navy))" : "hsl(var(--brand-navy) / 0.18)",
                      }}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Flagged tri-state */}
            <div className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--brand-navy) / 0.18)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Flag className="h-4 w-4" style={{ color: "hsl(var(--brand-orange))" }} />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Flagged</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {value.flagged === null ? "All" : value.flagged ? "Only flagged" : "Only unflagged"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: null as boolean | null, label: "All" },
                  { id: true as boolean | null, label: "Only flagged" },
                  { id: false as boolean | null, label: "Only unflagged" },
                ].map((o) => {
                  const sel = value.flagged === o.id;
                  return (
                    <button
                      key={String(o.id)} type="button"
                      onClick={() => onChange({ ...value, flagged: o.id })}
                      className={cn(
                        "text-xs rounded-full border px-3 py-1.5 transition-colors",
                        sel ? "text-white border-transparent" : "bg-background text-foreground/80 hover:border-foreground/30",
                      )}
                      style={{
                        backgroundColor: sel ? "hsl(var(--brand-orange))" : undefined,
                        borderColor: sel ? "hsl(var(--brand-orange))" : "hsl(var(--brand-navy) / 0.18)",
                      }}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Has missing data toggle */}
            <button type="button"
              onClick={() => onChange({ ...value, missingOnly: !value.missingOnly })}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-3 rounded-xl border transition-colors",
                value.missingOnly ? "bg-muted/60" : "bg-background hover:bg-muted/40",
              )}
              style={{ minHeight: 52, borderColor: "hsl(var(--brand-navy) / 0.18)" }}>
              <span className="flex items-center gap-3 min-w-0">
                <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-orange))" }} />
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-medium" style={{ color: "hsl(var(--brand-navy))" }}>
                    Has missing data
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    Show only cards with missing required fields
                  </span>
                </span>
              </span>
              <span className={cn(
                "shrink-0 inline-flex items-center justify-center rounded-md border",
                value.missingOnly ? "text-white" : "border-border",
              )} style={{
                width: 22, height: 22,
                backgroundColor: value.missingOnly ? "hsl(var(--brand-orange))" : "transparent",
                borderColor: value.missingOnly ? "hsl(var(--brand-orange))" : undefined,
              }}>
                {value.missingOnly && <Check className="h-3 w-3" />}
              </span>
            </button>
          </div>

          <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] border-t border-border/60 flex gap-2">
            {count > 0 && (
              <button type="button"
                onClick={() => onChange(EMPTY_FILTER)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
                style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}>
                <X className="h-4 w-4" /> Clear all
              </button>
            )}
            <button type="button" onClick={onClose}
              className="flex-1 inline-flex items-center justify-center rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: "hsl(var(--brand-navy))", minHeight: 48 }}>
              Done
            </button>
          </div>
        </div>
      </div>

      <MultiPicker<string>
        open={picker === "customers"} onClose={() => setPicker(null)}
        title="Filter by customer" icon={<Users className="h-4 w-4" />}
        options={customers.map((c) => ({ id: c, label: c }))}
        selected={value.customers}
        onApply={(next) => onChange({ ...value, customers: next })} />
      <MultiPicker<string>
        open={picker === "projectNames"} onClose={() => setPicker(null)}
        title="Filter by project" icon={<Briefcase className="h-4 w-4" />}
        options={projectNames.map((n) => ({ id: n, label: n }))}
        selected={value.projectNames}
        onApply={(next) => onChange({ ...value, projectNames: next })} />
      <MultiPicker<string>
        open={picker === "supplierIds"} onClose={() => setPicker(null)}
        title="Filter by supplier" icon={<Factory className="h-4 w-4" />}
        options={[
          { id: "__unassigned", label: "Unassigned / TBD / Various" },
          ...suppliers.map((s) => ({ id: s.id, label: s.code ? `[${s.code}] ${s.name}` : s.name })),
        ]}
        selected={value.supplierIds}
        onApply={(next) => onChange({ ...value, supplierIds: next })} />
      <MultiPicker<ShippingMode | "Unassigned">
        open={picker === "shippingModes"} onClose={() => setPicker(null)}
        title="Filter by shipping mode" icon={<Plane className="h-4 w-4" />}
        options={ALL_MODES.map((m) => ({ id: m, label: m }))}
        selected={value.shippingModes}
        onApply={(next) => onChange({ ...value, shippingModes: next })} />
      <MultiPicker<string>
        open={picker === "salesReps"} onClose={() => setPicker(null)}
        title="Filter by sales rep" icon={<UserCircle2 className="h-4 w-4" />}
        options={salesReps.map((r) => ({ id: r, label: r }))}
        selected={value.salesReps}
        onApply={(next) => onChange({ ...value, salesReps: next })} />
      <MultiPicker<string>
        open={picker === "stages"} onClose={() => setPicker(null)}
        title="Filter by stage" icon={<Layers className="h-4 w-4" />}
        options={ALL_STAGES.map((s) => ({ id: s.id, label: s.label, sub: s.pipeline }))}
        selected={value.stages as string[]}
        onApply={(next) => onChange({ ...value, stages: next as FilterState["stages"] })} />
    </>
  );
};
