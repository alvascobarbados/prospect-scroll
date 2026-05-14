/**
 * Generic list-bound picker for the 4 master-data entities
 * (Customer, Supplier, Team Member, Product) and a multi-select variant
 * for Sales Reps.
 *
 * Two presentations:
 *   - "sheet"   (default) — full-screen bottom sheet, used in CardEditOverlay
 *                and other mobile-first contexts.
 *   - "popover" — anchored Radix popover, used by the desktop ProjectTable
 *                inline-editing flow. Feels like a Google-Sheets dropdown.
 *
 * The pattern, from the brief:
 *   - Title at top
 *   - Auto-focused search input
 *   - Live-filtered, alphabetised list
 *   - "+ Add new …" inline form (escape valve, always available)
 *   - Optional meta-options (TBD/Various/Unassigned for Supplier; "Custom" for Product)
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./EditorSheets";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMasterData, EntityKind } from "@/hooks/useMasterData";
import type { ShippingMode } from "@/data/pipelines";

type Presentation = "sheet" | "popover";

// ─── Single-select picker ────────────────────────────────────────────────
interface SingleProps {
  open: boolean;
  onClose: () => void;
  kind: EntityKind;
  selectedId?: string | null;
  selectedMeta?: string | null;
  onPick: (idOrName: string) => void;
  onPickMeta?: (meta: string, value?: string) => void;
  /** "sheet" (default) or "popover". */
  presentation?: Presentation;
  /** When presentation="popover", anchor element to position relative to. */
  anchorEl?: HTMLElement | null;
}

const META_OPTIONS: Record<EntityKind, { key: string; label: string; italic?: boolean }[]> = {
  supplier: [
    { key: "TBD", label: "TBD", italic: true },
    { key: "Various", label: "Various", italic: true },
    { key: "Unassigned", label: "Unassigned", italic: true },
  ],
  product: [{ key: "Custom", label: "Custom (free text)", italic: true }],
  customer: [],
  team: [],
};

const TITLES: Record<EntityKind, string> = {
  customer: "Pick customer",
  supplier: "Pick supplier",
  team: "Pick sales rep",
  product: "Pick product",
};

const ADD_LABELS: Record<EntityKind, string> = {
  customer: "Add new customer",
  supplier: "Add new supplier",
  team: "Add new team member",
  product: "Add new product",
};

// Body shared by sheet and popover presentations
const PickerBody = ({
  kind, selectedId, selectedMeta, onPick, onPickMeta, onClose, onStartAdd, compact,
}: {
  kind: EntityKind;
  selectedId?: string | null;
  selectedMeta?: string | null;
  onPick: (id: string) => void;
  onPickMeta?: (meta: string) => void;
  onClose: () => void;
  onStartAdd: (initialName: string) => void;
  compact?: boolean;
}) => {
  const md = useMasterData();
  const [q, setQ] = useState("");
  useEffect(() => { setQ(""); }, [kind]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (kind === "customer") {
      return md.customers
        .filter((c) => !term || c.name.toLowerCase().includes(term))
        .map((c) => ({ id: c.name, label: c.name, sub: c.country ?? undefined }));
    }
    if (kind === "supplier") {
      return md.suppliers
        .filter((s) => !term || s.name.toLowerCase().includes(term))
        .map((s) => ({ id: s.id, label: s.name, sub: [s.country, s.default_shipping_mode].filter(Boolean).join(" · ") || undefined }));
    }
    if (kind === "team") {
      return md.teamMembers
        .filter((t) => !term || t.initials.toLowerCase().includes(term) || t.full_name.toLowerCase().includes(term))
        .map((t) => ({ id: t.initials, label: `${t.initials} — ${t.full_name}`, sub: t.role ?? undefined }));
    }
    return md.products
      .filter((p) => !term || p.name.toLowerCase().includes(term))
      .map((p) => ({ id: p.name, label: p.name, sub: p.default_unit ?? undefined }));
  }, [kind, md.customers, md.suppliers, md.teamMembers, md.products, q]);

  const exactMatch = rows.some((r) => r.label.toLowerCase() === q.trim().toLowerCase());
  const showInlineCreate = q.trim().length > 0 && !exactMatch && kind !== "team";
  const metaOpts = META_OPTIONS[kind];

  const minRow = compact ? 36 : 48;

  return (
    <>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          style={{ minHeight: compact ? 36 : 48 }}
          autoFocus
        />
      </div>

      {metaOpts.length > 0 && onPickMeta && (
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {metaOpts.map((m) => (
            <button
              key={m.key}
              onClick={() => { onPickMeta(m.key); onClose(); }}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-xs transition-colors hover:bg-muted/40",
                selectedMeta === m.key ? "bg-muted/60" : "bg-card border-border/60",
              )}
              style={{ minHeight: compact ? 32 : 44 }}
            >
              <span className={cn(m.italic && "italic text-muted-foreground")}>{m.label}</span>
            </button>
          ))}
        </div>
      )}

      {showInlineCreate && (
        <button
          onClick={() => onStartAdd(q.trim())}
          className="mb-2 w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs font-medium hover:bg-muted/40 transition-colors"
          style={{ borderColor: "hsl(var(--brand-orange) / 0.55)", color: "hsl(var(--brand-orange))", minHeight: minRow }}
        >
          <Plus className="h-3.5 w-3.5" /> Add "{q.trim()}"
        </button>
      )}

      <ul className={cn("space-y-1 overflow-y-auto", compact && "max-h-[260px]")}>
        {rows.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => { onPick(r.id); onClose(); }}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg border transition-colors hover:bg-muted/40",
                selectedId === r.id ? "bg-muted/60" : "bg-card border-border/60",
              )}
              style={{ minHeight: minRow, borderColor: selectedId === r.id ? "hsl(var(--brand-navy) / 0.35)" : undefined }}
            >
              <div className="text-[13px] font-medium text-foreground truncate">{r.label}</div>
              {r.sub && <div className="text-[11px] text-muted-foreground truncate">{r.sub}</div>}
            </button>
          </li>
        ))}
        {rows.length === 0 && !showInlineCreate && (
          <li className="text-xs text-muted-foreground italic px-3 py-3 text-center">No matches.</li>
        )}
      </ul>

      <button
        onClick={() => onStartAdd(q.trim())}
        className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs font-medium hover:bg-muted/40 transition-colors"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: minRow }}
      >
        <Plus className="h-3.5 w-3.5" /> {ADD_LABELS[kind]}
      </button>
    </>
  );
};

export const EntityPicker = ({
  open, onClose, kind, selectedId, selectedMeta, onPick, onPickMeta,
  presentation = "sheet", anchorEl,
}: SingleProps) => {
  const [adding, setAdding] = useState(false);
  const [addInitial, setAddInitial] = useState("");

  useEffect(() => { if (open) setAdding(false); }, [open]);

  const startAdd = (name: string) => { setAddInitial(name); setAdding(true); };

  if (adding) {
    return (
      <InlineAdd
        open={open}
        kind={kind}
        initialName={addInitial}
        onClose={() => setAdding(false)}
        onCreated={(idOrName) => {
          setAdding(false);
          onPick(idOrName);
          onClose();
        }}
      />
    );
  }

  if (presentation === "popover") {
    return (
      <Popover open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <PopoverTrigger asChild>
          <span
            ref={(el) => {
              // Position relative to provided anchor element
              if (el && anchorEl && el.parentElement !== anchorEl) {
                // no-op — Radix uses the trigger ref as the anchor; we'll
                // instead use PopoverAnchor pattern via virtual ref below.
              }
            }}
            style={{
              position: "fixed",
              left: anchorEl?.getBoundingClientRect().left ?? 0,
              top: anchorEl?.getBoundingClientRect().bottom ?? 0,
              width: anchorEl?.getBoundingClientRect().width ?? 0,
              height: 0,
              pointerEvents: "none",
            }}
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={2}
          className="w-[320px] p-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-2">
            {TITLES[kind]}
          </div>
          <PickerBody
            kind={kind}
            selectedId={selectedId}
            selectedMeta={selectedMeta}
            onPick={onPick}
            onPickMeta={onPickMeta}
            onClose={onClose}
            onStartAdd={startAdd}
            compact
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={TITLES[kind]}>
      <PickerBody
        kind={kind}
        selectedId={selectedId}
        selectedMeta={selectedMeta}
        onPick={onPick}
        onPickMeta={onPickMeta}
        onClose={onClose}
        onStartAdd={startAdd}
      />
    </BottomSheet>
  );
};

// ─── Multi-select (used for Sales Rep) ───────────────────────────────────
interface MultiProps {
  open: boolean;
  onClose: () => void;
  selected: string[];
  onConfirm: (initials: string[]) => void;
  presentation?: Presentation;
  anchorEl?: HTMLElement | null;
}

const TeamMultiBody = ({
  draft, setDraft, onStartAdd, compact,
}: {
  draft: string[];
  setDraft: React.Dispatch<React.SetStateAction<string[]>>;
  onStartAdd: () => void;
  compact?: boolean;
}) => {
  const md = useMasterData();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return md.teamMembers
      .filter((t) => !term || t.initials.toLowerCase().includes(term) || t.full_name.toLowerCase().includes(term))
      .map((t) => ({ initials: t.initials.toUpperCase(), label: `${t.initials} — ${t.full_name}`, role: t.role }));
  }, [md.teamMembers, q]);

  const toggle = (init: string) => {
    setDraft((d) => d.includes(init) ? d.filter((x) => x !== init) : [...d, init]);
  };

  const minRow = compact ? 36 : 48;

  return (
    <>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search team"
          className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          style={{ minHeight: compact ? 36 : 48 }}
          autoFocus
        />
      </div>

      {draft.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {draft.map((init) => {
            const t = md.getTeamByInitials(init);
            return (
              <button
                key={init}
                onClick={() => toggle(init)}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-semibold tracking-wide"
                style={{ background: "hsl(var(--brand-navy) / 0.1)", color: "hsl(var(--brand-navy))" }}
                title={t?.full_name ?? init}
              >
                {init}
                <X className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      )}

      <ul className={cn("space-y-1 overflow-y-auto", compact && "max-h-[260px]")}>
        {rows.map((r) => {
          const on = draft.includes(r.initials);
          return (
            <li key={r.initials}>
              <button
                onClick={() => toggle(r.initials)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg border transition-colors hover:bg-muted/40 flex items-center gap-2",
                  on ? "bg-muted/60" : "bg-card border-border/60",
                )}
                style={{ minHeight: minRow, borderColor: on ? "hsl(var(--brand-navy) / 0.35)" : undefined }}
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                    on && "bg-[hsl(var(--brand-navy))] border-transparent",
                  )}
                  style={{ borderColor: on ? undefined : "hsl(var(--brand-navy) / 0.4)" }}
                >
                  {on && <Check className="h-3 w-3 text-background" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-foreground truncate">{r.label}</div>
                  {r.role && <div className="text-[11px] text-muted-foreground truncate">{r.role}</div>}
                </div>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="text-xs text-muted-foreground italic px-3 py-3 text-center">No team members match.</li>
        )}
      </ul>

      <button
        onClick={onStartAdd}
        className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs font-medium hover:bg-muted/40 transition-colors"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: minRow }}
      >
        <Plus className="h-3.5 w-3.5" /> Add new team member
      </button>
    </>
  );
};

export const TeamMultiPicker = ({
  open, onClose, selected, onConfirm, presentation = "sheet", anchorEl,
}: MultiProps) => {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);

  useEffect(() => { if (open) { setDraft(selected); setAdding(false); } }, [open, selected]);

  if (adding) {
    return (
      <InlineAdd
        open={open}
        kind="team"
        initialName=""
        onClose={() => setAdding(false)}
        onCreated={(initials) => {
          setAdding(false);
          setDraft((d) => d.includes(initials) ? d : [...d, initials]);
        }}
      />
    );
  }

  if (presentation === "popover") {
    return (
      <Popover open={open} onOpenChange={(o) => { if (!o) { onConfirm(draft); onClose(); } }}>
        <PopoverTrigger asChild>
          <span
            style={{
              position: "fixed",
              left: anchorEl?.getBoundingClientRect().left ?? 0,
              top: anchorEl?.getBoundingClientRect().bottom ?? 0,
              width: anchorEl?.getBoundingClientRect().width ?? 0,
              height: 0,
              pointerEvents: "none",
            }}
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={2}
          className="w-[300px] p-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              Pick sales reps
            </div>
            <button
              onClick={() => { onConfirm(draft); onClose(); }}
              className="text-[11px] font-semibold"
              style={{ color: "hsl(var(--brand-orange))" }}
            >
              Done
            </button>
          </div>
          <TeamMultiBody draft={draft} setDraft={setDraft} onStartAdd={() => setAdding(true)} compact />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Pick sales reps"
      onSave={() => { onConfirm(draft); onClose(); }}
      saveLabel="Done"
    >
      <TeamMultiBody draft={draft} setDraft={setDraft} onStartAdd={() => setAdding(true)} />
    </BottomSheet>
  );
};

// ─── Inline-add form (sheet only) ────────────────────────────────────────
interface InlineAddProps {
  open: boolean;
  kind: EntityKind;
  initialName?: string;
  onClose: () => void;
  onCreated: (idOrName: string) => void;
}

export const InlineAdd = ({ open, kind, initialName = "", onClose, onCreated }: InlineAddProps) => {
  const md = useMasterData();
  const [name, setName] = useState(initialName);
  const [country, setCountry] = useState<"Local" | "Regional">("Local");
  const [destinationId, setDestinationId] = useState<string>("");
  const [incoterms, setIncoterms] = useState<"" | "FOB" | "CIF" | "LDP" | "LDF">("");
  const [supOriginId, setSupOriginId] = useState<string>("");
  const [mode, setMode] = useState<ShippingMode>("Ocean");
  const [initials, setInitials] = useState("");
  const [fullName, setFullName] = useState("");
  const [teamEmail, setTeamEmail] = useState("");
  const [unit, setUnit] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setCountry("Local"); setDestinationId(""); setIncoterms(""); setSupOriginId(""); setMode("Ocean");
    setInitials(""); setFullName(""); setTeamEmail(""); setUnit("");
  }, [open, initialName]);

  const titles: Record<EntityKind, string> = {
    customer: "Add customer",
    supplier: "Add supplier",
    team: "Add team member",
    product: "Add product",
  };

  const valid = kind === "team"
    ? initials.trim().length > 0 && fullName.trim().length > 0
    : name.trim().length > 0;

  const submit = async () => {
    try {
      if (kind === "customer") {
        const c = await md.addCustomer({
          name: name.trim(),
          country,
          destination_id: destinationId || null,
          incoterms: (incoterms || null) as any,
        });
        toast.success(`Customer "${c.name}" added`);
        onCreated(c.name);
      } else if (kind === "supplier") {
        const s = await md.addSupplier({
          name: name.trim(),
          origin_id: supOriginId || null,
          default_shipping_mode: mode,
        });
        toast.success(`Supplier "${s.name}" added`);
        onCreated(s.id);
      } else if (kind === "team") {
        const emailNorm = teamEmail.trim().toLowerCase();
        if (emailNorm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
          toast.error("Invalid email format");
          return;
        }
        const t = await md.addTeamMember({
          initials: initials.trim().toUpperCase(),
          full_name: fullName.trim(),
          email: emailNorm || undefined,
        } as any);
        toast.success(`${t.initials} — ${t.full_name} added`);
        onCreated(t.initials);
      } else {
        const p = await md.addProduct({ name: name.trim(), default_unit: unit.trim() || undefined });
        toast.success(`Product "${p.name}" added`);
        onCreated(p.name);
      }
    } catch (err: any) {
      const msg: string = err?.message ?? "Could not create record";
      if (/duplicate/i.test(msg) || /unique/i.test(msg)) {
        toast.error(`That ${kind} already exists.`);
      } else {
        toast.error(msg);
      }
    }
  };

  const inputCls = "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]";
  const labelCls = "block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={titles[kind]}
      onSave={submit}
      saveDisabled={!valid}
      saveLabel="Add"
    >
      <div className="space-y-3">
        {kind !== "team" && (
          <div>
            <label className={labelCls}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} style={{ minHeight: 48 }} autoFocus />
          </div>
        )}
        {kind === "customer" && (
          <>
            <div>
              <label className={labelCls}>Country</label>
              <select value={country} onChange={(e) => setCountry(e.target.value as any)} className={inputCls} style={{ minHeight: 48 }}>
                <option value="Local">Local</option>
                <option value="Regional">Regional</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Incoterms (optional)</label>
              <select value={incoterms} onChange={(e) => setIncoterms(e.target.value as any)} className={inputCls} style={{ minHeight: 48 }}>
                <option value="">—</option>
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
                <option value="LDP">LDP</option>
                <option value="LDF">LDF</option>
              </select>
            </div>
          </>
        )}
        {kind === "supplier" && (
          <>
            <div>
              <label className={labelCls}>Country (optional)</label>
              <input value={supCountry} onChange={(e) => setSupCountry(e.target.value)} className={inputCls} style={{ minHeight: 48 }} placeholder="e.g. China" />
            </div>
            <div>
              <label className={labelCls}>Default shipping</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as ShippingMode)} className={inputCls} style={{ minHeight: 48 }}>
                <option value="Air">Air</option>
                <option value="Ocean">Ocean</option>
                <option value="Local">Local</option>
              </select>
            </div>
          </>
        )}
        {kind === "team" && (
          <>
            <div>
              <label className={labelCls}>Initials</label>
              <input value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))} className={inputCls} style={{ minHeight: 48 }} placeholder="AV" autoFocus />
            </div>
            <div>
              <label className={labelCls}>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} style={{ minHeight: 48 }} placeholder="Alvasco Admin" />
            </div>
            <div>
              <label className={labelCls}>Email (optional)</label>
              <input
                type="email"
                value={teamEmail}
                onChange={(e) => setTeamEmail(e.target.value)}
                className={inputCls}
                style={{ minHeight: 48 }}
                placeholder="name@alvasco.com"
              />
            </div>
          </>
        )}
        {kind === "product" && (
          <div>
            <label className={labelCls}>Default unit (optional)</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} style={{ minHeight: 48 }} placeholder="pcs, sets, m²…" />
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
