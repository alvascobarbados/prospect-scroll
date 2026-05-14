/**
 * Customers master list — spreadsheet-style with Buyer child rows.
 *
 * Columns: Name | Country | Incoterms | Buyer | Email | Contact | (⋯)
 *
 * Each Customer renders as one row group:
 *   - 0 buyers → single row, buyer cells em-dash
 *   - 1 buyer  → single row, buyer cells filled
 *   - 2+ buyers → Name/Country/Incoterms cells span vertically (rowSpan),
 *                 one sub-row per buyer underneath
 *
 * Inline edits save on blur/Enter, all behaviours live in this file.
 */
import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, MoreVertical, Trash2, UserPlus, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { MergeDialog } from "@/components/leads/MergeDialog";
import { BottomSheet } from "@/components/leads/EditorSheets";
import { CodedSelect, DestinationAddSheet } from "@/components/leads/EntityPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMasterData, type Customer, type Buyer, type CustomerCountry, type CustomerIncoterms } from "@/hooks/useMasterData";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { supabase } from "@/integrations/supabase/client";

const COUNTRIES: CustomerCountry[] = ["Local", "Regional"];
const INCOTERMS: (CustomerIncoterms | "")[] = ["", "FOB", "CIF", "LDP", "LDF"];
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** State for the customer-merge confirmation modal. */
type CustomerMergePending = {
  source: Customer;
  target: Customer;
  projectsCount: number;
  buyersCount: number;
};
/** State for the buyer-merge confirmation modal. */
type BuyerMergePending = {
  source: Buyer;
  target: Buyer;
  customerName: string;
};

export const CustomerListPage = () => {
  const navigate = useNavigate();
  const md = useMasterData();
  const user = useCurrentUser();
  const store = usePipelineStore();
  const [q, setQ] = useState("");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [customerMerge, setCustomerMerge] = useState<CustomerMergePending | null>(null);
  const [buyerMerge, setBuyerMerge] = useState<BuyerMergePending | null>(null);
  const [merging, setMerging] = useState(false);

  // Filter: customer matches if its own fields OR any of its buyers match
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return md.customers
      .map((c) => {
        const buyers = md.buyersByCustomer(c.id);
        const customerMatches = !term
          || c.name.toLowerCase().includes(term)
          || (c.country ?? "").toLowerCase().includes(term)
          || (c.incoterms ?? "").toLowerCase().includes(term);
        const matchedBuyers = term
          ? buyers.filter((b) =>
              b.name.toLowerCase().includes(term)
              || (b.email ?? "").toLowerCase().includes(term)
              || (b.contact ?? "").toLowerCase().includes(term))
          : buyers;
        const include = customerMatches || matchedBuyers.length > 0;
        return { customer: c, buyers, include };
      })
      .filter((g) => g.include)
      .sort((a, b) => a.customer.name.localeCompare(b.customer.name));
  }, [md.customers, md.buyers, q]);

  const handleDeleteCustomer = async () => {
    if (!confirmDelete) return;
    const usage = md.customerUsage(confirmDelete.name);
    if (usage > 0) {
      toast.error(`Cannot delete — ${usage} active project${usage === 1 ? "" : "s"} reference this customer.`);
      setConfirmDelete(null);
      return;
    }
    try {
      await md.deleteCustomer(confirmDelete.id);
      toast.success(`${confirmDelete.name} deleted`);
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
    setConfirmDelete(null);
  };

  // Open the customer merge prompt. Counts are computed at prompt time.
  const requestCustomerMerge = (source: Customer, target: Customer) => {
    const projectsCount = store.projects.filter((p) => p.customer === source.name).length;
    const buyersCount = md.buyersByCustomer(source.id).length;
    setCustomerMerge({ source, target, projectsCount, buyersCount });
  };

  const requestBuyerMerge = (source: Buyer, target: Buyer, customerName: string) => {
    setBuyerMerge({ source, target, customerName });
  };

  const handleConfirmCustomerMerge = async () => {
    if (!customerMerge) return;
    setMerging(true);
    try {
      await md.mergeCustomers(customerMerge.source.id, customerMerge.target.id, {
        userId: user.userId, displayName: user.fullName, shortName: user.shortName,
      });
      toast.success(`Merged ${customerMerge.source.name} into ${customerMerge.target.name}.`);
      setCustomerMerge(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Merge failed");
    }
    setMerging(false);
  };

  const handleConfirmBuyerMerge = async () => {
    if (!buyerMerge) return;
    setMerging(true);
    try {
      await md.mergeBuyers(
        buyerMerge.source.id, buyerMerge.target.id,
        { userId: user.userId, displayName: user.fullName, shortName: user.shortName },
        buyerMerge.customerName,
      );
      toast.success(`Merged ${buyerMerge.source.name} with ${buyerMerge.target.name}.`);
      setBuyerMerge(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Merge failed");
    }
    setMerging(false);
  };

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        {/* Top bar */}
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
              <h1
                className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}
              >
                Customers <span className="text-muted-foreground font-light">· {md.customers.length}</span>
              </h1>
            </div>
            <button
              onClick={() => setAddBuyerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border transition-colors hover:bg-muted/50"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 40 }}
            >
              <UserPlus className="h-4 w-4" /> Add Buyer
            </button>
            <button
              onClick={() => setAddCustomerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{ background: "hsl(var(--brand-orange))", color: "white", minHeight: 40 }}
            >
              <Plus className="h-4 w-4" /> Add Customer
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
              placeholder="Search customers, buyers, email, contact…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }}
            />
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                  <Th>Name</Th>
                  <Th>Destination</Th>
                  <Th>Incoterms</Th>
                  <Th>Buyer</Th>
                  <Th>Email</Th>
                  <Th>Contact</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {groups.map(({ customer, buyers }) => (
                  <CustomerGroup
                    key={customer.id}
                    customer={customer}
                    buyers={buyers}
                    onView={() => navigate(`/customers?customer=${customer.id}`)}
                    onAddBuyer={() => setAddBuyerOpen(true)}
                    onDelete={() => setConfirmDelete(customer)}
                    onRequestCustomerMerge={requestCustomerMerge}
                    onRequestBuyerMerge={requestBuyerMerge}
                  />
                ))}
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-sm text-muted-foreground italic px-4 py-12 text-center">
                      {q ? "No matches." : "No customers yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        {/* Add Customer sheet */}
        <AddCustomerSheet open={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} />

        {/* Add Buyer sheet (pick customer + fields) */}
        <AddBuyerSheet open={addBuyerOpen} onClose={() => setAddBuyerOpen(false)} />

        {/* Delete confirm */}
        <ConfirmDialog
          open={!!confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          title={confirmDelete ? `Delete ${confirmDelete.name}?` : ""}
          description={(() => {
            if (!confirmDelete) return "";
            const usage = md.customerUsage(confirmDelete.name);
            const buyerCount = md.buyersByCustomer(confirmDelete.id).length;
            if (usage > 0) return `Cannot delete — ${usage} active project${usage === 1 ? "" : "s"} reference this customer.`;
            return `Delete ${confirmDelete.name} and all ${buyerCount} buyer${buyerCount === 1 ? "" : "s"}? This cannot be undone.`;
          })()}
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteCustomer}
        />

        {/* Customer merge confirm */}
        <MergeDialog
          open={!!customerMerge}
          busy={merging}
          title={customerMerge ? `Merge ${customerMerge.source.name} into ${customerMerge.target.name}?` : ""}
          intro={customerMerge ? `A customer named ${customerMerge.target.name} already exists.\n\nIf you merge them, the following will happen:` : ""}
          bullets={customerMerge ? [
            `${customerMerge.projectsCount} project${customerMerge.projectsCount === 1 ? "" : "s"} currently under ${customerMerge.source.name} will move to ${customerMerge.target.name}`,
            `${customerMerge.buyersCount} buyer${customerMerge.buyersCount === 1 ? "" : "s"} currently under ${customerMerge.source.name} will move to ${customerMerge.target.name}`,
            `${customerMerge.source.name} will be permanently deleted`,
            `Country, Incoterms, and other fields on ${customerMerge.target.name} will be kept as-is — ${customerMerge.source.name}'s values will be discarded`,
            `Activity Log history will remain intact (no rewriting)`,
          ] : []}
          footer="This cannot be undone."
          confirmLabel={customerMerge ? `Merge into ${customerMerge.target.name}` : "Merge"}
          onCancel={() => !merging && setCustomerMerge(null)}
          onConfirm={handleConfirmCustomerMerge}
        />

        {/* Buyer merge confirm */}
        <MergeDialog
          open={!!buyerMerge}
          busy={merging}
          title={buyerMerge ? `Merge ${buyerMerge.source.name} with ${buyerMerge.target.name}?` : ""}
          intro={buyerMerge ? `A buyer named ${buyerMerge.target.name} already exists under ${buyerMerge.customerName}.\n\nIf you merge them:` : ""}
          bullets={buyerMerge ? [
            `${buyerMerge.target.name} will be kept`,
            `${buyerMerge.source.name} will be deleted`,
            `Any email or contact phone on ${buyerMerge.source.name} that ${buyerMerge.target.name} doesn't have will be copied over`,
            `Existing fields on ${buyerMerge.target.name} are not overwritten`,
          ] : []}
          footer="This cannot be undone."
          confirmLabel="Merge buyers"
          onCancel={() => !merging && setBuyerMerge(null)}
          onConfirm={handleConfirmBuyerMerge}
        />
      </div>
    </DesktopAppShell>
  );
};

const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th
    className={cn("text-left text-[10px] uppercase tracking-[0.18em] font-semibold px-3 py-2.5", className)}
    style={{ color: "hsl(var(--brand-navy) / 0.65)" }}
  >
    {children}
  </th>
);

// ─── Customer row group ────────────────────────────────────────────────
const CustomerGroup = ({
  customer, buyers, onView, onAddBuyer, onDelete,
  onRequestCustomerMerge, onRequestBuyerMerge,
}: {
  customer: Customer;
  buyers: Buyer[];
  onView: () => void;
  onAddBuyer: () => void;
  onDelete: () => void;
  onRequestCustomerMerge: (source: Customer, target: Customer) => void;
  onRequestBuyerMerge: (source: Buyer, target: Buyer, customerName: string) => void;
}) => {
  const md = useMasterData();
  const rowCount = Math.max(1, buyers.length);

  // Bumped each time we want EditableText to revert its internal draft to
  // the prop value (e.g. after the user cancels a merge prompt).
  const [nameRevert, setNameRevert] = useState(0);

  const updateName = async (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) { toast.error("Name is required"); setNameRevert((n) => n + 1); return; }
    if (trimmed.toLowerCase() === customer.name.toLowerCase()) { setNameRevert((n) => n + 1); return; }
    const dup = md.findCustomerByName(trimmed, customer.id);
    if (dup) {
      onRequestCustomerMerge(customer, dup);
      setNameRevert((n) => n + 1);
      return;
    }
    try {
      await md.updateCustomer(customer.id, { name: trimmed });
      // Also update free-text customer references on projects so they don't
      // become orphaned after a casual rename.
      await supabase.from("projects").update({ customer: trimmed }).eq("customer", customer.name);
    }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); setNameRevert((n) => n + 1); }
  };
  const updateDestination = async (v: string) => {
    try { await md.updateCustomer(customer.id, { destination_id: v || null }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); }
  };
  const updateIncoterms = async (v: string) => {
    try { await md.updateCustomer(customer.id, { incoterms: (v || null) as any }); }
    catch (err: any) { toast.error(err?.message ?? "Save failed"); }
  };
  const destOptions = useMemo(
    () => [{ value: "", label: customer.country ? `— (${customer.country})` : "—" },
           ...[...md.destinations].sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ value: d.id, label: d.name }))],
    [md.destinations, customer.country],
  );

  // 0 buyers → single empty buyer row
  if (buyers.length === 0) {
    return (
      <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.07)" }} className="hover:bg-muted/20 transition-colors">
        <Td><EditableText key={`name-${nameRevert}`} value={customer.name} onSave={updateName} bold /></Td>
        <Td><DestinationSelect value={customer.destination_id ?? ""} fallback={customer.country} options={destOptions} onSave={updateDestination} /></Td>
        <Td><EditableSelect value={customer.incoterms ?? ""} options={INCOTERMS} onSave={updateIncoterms} placeholder="—" /></Td>
        <Td className="text-muted-foreground italic">—</Td>
        <Td className="text-muted-foreground italic">—</Td>
        <Td className="text-muted-foreground italic">—</Td>
        <Td>
          <RowMenu onView={onView} onAddBuyer={onAddBuyer} onDelete={onDelete} />
        </Td>
      </tr>
    );
  }

  return (
    <>
      {buyers.map((buyer, idx) => (
        <tr
          key={buyer.id}
          className="hover:bg-muted/20 transition-colors"
          style={{
            borderBottom: idx === buyers.length - 1
              ? "1px solid hsl(var(--brand-navy) / 0.1)"
              : "1px dashed hsl(var(--brand-navy) / 0.05)",
          }}
        >
          {idx === 0 && (
            <>
              <Td rowSpan={rowCount} className="align-top">
                <EditableText key={`name-${nameRevert}`} value={customer.name} onSave={updateName} bold />
              </Td>
              <Td rowSpan={rowCount} className="align-top">
                <DestinationSelect value={customer.destination_id ?? ""} fallback={customer.country} options={destOptions} onSave={updateDestination} />
              </Td>
              <Td rowSpan={rowCount} className="align-top">
                <EditableSelect value={customer.incoterms ?? ""} options={INCOTERMS} onSave={updateIncoterms} placeholder="—" />
              </Td>
            </>
          )}
          <Td><BuyerNameCell buyer={buyer} customerName={customer.name} onRequestMerge={onRequestBuyerMerge} /></Td>
          <Td><BuyerEmailCell buyer={buyer} /></Td>
          <Td><BuyerContactCell buyer={buyer} /></Td>
          {idx === 0 && (
            <Td rowSpan={rowCount} className="align-top">
              <RowMenu onView={onView} onAddBuyer={onAddBuyer} onDelete={onDelete} />
            </Td>
          )}
        </tr>
      ))}
    </>
  );
};

const Td = ({ children, className, rowSpan }: { children?: React.ReactNode; className?: string; rowSpan?: number }) => (
  <td className={cn("px-3 py-2 text-[13px]", className)} rowSpan={rowSpan} style={{ color: "hsl(var(--brand-navy))" }}>
    {children}
  </td>
);

// ─── Buyer cell editors ────────────────────────────────────────────────
const BuyerNameCell = ({
  buyer, customerName, onRequestMerge,
}: {
  buyer: Buyer;
  customerName: string;
  onRequestMerge: (source: Buyer, target: Buyer, customerName: string) => void;
}) => {
  const md = useMasterData();
  const [revert, setRevert] = useState(0);
  return (
    <EditableText
      key={`bn-${revert}`}
      value={buyer.name}
      onSave={async (v) => {
        const t = v.trim();
        if (!t) { toast.error("Buyer name required"); setRevert((n) => n + 1); return; }
        if (t.toLowerCase() === buyer.name.toLowerCase()) { setRevert((n) => n + 1); return; }
        const dup = md.findBuyerByName(buyer.customer_id, t, buyer.id);
        if (dup) { onRequestMerge(buyer, dup, customerName); setRevert((n) => n + 1); return; }
        try { await md.updateBuyer(buyer.id, { name: t }); }
        catch (err: any) { toast.error(err?.message ?? "Save failed"); setRevert((n) => n + 1); }
      }}
    />
  );
};
const BuyerEmailCell = ({ buyer }: { buyer: Buyer }) => {
  const md = useMasterData();
  return (
    <EditableText
      value={buyer.email ?? ""}
      placeholder="—"
      onSave={async (v) => {
        const t = v.trim().toLowerCase();
        if (t && !emailOk(t)) { toast.error("Invalid email"); return; }
        if ((t || null) === (buyer.email ?? null)) return;
        try { await md.updateBuyer(buyer.id, { email: t || null }); }
        catch (err: any) { toast.error(err?.message ?? "Save failed"); }
      }}
    />
  );
};
const BuyerContactCell = ({ buyer }: { buyer: Buyer }) => {
  const md = useMasterData();
  return (
    <EditableText
      value={buyer.contact ?? ""}
      placeholder="—"
      onSave={async (v) => {
        const t = v.trim();
        if ((t || null) === (buyer.contact ?? null)) return;
        try { await md.updateBuyer(buyer.id, { contact: t || null }); }
        catch (err: any) { toast.error(err?.message ?? "Save failed"); }
      }}
    />
  );
};

// ─── Inline editable primitives ────────────────────────────────────────
export const EditableText = ({
  value, placeholder, onSave, bold,
}: { value: string; placeholder?: string; onSave: (v: string) => void; bold?: boolean }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setDraft(value); setTimeout(() => ref.current?.select(), 0); } }, [editing, value]);

  if (editing) {
    return (
      <input
        ref={ref}
        defaultValue={value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onSave(draft); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.currentTarget.blur(); }
          else if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className="w-full px-1.5 py-0.5 rounded border bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.3)" }}
      />
    );
  }
  const display = value || placeholder || "—";
  const isEmpty = !value;
  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "w-full text-left px-1.5 py-0.5 rounded hover:bg-muted/40 truncate",
        bold && "font-semibold",
        isEmpty && "italic text-muted-foreground",
      )}
      style={{ minHeight: 28 }}
    >
      {display}
    </button>
  );
};

export const EditableSelect = ({
  value, options, onSave, placeholder,
}: { value: string; options: readonly string[]; onSave: (v: string) => void; placeholder?: string }) => {
  return (
    <select
      value={value}
      onChange={(e) => onSave(e.target.value)}
      className="w-full px-1.5 py-0.5 rounded text-[13px] bg-transparent hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)] cursor-pointer"
      style={{ minHeight: 28, color: "hsl(var(--brand-navy))" }}
    >
      {options.map((o) => <option key={o || "_"} value={o}>{o || (placeholder ?? "—")}</option>)}
    </select>
  );
};

const ADD_NEW_DEST = "__add_new_destination__";

const DestinationSelect = ({
  value, fallback, options, onSave,
}: { value: string; fallback?: string | null; options: { value: string; label: string }[]; onSave: (v: string) => void }) => {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === ADD_NEW_DEST) { setAdding(true); return; }
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
        <option value={ADD_NEW_DEST} style={{ color: "hsl(var(--brand-orange))", fontWeight: 600 }}>+ Add new destination</option>
      </select>
      <DestinationAddSheet
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => { setAdding(false); onSave(id); }}
      />
    </>
  );
};

// ─── Row menu ──────────────────────────────────────────────────────────
const RowMenu = ({ onView, onAddBuyer, onDelete }: { onView: () => void; onAddBuyer: () => void; onDelete: () => void }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button aria-label="More" className="p-1 rounded hover:bg-muted/50" onClick={(e) => e.stopPropagation()}>
        <MoreVertical className="h-4 w-4" style={{ color: "hsl(var(--brand-navy) / 0.6)" }} />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-48 p-1">
      <MenuItem icon={<Eye className="h-4 w-4" />} label="View profile" onClick={onView} />
      <MenuItem icon={<UserPlus className="h-4 w-4" />} label="Add buyer" onClick={onAddBuyer} />
      <div className="my-1 border-t border-border/60" />
      <MenuItem icon={<Trash2 className="h-4 w-4" />} label="Delete customer" onClick={onDelete} destructive />
    </PopoverContent>
  </Popover>
);

const MenuItem = ({ icon, label, onClick, destructive }: { icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-muted/50"
    style={destructive ? { color: "hsl(var(--urgent))" } : undefined}
  >
    {icon} {label}
  </button>
);

// ─── Add Customer sheet ────────────────────────────────────────────────
const AddCustomerSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const md = useMasterData();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [destinationId, setDestinationId] = useState<string>("");
  const [incoterms, setIncoterms] = useState<"" | CustomerIncoterms>("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<Customer | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(""); setDestinationId(""); setIncoterms("");
    setBuyerName(""); setBuyerEmail(""); setBuyerContact("");
    setConflict(null);
  }, [open]);

  // Live conflict detection — clear/refresh on every keystroke.
  useEffect(() => {
    const t = name.trim();
    if (!t) { setConflict(null); return; }
    setConflict(md.findCustomerByName(t) ?? null);
  }, [name, md]);

  const submit = async () => {
    const t = name.trim();
    if (!t) { toast.error("Name is required"); return; }
    if (conflict) return; // inline error already shown
    if (buyerEmail.trim() && !emailOk(buyerEmail.trim())) { toast.error("Invalid buyer email"); return; }
    setSaving(true);
    try {
      const c = await md.addCustomer({ name: t, destination_id: destinationId || null, incoterms: (incoterms || null) as any });
      if (buyerName.trim()) {
        await md.addBuyer(c.id, {
          name: buyerName.trim(),
          email: buyerEmail.trim().toLowerCase() || null,
          contact: buyerContact.trim() || null,
        });
      }
      toast.success(`Customer "${c.name}" added`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    }
    setSaving(false);
  };

  const inputCls = "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]";
  const labelCls = "block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5";

  return (
    <BottomSheet open={open} onClose={onClose} title="Add customer" onSave={submit} saveLabel="Add" saveDisabled={saving || !!conflict}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(inputCls, conflict && "border-[hsl(var(--urgent))]")}
            style={{ minHeight: 48 }}
            autoFocus
          />
          {conflict && (
            <div className="mt-1.5 text-[12px]" style={{ color: "hsl(var(--urgent))" }}>
              A customer named <span className="font-semibold">{conflict.name}</span> already exists.{" "}
              <button
                type="button"
                onClick={() => { onClose(); navigate(`/customers?customer=${conflict.id}`); }}
                className="underline font-medium"
              >
                Open it
              </button>
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>Destination</label>
          <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className={inputCls} style={{ minHeight: 48 }}>
            <option value="">— None —</option>
            {[...md.destinations].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Incoterms (optional)</label>
          <select value={incoterms} onChange={(e) => setIncoterms(e.target.value as any)} className={inputCls} style={{ minHeight: 48 }}>
            <option value="">—</option>
            {(["FOB","CIF","LDP","LDF"] as const).map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div className="pt-3 mt-1 border-t border-border/60">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-2">First buyer (optional)</div>
          <div className="space-y-2">
            <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Buyer name" className={inputCls} style={{ minHeight: 44 }} />
            <input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="Email (optional)" type="email" className={inputCls} style={{ minHeight: 44 }} />
            <input value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} placeholder="Contact / phone (optional)" className={inputCls} style={{ minHeight: 44 }} />
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};

// ─── Add Buyer sheet ───────────────────────────────────────────────────
export const AddBuyerSheet = ({
  open, onClose, fixedCustomerId, onCreated,
}: { open: boolean; onClose: () => void; fixedCustomerId?: string; onCreated?: (buyerId: string) => void }) => {
  const md = useMasterData();
  const [customerId, setCustomerId] = useState<string>(fixedCustomerId ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerId(fixedCustomerId ?? "");
    setName(""); setEmail(""); setContact(""); setSearch("");
  }, [open, fixedCustomerId]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return md.customers
      .filter((c) => !t || c.name.toLowerCase().includes(t))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [md.customers, search]);

  const selectedCustomer = md.customers.find((c) => c.id === customerId);
  const buyerConflict = useMemo(() => {
    const t = name.trim();
    if (!t || !customerId) return null;
    return md.findBuyerByName(customerId, t) ?? null;
  }, [md, customerId, name]);

  const submit = async () => {
    if (!customerId) { toast.error("Pick a customer"); return; }
    const t = name.trim();
    if (!t) { toast.error("Buyer name required"); return; }
    if (buyerConflict) return; // inline error already shown
    if (email.trim() && !emailOk(email.trim())) { toast.error("Invalid email"); return; }
    setSaving(true);
    try {
      const created = await md.addBuyer(customerId, {
        name: t,
        email: email.trim().toLowerCase() || null,
        contact: contact.trim() || null,
      });
      toast.success(`Buyer "${t}" added`);
      onCreated?.(created.id);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    }
    setSaving(false);
  };

  const inputCls = "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]";
  const labelCls = "block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5";

  return (
    <BottomSheet open={open} onClose={onClose} title="Add buyer" onSave={submit} saveLabel="Add" saveDisabled={saving || !!buyerConflict}>
      <div className="space-y-3">
        {!fixedCustomerId && (
          <div>
            <label className={labelCls}>Customer</label>
            {selectedCustomer ? (
              <div className="flex items-center gap-2">
                <div className={cn(inputCls, "flex-1")} style={{ minHeight: 48 }}>{selectedCustomer.name}</div>
                <button onClick={() => setCustomerId("")} className="text-xs text-muted-foreground underline">Change</button>
              </div>
            ) : (
              <>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search customers…"
                  className={inputCls}
                  style={{ minHeight: 44, marginBottom: 6 }}
                  autoFocus
                />
                <ul className="max-h-48 overflow-y-auto rounded-xl border border-border bg-card">
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setCustomerId(c.id)}
                        className="w-full text-left px-3 py-2 text-[14px] hover:bg-muted/40"
                      >
                        {c.name} <span className="text-muted-foreground text-[12px]">· {c.country}</span>
                      </button>
                    </li>
                  ))}
                  {filtered.length === 0 && (
                    <li className="px-3 py-3 text-[13px] italic text-muted-foreground text-center">No matches</li>
                  )}
                </ul>
              </>
            )}
          </div>
        )}
        <div>
          <label className={labelCls}>Buyer name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(inputCls, buyerConflict && "border-[hsl(var(--urgent))]")}
            style={{ minHeight: 48 }}
          />
          {buyerConflict && selectedCustomer && (
            <div className="mt-1.5 text-[12px]" style={{ color: "hsl(var(--urgent))" }}>
              <span className="font-semibold">{buyerConflict.name}</span> is already a buyer for{" "}
              <span className="font-semibold">{selectedCustomer.name}</span>.
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>Email (optional)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} style={{ minHeight: 48 }} />
        </div>
        <div>
          <label className={labelCls}>Contact / phone (optional)</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} className={inputCls} style={{ minHeight: 48 }} />
        </div>
      </div>
    </BottomSheet>
  );
};

export default CustomerListPage;
