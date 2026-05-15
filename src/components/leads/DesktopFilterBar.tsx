/**
 * Desktop-only horizontal filter strip. Single full-width row that wraps to
 * additional rows only on overflow, never splitting a category. Each category
 * renders as: small uppercase label + inline chips, with subtle vertical
 * dividers between groups. Customer/Supplier are chip-style buttons that open
 * a searchable dropdown.
 *
 * Hidden on mobile by parent (lg:block wrapper).
 */
import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterState, DeadlineUrgency } from "./FilterBar";
import { EMPTY_FILTER, filterCount } from "./FilterBar";
import type { ShippingMode } from "@/data/pipelines";

interface Props {
  value: FilterState;
  onChange: (next: FilterState) => void;
  customers: string[];
  suppliers: { id: string; name: string }[];
  salesReps: string[];
}

const MODES: ShippingMode[] = ["Air", "Ocean", "Local"];
const URGENCY: { id: Exclude<DeadlineUrgency, null>; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "this_week", label: "Due 7d" },
  { id: "this_month", label: "Future" },
];

// ── Pill chip (paper rest / navy active) ──
const Chip = ({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "h-8 px-3 rounded-full text-[13px] font-medium transition-colors border whitespace-nowrap",
      active ? "text-white border-transparent" : "hover:border-foreground/40",
    )}
    style={{
      backgroundColor: active ? "hsl(var(--brand-navy))" : "#FFFFFF",
      color: active ? "white" : "hsl(var(--brand-navy))",
      borderColor: active ? "transparent" : "hsl(var(--brand-navy) / 0.18)",
    }}
  >
    {children}
  </button>
);

const GroupLabel = ({ children }: { children: React.ReactNode }) => (
  <span
    className="text-[11px] font-semibold uppercase mr-2 shrink-0"
    style={{ color: "hsl(var(--brand-navy) / 0.55)", letterSpacing: "0.06em" }}
  >
    {children}
  </span>
);

const Divider = () => (
  <span
    aria-hidden
    className="inline-block shrink-0"
    style={{
      width: 1, height: 22,
      backgroundColor: "hsl(var(--brand-navy) / 0.1)",
      margin: "0 18px",
    }}
  />
);

// ── Multi-select searchable dropdown (chip-style trigger) ──
function MultiSearchDropdown({
  label, values, options, onChange, counts,
}: {
  label: string;
  values: string[];
  options: { id: string; label: string }[];
  onChange: (next: string[]) => void;
  counts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Debounced search
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 120);
    return () => clearTimeout(t);
  }, [q]);

  const selectedSet = useMemo(() => new Set(values), [values]);
  const active = values.length > 0;

  // Display label: alphabetically first selection + count of remaining
  const displayLabel = useMemo(() => {
    if (!active) return label;
    const selectedLabels = options
      .filter((o) => selectedSet.has(o.id))
      .map((o) => o.label)
      .sort((a, b) => a.localeCompare(b));
    if (selectedLabels.length === 0) return label;
    if (selectedLabels.length === 1) return selectedLabels[0];
    return `${selectedLabels[0]} +${selectedLabels.length - 1}`;
  }, [active, options, selectedSet, label]);

  const filtered = useMemo(() => {
    const base = qDebounced
      ? options.filter((o) => o.label.toLowerCase().includes(qDebounced.toLowerCase()))
      : options;
    // Selected sort to top, then alphabetical within each bucket
    return [...base].sort((a, b) => {
      const aSel = selectedSet.has(a.id) ? 0 : 1;
      const bSel = selectedSet.has(b.id) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.label.localeCompare(b.label);
    });
  }, [options, qDebounced, selectedSet]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(values.filter((v) => v !== id));
    else onChange([...values, id]);
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-8 pl-3 pr-2 rounded-full text-[13px] font-medium transition-all border inline-flex items-center gap-1.5 whitespace-nowrap",
          active ? "text-white border-transparent" : "hover:border-foreground/40",
        )}
        style={{
          minWidth: 120,
          backgroundColor: active ? "hsl(var(--brand-orange))" : "#FFFFFF",
          color: active ? "white" : "hsl(var(--brand-navy))",
          borderColor: active ? "transparent" : "hsl(var(--brand-navy) / 0.18)",
          boxShadow: open ? "0 0 0 2px hsl(var(--brand-orange) / 0.35)" : undefined,
        }}
      >
        <span className="max-w-[180px] truncate">{displayLabel}</span>
        {active ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="p-0.5 rounded-full hover:bg-white/20"
          >
            <X className="h-3 w-3" />
          </span>
        ) : (
          <ChevronDown className="h-3 w-3 opacity-60" />
        )}
      </button>
      {open && (
        <div
          className="absolute z-50 mt-8 left-0 bg-popover border rounded-lg shadow-lg overflow-hidden"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.15)", minWidth: 280 }}
        >
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }}>
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="flex-1 bg-transparent text-[12px] outline-none"
            />
          </div>
          <div className="overflow-y-auto py-1" style={{ maxHeight: 400 }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">No matches</div>
            ) : filtered.map((o) => {
              const isSel = selectedSet.has(o.id);
              const c = counts?.[o.id];
              return (
                <button
                  key={o.id}
                  onClick={() => toggle(o.id)}
                  className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted/50 flex items-center gap-2"
                >
                  <span
                    className="inline-flex items-center justify-center shrink-0 rounded border"
                    style={{
                      width: 14, height: 14,
                      backgroundColor: isSel ? "hsl(var(--brand-orange))" : "transparent",
                      borderColor: isSel ? "hsl(var(--brand-orange))" : "hsl(var(--brand-navy) / 0.3)",
                    }}
                  >
                    {isSel && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {typeof c === "number" && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">{c}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline group: label + chips, kept on the same wrap line ──
const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-1.5 shrink-0">
    <GroupLabel>{label}</GroupLabel>
    {children}
  </div>
);

export const DesktopFilterBar = ({ value, onChange, customers, suppliers, salesReps }: Props) => {
  const toggleArr = <T extends string>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  const setMode = (m: ShippingMode) => onChange({ ...value, shippingModes: toggleArr(value.shippingModes as ShippingMode[], m) });
  const setRep = (r: string) => onChange({ ...value, salesReps: toggleArr(value.salesReps, r) });
  const toggleFlag = () => onChange({ ...value, flagged: value.flagged === true ? null : true });
  const setUrgency = (u: Exclude<DeadlineUrgency, null>) =>
    onChange({ ...value, urgency: value.urgency === u ? null : u });

  const customer = value.customers[0] ?? null;
  const supplier = value.supplierIds[0] ?? null;
  const count = filterCount(value);

  return (
    <div
      className="rounded-2xl border px-4 py-3"
      style={{
        backgroundColor: "#FFFFFF",
        borderColor: "hsl(var(--brand-navy) / 0.08)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div className="flex flex-wrap items-center gap-y-2.5">
        <Group label="MODE">
          {MODES.map((m, i) => (
            <Chip key={m} active={value.shippingModes.includes(m)} onClick={() => setMode(m)}>{m}</Chip>
          ))}
        </Group>

        {salesReps.length > 0 && (
          <>
            <Divider />
            <Group label="REP">
              {salesReps.map((r) => (
                <Chip key={r} active={value.salesReps.includes(r)} onClick={() => setRep(r)}>{r}</Chip>
              ))}
            </Group>
          </>
        )}

        <Divider />
        <Group label="FLAG">
          <Chip active={value.flagged === true} onClick={toggleFlag}>Flagged</Chip>
        </Group>

        <Divider />
        <Group label="URGENCY">
          {URGENCY.map((u) => (
            <Chip key={u.id} active={value.urgency === u.id} onClick={() => setUrgency(u.id)}>{u.label}</Chip>
          ))}
        </Group>

        <Divider />
        <Group label="CUSTOMER">
          <MultiSearchDropdown
            label="Customer"
            values={value.customers}
            options={customers.map((c) => ({ id: c, label: c }))}
            onChange={(next) => onChange({ ...value, customers: next })}
          />
        </Group>

        <Divider />
        <Group label="SUPPLIER">
          <MultiSearchDropdown
            label="Supplier"
            values={value.supplierIds}
            options={[{ id: "__unassigned", label: "Unassigned" }, ...suppliers.map((s) => ({ id: s.id, label: s.code ? `[${s.code}] ${s.name}` : s.name }))]}
            onChange={(next) => onChange({ ...value, supplierIds: next })}
          />
        </Group>

        {count > 0 && (
          <button
            onClick={() => onChange(EMPTY_FILTER)}
            className="ml-auto text-[12px] font-medium hover:underline underline-offset-2 px-2"
            style={{ color: "hsl(var(--brand-navy) / 0.7)" }}
          >
            Reset all
          </button>
        )}
      </div>
    </div>
  );
};
