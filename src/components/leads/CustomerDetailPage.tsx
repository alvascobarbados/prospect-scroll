/**
 * Customer detail page. Mounted under /customers via MasterList.tsx
 * when ?customer=ID is present. Mirrors TeamMemberPage structure:
 * sticky header → Profile → Buyers → Assigned Projects.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, MoreVertical, Trash2, UserPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { SectionHeader, SectionCard, DetailRow } from "@/components/leads/ProjectDetail";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { MergeDialog } from "@/components/leads/MergeDialog";
import { BottomSheet } from "@/components/leads/EditorSheets";
import { CodedSelect } from "@/components/leads/EntityPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMasterData, type Buyer, type Customer, type CustomerCountry, type CustomerIncoterms } from "@/hooks/useMasterData";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { AddBuyerSheet } from "@/components/leads/CustomerListPage";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

type EditorKind = "name" | "country" | "incoterms" | null;

export const CustomerDetailPage = ({ customerId }: { customerId: string }) => {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const md = useMasterData();
  const store = usePipelineStore();
  const user = useCurrentUser();

  const customer = md.customers.find((c) => c.id === customerId);
  const buyers = useMemo(() => md.buyersByCustomer(customerId), [md, customerId]);
  const projects = useMemo(
    () => store.projects.filter((p) => customer && p.customer === customer.name),
    [store.projects, customer],
  );

  const [editor, setEditor] = useState<EditorKind>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState<Buyer | null>(null);
  const [confirmDeleteBuyer, setConfirmDeleteBuyer] = useState<Buyer | null>(null);
  const [customerMerge, setCustomerMerge] = useState<{ source: Customer; target: Customer; projectsCount: number; buyersCount: number } | null>(null);
  const [buyerMerge, setBuyerMerge] = useState<{ source: Buyer; target: Buyer } | null>(null);
  const [merging, setMerging] = useState(false);

  const requestCustomerMerge = (target: Customer) => {
    if (!customer) return;
    setCustomerMerge({
      source: customer, target,
      projectsCount: projects.length,
      buyersCount: buyers.length,
    });
  };
  const requestBuyerMerge = (source: Buyer, target: Buyer) => {
    setBuyerMerge({ source, target });
  };

  const handleConfirmCustomerMerge = async () => {
    if (!customerMerge) return;
    setMerging(true);
    try {
      const targetId = customerMerge.target.id;
      const targetName = customerMerge.target.name;
      const sourceName = customerMerge.source.name;
      await md.mergeCustomers(customerMerge.source.id, targetId, {
        userId: user.userId, displayName: user.fullName, shortName: user.shortName,
      });
      toast.success(`Merged ${sourceName} into ${targetName}.`);
      setCustomerMerge(null);
      setEditor(null);
      // Source customer is gone — navigate to the survivor.
      navigate(`/customers?customer=${targetId}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Merge failed");
    }
    setMerging(false);
  };

  const handleConfirmBuyerMerge = async () => {
    if (!buyerMerge || !customer) return;
    setMerging(true);
    try {
      await md.mergeBuyers(
        buyerMerge.source.id, buyerMerge.target.id,
        { userId: user.userId, displayName: user.fullName, shortName: user.shortName },
        customer.name,
      );
      toast.success(`Merged ${buyerMerge.source.name} with ${buyerMerge.target.name}.`);
      setBuyerMerge(null);
      setEditingBuyer(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Merge failed");
    }
    setMerging(false);
  };

  if (!customer) {
    return (
      <DesktopAppShell>
        <div className="min-h-dvh p-8 text-center text-muted-foreground">
          Customer not found.{" "}
          <button onClick={() => navigate("/customers")} className="underline">Back to customers</button>
        </div>
      </DesktopAppShell>
    );
  }

  const closeDetail = () => setSearchParams({});

  const handleDeleteCustomer = async () => {
    if (projects.length > 0) {
      toast.error(`Cannot delete — ${projects.length} active project${projects.length === 1 ? "" : "s"} reference this customer.`);
      setConfirmDelete(false);
      return;
    }
    try {
      await md.deleteCustomer(customer.id);
      toast.success(`${customer.name} deleted`);
      navigate("/customers");
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
  };

  const handleDeleteBuyer = async () => {
    if (!confirmDeleteBuyer) return;
    try {
      await md.deleteBuyer(confirmDeleteBuyer.id);
      toast.success(`Buyer "${confirmDeleteBuyer.name}" deleted`);
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
    setConfirmDeleteBuyer(null);
  };

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        <header
          className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
            <button onClick={closeDetail} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted/50">
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Customer</div>
              <h1
                className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}
              >
                {customer.name}
              </h1>
              <div className="text-[12px] text-muted-foreground">
                {(md.destinations.find((d) => d.id === customer.destination_id)?.name) ?? customer.country} · {projects.length} project{projects.length === 1 ? "" : "s"}
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button aria-label="More" className="p-2 rounded-full hover:bg-muted/50">
                  <MoreVertical className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-1">
                <button
                  onClick={() => setAddBuyerOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-muted/50"
                >
                  <UserPlus className="h-4 w-4" /> Add buyer
                </button>
                <div className="my-1 border-t border-border/60" />
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-muted/50"
                  style={{ color: "hsl(var(--urgent))" }}
                >
                  <Trash2 className="h-4 w-4" /> Delete customer
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">
          {/* PROFILE */}
          <section>
            <SectionHeader>Profile</SectionHeader>
            <SectionCard>
              <DetailRow label="Name" value={customer.name} onClick={() => setEditor("name")} />
              <DetailRow label="Destination" value={(md.destinations.find((d) => d.id === customer.destination_id)?.name) ?? (customer.country ? `${customer.country} (legacy)` : undefined)} onClick={() => setEditor("country")} />
              <DetailRow label="Incoterms" value={customer.incoterms ?? undefined} onClick={() => setEditor("incoterms")} />
            </SectionCard>
          </section>

          {/* BUYERS */}
          <section>
            <SectionHeader>Buyers · {buyers.length}</SectionHeader>
            <SectionCard>
              {buyers.length === 0 ? (
                <div className="py-2">
                  <div className="text-[13px] italic text-muted-foreground mb-2">No buyers yet</div>
                  <button
                    onClick={() => setAddBuyerOpen(true)}
                    className="inline-flex items-center gap-1 text-[13px] font-medium"
                    style={{ color: "hsl(var(--brand-orange))" }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add first buyer
                  </button>
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }}>
                  {buyers.map((b) => (
                    <li key={b.id} className="py-3 flex items-center gap-3">
                      <button
                        onClick={() => setEditingBuyer(b)}
                        className="flex-1 min-w-0 text-left hover:bg-muted/30 -mx-2 px-2 py-1 rounded-md"
                      >
                        <div className="text-[14px] font-semibold truncate" style={{ color: "hsl(var(--brand-navy))" }}>{b.name}</div>
                        <div className="text-[12px] text-muted-foreground truncate">
                          {[b.email, b.contact].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button aria-label="More" className="p-1.5 rounded hover:bg-muted/50">
                            <MoreVertical className="h-4 w-4" style={{ color: "hsl(var(--brand-navy) / 0.6)" }} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-44 p-1">
                          <button
                            onClick={() => setConfirmDeleteBuyer(b)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-muted/50"
                            style={{ color: "hsl(var(--urgent))" }}
                          >
                            <Trash2 className="h-4 w-4" /> Delete buyer
                          </button>
                        </PopoverContent>
                      </Popover>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 pt-3 border-t border-border/60">
                <button
                  onClick={() => setAddBuyerOpen(true)}
                  className="inline-flex items-center gap-1 text-[13px] font-medium"
                  style={{ color: "hsl(var(--brand-orange))" }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add buyer
                </button>
              </div>
            </SectionCard>
          </section>

          {/* ASSIGNED PROJECTS */}
          <section>
            <SectionHeader>Assigned Projects · {projects.length}</SectionHeader>
            <SectionCard>
              {projects.length === 0 ? (
                <div className="text-[13px] italic text-muted-foreground py-2">No projects yet</div>
              ) : (
                <ul className="divide-y" style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }}>
                  {projects.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => navigate(`/?project=${encodeURIComponent(p.id)}`)}
                        className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-muted/30 -mx-2 px-2 rounded-md"
                      >
                        <span className="min-w-0 truncate text-[14px]" style={{ color: "hsl(var(--brand-navy))" }}>
                          <span className="font-semibold">{p.projectName}</span>
                        </span>
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
                          style={{ backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}
                        >
                          {p.pipeline} · {p.stage}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </section>
        </main>

        <CustomerFieldEditor
          open={editor !== null}
          kind={editor}
          customer={customer}
          onClose={() => setEditor(null)}
          onRequestMerge={requestCustomerMerge}
        />

        <BuyerEditorSheet
          open={!!editingBuyer}
          buyer={editingBuyer}
          onClose={() => setEditingBuyer(null)}
          onRequestMerge={requestBuyerMerge}
        />

        <AddBuyerSheet open={addBuyerOpen} onClose={() => setAddBuyerOpen(false)} fixedCustomerId={customer.id} />

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

        <MergeDialog
          open={!!buyerMerge}
          busy={merging}
          title={buyerMerge ? `Merge ${buyerMerge.source.name} with ${buyerMerge.target.name}?` : ""}
          intro={buyerMerge && customer ? `A buyer named ${buyerMerge.target.name} already exists under ${customer.name}.\n\nIf you merge them:` : ""}
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

        <ConfirmDialog
          open={confirmDelete}
          onCancel={() => setConfirmDelete(false)}
          title={`Delete ${customer.name}?`}
          description={
            projects.length > 0
              ? `Cannot delete — ${projects.length} active project${projects.length === 1 ? "" : "s"} reference this customer.`
              : `Delete ${customer.name} and all ${buyers.length} buyer${buyers.length === 1 ? "" : "s"}? This cannot be undone.`
          }
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteCustomer}
        />

        <ConfirmDialog
          open={!!confirmDeleteBuyer}
          onCancel={() => setConfirmDeleteBuyer(null)}
          title={confirmDeleteBuyer ? `Delete ${confirmDeleteBuyer.name}?` : ""}
          description="This buyer will be removed from this customer."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteBuyer}
        />
      </div>
    </DesktopAppShell>
  );
};

// ─── Customer single-field editor ──────────────────────────────────────
const CustomerFieldEditor = ({
  open, kind, customer, onClose, onRequestMerge,
}: {
  open: boolean;
  kind: EditorKind;
  customer: { id: string; name: string; country: CustomerCountry; incoterms?: CustomerIncoterms | null };
  onClose: () => void;
  onRequestMerge: (target: Customer) => void;
}) => {
  const md = useMasterData();
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  useState(() => {});
  if (!kind) return null;
  // Initialise on open
  if (open && val === "" && kind === "name") setVal(customer.name);

  const titles: Record<NonNullable<EditorKind>, string> = {
    name: "Edit name", country: "Edit country", incoterms: "Edit incoterms",
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (kind === "name") {
        const t = val.trim();
        if (!t) { toast.error("Name is required"); setSaving(false); return; }
        if (t.toLowerCase() === customer.name.toLowerCase()) { onClose(); setSaving(false); return; }
        const dup = md.findCustomerByName(t, customer.id);
        if (dup) {
          onRequestMerge(dup);
          setSaving(false);
          return;
        }
        const oldName = customer.name;
        await md.updateCustomer(customer.id, { name: t });
        // Keep free-text project references in sync.
        await supabase.from("projects").update({ customer: t }).eq("customer", oldName);
      } else if (kind === "country") {
        await md.updateCustomer(customer.id, { destination_id: (val || null) as any });
      } else if (kind === "incoterms") {
        await md.updateCustomer(customer.id, { incoterms: (val || null) as any });
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    }
    setSaving(false);
  };

  const inputCls = "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]";

  return (
    <BottomSheet open={open} onClose={onClose} title={kind === "country" ? "Edit destination" : titles[kind]} onSave={submit} saveLabel="Save" saveDisabled={saving}>
      <div className="space-y-3">
        {kind === "name" && (
          <input
            defaultValue={customer.name}
            onChange={(e) => setVal(e.target.value)}
            className={inputCls} style={{ minHeight: 48 }} autoFocus
          />
        )}
        {kind === "country" && (
          <select defaultValue={(customer as any).destination_id ?? ""} onChange={(e) => setVal(e.target.value)} className={inputCls} style={{ minHeight: 48 }}>
            <option value="">— None —</option>
            {[...md.destinations].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
        {kind === "incoterms" && (
          <select defaultValue={customer.incoterms ?? ""} onChange={(e) => setVal(e.target.value)} className={inputCls} style={{ minHeight: 48 }}>
            <option value="">—</option>
            <option value="FOB">FOB</option>
            <option value="CIF">CIF</option>
            <option value="LDP">LDP</option>
            <option value="LDF">LDF</option>
          </select>
        )}
      </div>
    </BottomSheet>
  );
};

// ─── Buyer editor sheet ────────────────────────────────────────────────
const BuyerEditorSheet = ({
  open, buyer, onClose, onRequestMerge,
}: {
  open: boolean;
  buyer: Buyer | null;
  onClose: () => void;
  onRequestMerge: (source: Buyer, target: Buyer) => void;
}) => {
  const md = useMasterData();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-init form when opened
  useMemo(() => {
    if (buyer) {
      setName(buyer.name);
      setEmail(buyer.email ?? "");
      setContact(buyer.contact ?? "");
    }
  }, [buyer?.id]);

  if (!buyer) return null;

  const submit = async () => {
    const t = name.trim();
    if (!t) { toast.error("Name required"); return; }
    if (email.trim() && !emailOk(email.trim())) { toast.error("Invalid email"); return; }
    if (t.toLowerCase() !== buyer.name.toLowerCase()) {
      const dup = md.findBuyerByName(buyer.customer_id, t, buyer.id);
      if (dup) { onRequestMerge(buyer, dup); return; }
    }
    setSaving(true);
    try {
      await md.updateBuyer(buyer.id, {
        name: t,
        email: email.trim().toLowerCase() || null,
        contact: contact.trim() || null,
      });
      toast.success("Saved");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    }
    setSaving(false);
  };

  const inputCls = "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]";
  const labelCls = "block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5";

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit buyer" onSave={submit} saveLabel="Save" saveDisabled={saving}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} style={{ minHeight: 48 }} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} style={{ minHeight: 48 }} />
        </div>
        <div>
          <label className={labelCls}>Contact</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} className={inputCls} style={{ minHeight: 48 }} />
        </div>
      </div>
    </BottomSheet>
  );
};

export default CustomerDetailPage;
