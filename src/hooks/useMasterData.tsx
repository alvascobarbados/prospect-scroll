/**
 * Master data lives in Lovable Cloud:
 *   customers / suppliers / team_members / products
 *
 * No auth yet — single shared workspace, public read/write.
 *
 * This hook is the single source of truth for reference data. It exposes:
 *   - Live arrays (synced via realtime + initial fetch)
 *   - add/update/delete for each entity
 *   - usage counts cross-referenced against `usePipelineStore.projects`
 *   - meta-options (TBD/Various/Unassigned for suppliers, "Custom (free text)" for products)
 *
 * Suppliers carry a `legacy_id` so existing project records that reference
 * `sup-freedom`, `sup-admax`, etc. keep working. Resolve a supplier by id
 * with `getSupplierByAnyId(idOrLegacyId)`.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import type { ShippingMode } from "@/data/pipelines";

// ─── Entity shapes ────────────────────────────────────────────────────────
export type CustomerCountry = "Local" | "Regional";
export type CustomerIncoterms = "FOB" | "CIF" | "LDP" | "LDF";

export interface Customer {
  id: string;
  name: string;
  country: CustomerCountry;
  destination_id?: string | null;
  incoterms?: CustomerIncoterms | null;
  // Legacy fields retained for now; not surfaced in the new UI.
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  default_shipping_mode?: ShippingMode | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OriginRecord { id: string; code: string; name: string; notes?: string | null }
export interface DestinationRecord { id: string; code: string; name: string; notes?: string | null }

export interface Buyer {
  id: string;
  customer_id: string;
  name: string;
  email?: string | null;
  contact?: string | null;
  created_at: string;
  updated_at: string;
}
export type WeightUnit = "kg" | "lbs";
export type VolumeUnit = "cbm" | "cuft";
export interface SupplierRecord {
  id: string;
  name: string;
  country?: string | null;
  origin_id?: string | null;
  weight_unit: WeightUnit;
  volume_unit: VolumeUnit;
  default_shipping_mode?: ShippingMode | null;
  notes?: string | null;
  legacy_id?: string | null;
  created_at: string;
  updated_at: string;
}
export interface TeamMember {
  id: string;
  initials: string;
  full_name: string;
  role?: "Sales" | "Production" | "Finance" | "Admin" | "Mixed" | "Design" | "Other" | string | null;
  email?: string | null;
  created_at: string;
  updated_at: string;
}
export interface ProductRecord {
  id: string;
  name: string;
  default_unit?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type EntityKind = "customer" | "supplier" | "team" | "product";

// Sales-rep multi-select on a project is a string[] of initials.
// We parse legacy `pointPerson` strings ("AV" or "TS, CB") into arrays.
export function parseInitials(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw.split(/[,\s/]+/).map((s) => s.trim()).filter(Boolean);
}
export function formatInitials(arr: string[]): string {
  return arr.join(", ");
}

interface Ctx {
  customers: Customer[];
  suppliers: SupplierRecord[];
  teamMembers: TeamMember[];
  products: ProductRecord[];
  buyers: Buyer[];
  origins: OriginRecord[];
  destinations: DestinationRecord[];
  loading: boolean;

  // Resolve a supplier by either its UUID id or its legacy "sup-…" id.
  getSupplierByAnyId: (id?: string | null) => SupplierRecord | undefined;
  // Resolve a team member by initials (case-insensitive).
  getTeamByInitials: (initials: string) => TeamMember | undefined;
  // Buyers belonging to a given customer.
  buyersByCustomer: (customerId: string) => Buyer[];

  // Usage counts (live projects, excluding trashed).
  customerUsage: (name: string) => number;
  supplierUsage: (id: string, legacyId?: string | null) => number;
  teamUsage: (initials: string) => number;
  productUsage: (name: string) => number;

  // CRUD
  addCustomer: (input: Partial<Customer> & { name: string }) => Promise<Customer>;
  updateCustomer: (id: string, patch: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;

  addSupplier: (input: Partial<SupplierRecord> & { name: string }) => Promise<SupplierRecord>;
  updateSupplier: (id: string, patch: Partial<SupplierRecord>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;

  addTeamMember: (input: { initials: string; full_name: string; role?: TeamMember["role"]; email?: string }) => Promise<TeamMember>;
  updateTeamMember: (id: string, patch: Partial<TeamMember>) => Promise<void>;
  deleteTeamMember: (id: string) => Promise<void>;

  addProduct: (input: { name: string; default_unit?: string; notes?: string }) => Promise<ProductRecord>;
  updateProduct: (id: string, patch: Partial<ProductRecord>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  addBuyer: (customerId: string, input: { name: string; email?: string | null; contact?: string | null }) => Promise<Buyer>;
  updateBuyer: (id: string, patch: Partial<Pick<Buyer, "name" | "email" | "contact">>) => Promise<void>;
  deleteBuyer: (id: string) => Promise<void>;

  addOrigin: (input: { code: string; name: string; notes?: string | null }) => Promise<OriginRecord>;
  addDestination: (input: { code: string; name: string; notes?: string | null }) => Promise<DestinationRecord>;

  // Case-insensitive lookups (used by merge prompts + add validation)
  findCustomerByName: (name: string, excludeId?: string) => Customer | undefined;
  findBuyerByName: (customerId: string, name: string, excludeId?: string) => Buyer | undefined;

  // Merge operations
  mergeCustomers: (
    sourceId: string,
    targetId: string,
    actor: { userId: string; displayName: string; shortName: string },
  ) => Promise<{ projectsMoved: number; buyersMoved: number }>;
  mergeBuyers: (
    sourceId: string,
    targetId: string,
    actor: { userId: string; displayName: string; shortName: string },
    customerName: string,
  ) => Promise<{ fieldsCopied: string[]; projectsMoved: number }>;
}

const MasterDataCtx = createContext<Ctx | null>(null);

export const MasterDataProvider = ({ children }: { children: ReactNode }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [origins, setOrigins] = useState<OriginRecord[]>([]);
  const [destinations, setDestinations] = useState<DestinationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch + realtime
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [c, s, t, p, b, o, d] = await Promise.all([
        supabase.from("customers").select("*").order("name"),
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("team_members").select("*").order("initials"),
        supabase.from("products").select("*").order("name"),
        supabase.from("buyers").select("*").order("name"),
        supabase.from("origins").select("*").order("name"),
        supabase.from("destinations").select("*").order("name"),
      ]);
      if (!mounted) return;
      if (c.data) setCustomers(c.data as Customer[]);
      if (s.data) setSuppliers(s.data as SupplierRecord[]);
      if (t.data) setTeamMembers(t.data as TeamMember[]);
      if (p.data) setProducts(p.data as ProductRecord[]);
      if (b.data) setBuyers(b.data as Buyer[]);
      if (o.data) setOrigins(o.data as OriginRecord[]);
      if (d.data) setDestinations(d.data as DestinationRecord[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("master-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, async () => {
        const { data } = await supabase.from("customers").select("*").order("name");
        if (data) setCustomers(data as Customer[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers" }, async () => {
        const { data } = await supabase.from("suppliers").select("*").order("name");
        if (data) setSuppliers(data as SupplierRecord[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, async () => {
        const { data } = await supabase.from("team_members").select("*").order("initials");
        if (data) setTeamMembers(data as TeamMember[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, async () => {
        const { data } = await supabase.from("products").select("*").order("name");
        if (data) setProducts(data as ProductRecord[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "buyers" }, async () => {
        const { data } = await supabase.from("buyers").select("*").order("name");
        if (data) setBuyers(data as Buyer[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "origins" }, async () => {
        const { data } = await supabase.from("origins").select("*").order("name");
        if (data) setOrigins(data as OriginRecord[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "destinations" }, async () => {
        const { data } = await supabase.from("destinations").select("*").order("name");
        if (data) setDestinations(data as DestinationRecord[]);
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // ─── Lookups ────────────────────────────────────────────────────────────
  const supplierByAnyId = useMemo(() => {
    const m = new Map<string, SupplierRecord>();
    for (const s of suppliers) {
      m.set(s.id, s);
      if (s.legacy_id) m.set(s.legacy_id, s);
    }
    return m;
  }, [suppliers]);
  const getSupplierByAnyId = useCallback(
    (id?: string | null) => (id ? supplierByAnyId.get(id) : undefined),
    [supplierByAnyId],
  );

  const teamByInitials = useMemo(() => {
    const m = new Map<string, TeamMember>();
    for (const t of teamMembers) m.set(t.initials.toUpperCase(), t);
    return m;
  }, [teamMembers]);
  const getTeamByInitials = useCallback(
    (init: string) => teamByInitials.get(init.toUpperCase()),
    [teamByInitials],
  );

  // ─── Usage counts (cross-referenced against in-memory projects) ─────────
  const store = usePipelineStore();
  const projects = store.projects;

  const customerUsage = useCallback(
    (name: string) => projects.filter((p) => p.customer === name).length,
    [projects],
  );
  const supplierUsage = useCallback(
    (id: string, legacyId?: string | null) =>
      projects.filter((p) => p.supplierId === id || (legacyId && p.supplierId === legacyId)).length,
    [projects],
  );
  const teamUsage = useCallback(
    (initials: string) => {
      const I = initials.toUpperCase();
      return projects.filter((p) => parseInitials(p.pointPerson).map((s) => s.toUpperCase()).includes(I)).length;
    },
    [projects],
  );
  const productUsage = useCallback(
    (name: string) =>
      projects.reduce(
        (n, p) => n + (p.lineItems?.filter((li) => li.description === name).length ?? 0),
        0,
      ),
    [projects],
  );

  // ─── CRUD ───────────────────────────────────────────────────────────────
  const addCustomer = useCallback(async (input: Partial<Customer> & { name: string }) => {
    const { data, error } = await supabase
      .from("customers")
      .insert({ ...input })
      .select()
      .single();
    if (error) throw error;
    setCustomers((prev) => [...prev.filter((c) => c.id !== data.id), data as Customer].sort((a, b) => a.name.localeCompare(b.name)));
    return data as Customer;
  }, []);
  const updateCustomer = useCallback(async (id: string, patch: Partial<Customer>) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      .sort((a, b) => a.name.localeCompare(b.name)));
    const { error } = await supabase.from("customers").update(patch).eq("id", id);
    if (error) throw error;
  }, []);
  const deleteCustomer = useCallback(async (id: string) => {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addSupplier = useCallback(async (input: Partial<SupplierRecord> & { name: string }) => {
    // Auto-default units from origin code (USA/Miami → imperial; rest → metric).
    let weight_unit: WeightUnit = input.weight_unit ?? "kg";
    let volume_unit: VolumeUnit = input.volume_unit ?? "cbm";
    if (input.weight_unit === undefined && input.origin_id) {
      const o = origins.find((x) => x.id === input.origin_id);
      if (o && (o.code.toUpperCase() === "USA_NON_MIAMI" || o.code.toUpperCase() === "MIAMI")) {
        weight_unit = "lbs"; volume_unit = "cuft";
      }
    }
    const { data, error } = await supabase.from("suppliers")
      .insert({ ...input, weight_unit, volume_unit })
      .select().single();
    if (error) throw error;
    setSuppliers((prev) => [...prev.filter((s) => s.id !== data.id), data as SupplierRecord].sort((a, b) => a.name.localeCompare(b.name)));
    return data as SupplierRecord;
  }, [origins]);
  const updateSupplier = useCallback(async (id: string, patch: Partial<SupplierRecord>) => {
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      .sort((a, b) => a.name.localeCompare(b.name)));
    const { error } = await supabase.from("suppliers").update(patch).eq("id", id);
    if (error) throw error;
  }, []);
  const deleteSupplier = useCallback(async (id: string) => {
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) throw error;
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addTeamMember = useCallback(async (input: { initials: string; full_name: string; role?: TeamMember["role"]; email?: string }) => {
    const { data, error } = await supabase
      .from("team_members")
      .insert({ ...input, initials: input.initials.toUpperCase() })
      .select().single();
    if (error) throw error;
    setTeamMembers((prev) => [...prev.filter((t) => t.id !== data.id), data as TeamMember].sort((a, b) => a.initials.localeCompare(b.initials)));
    return data as TeamMember;
  }, []);
  const updateTeamMember = useCallback(async (id: string, patch: Partial<TeamMember>) => {
    const p = patch.initials ? { ...patch, initials: patch.initials.toUpperCase() } : patch;
    setTeamMembers((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t))
      .sort((a, b) => a.initials.localeCompare(b.initials)));
    const { error } = await supabase.from("team_members").update(p).eq("id", id);
    if (error) throw error;
  }, []);
  const deleteTeamMember = useCallback(async (id: string) => {
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) throw error;
    setTeamMembers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addProduct = useCallback(async (input: { name: string; default_unit?: string; notes?: string }) => {
    const { data, error } = await supabase.from("products").insert({ ...input }).select().single();
    if (error) throw error;
    setProducts((prev) => [...prev.filter((p) => p.id !== data.id), data as ProductRecord].sort((a, b) => a.name.localeCompare(b.name)));
    return data as ProductRecord;
  }, []);
  const updateProduct = useCallback(async (id: string, patch: Partial<ProductRecord>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      .sort((a, b) => a.name.localeCompare(b.name)));
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) throw error;
  }, []);
  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ─── Buyers ─────────────────────────────────────────────────────────────
  const buyersByCustomer = useCallback(
    (customerId: string) => buyers.filter((b) => b.customer_id === customerId),
    [buyers],
  );
  const addBuyer = useCallback(async (customerId: string, input: { name: string; email?: string | null; contact?: string | null }) => {
    const { data, error } = await supabase
      .from("buyers")
      .insert({ customer_id: customerId, name: input.name, email: input.email ?? null, contact: input.contact ?? null })
      .select().single();
    if (error) throw error;
    setBuyers((prev) => [...prev.filter((b) => b.id !== data.id), data as Buyer].sort((a, b) => a.name.localeCompare(b.name)));
    return data as Buyer;
  }, []);
  const updateBuyer = useCallback(async (id: string, patch: Partial<Pick<Buyer, "name" | "email" | "contact">>) => {
    setBuyers((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
      .sort((a, b) => a.name.localeCompare(b.name)));
    const { error } = await supabase.from("buyers").update(patch).eq("id", id);
    if (error) throw error;
  }, []);

  // ─── Origins / Destinations ─────────────────────────────────────────────
  const addOrigin = useCallback(async (input: { code: string; name: string; notes?: string | null }) => {
    const code = input.code.trim().toUpperCase();
    const dup = origins.find((o) => o.code.toUpperCase() === code);
    if (dup) throw new Error(`duplicate code: ${code} already exists`);
    const { data, error } = await supabase
      .from("origins")
      .insert({ code, name: input.name.trim(), notes: input.notes ?? null })
      .select().single();
    if (error) throw error;
    setOrigins((prev) => [...prev.filter((o) => o.id !== data.id), data as OriginRecord].sort((a, b) => a.name.localeCompare(b.name)));
    return data as OriginRecord;
  }, [origins]);

  const addDestination = useCallback(async (input: { code: string; name: string; notes?: string | null }) => {
    const code = input.code.trim().toUpperCase();
    const dup = destinations.find((d) => d.code.toUpperCase() === code);
    if (dup) throw new Error(`duplicate code: ${code} already exists`);
    const { data, error } = await supabase
      .from("destinations")
      .insert({ code, name: input.name.trim(), notes: input.notes ?? null })
      .select().single();
    if (error) throw error;
    setDestinations((prev) => [...prev.filter((d) => d.id !== data.id), data as DestinationRecord].sort((a, b) => a.name.localeCompare(b.name)));
    return data as DestinationRecord;
  }, [destinations]);
  const deleteBuyer = useCallback(async (id: string) => {
    const { error } = await supabase.from("buyers").delete().eq("id", id);
    if (error) throw error;
    setBuyers((prev) => prev.filter((b) => b.id !== id));
  }, []);

  // ─── Lookups for merge prompts ──────────────────────────────────────────
  const findCustomerByName = useCallback(
    (name: string, excludeId?: string) => {
      const t = name.trim().toLowerCase();
      return customers.find((c) => c.id !== excludeId && c.name.toLowerCase() === t);
    },
    [customers],
  );
  const findBuyerByName = useCallback(
    (customerId: string, name: string, excludeId?: string) => {
      const t = name.trim().toLowerCase();
      return buyers.find(
        (b) => b.customer_id === customerId && b.id !== excludeId && b.name.toLowerCase() === t,
      );
    },
    [buyers],
  );

  // ─── Merge customers ────────────────────────────────────────────────────
  // Re-attribute projects + buyers from `sourceId` to `targetId`, delete the
  // source customer, and append a single audit log entry to one of the moved
  // projects (skipped if no projects are moved — see prompt rationale).
  const mergeCustomers = useCallback(
    async (sourceId: string, targetId: string, actor: { userId: string; displayName: string; shortName: string }) => {
      const source = customers.find((c) => c.id === sourceId);
      const target = customers.find((c) => c.id === targetId);
      if (!source || !target) throw new Error("Merge target not found");

      // 1. Re-attribute projects (free-text customer name)
      const { data: movedProjects, error: pErr } = await supabase
        .from("projects")
        .update({ customer: target.name })
        .eq("customer", source.name)
        .select("id");
      if (pErr) throw pErr;
      const projectsMoved = movedProjects?.length ?? 0;

      // 2. Re-parent buyers
      const sourceBuyers = buyers.filter((b) => b.customer_id === sourceId);
      const buyersMoved = sourceBuyers.length;
      if (buyersMoved > 0) {
        const { error: bErr } = await supabase
          .from("buyers")
          .update({ customer_id: targetId })
          .eq("customer_id", sourceId);
        if (bErr) throw bErr;
      }

      // 3. Delete source customer
      const { error: dErr } = await supabase.from("customers").delete().eq("id", sourceId);
      if (dErr) throw dErr;

      // 4. Audit log — only if we have a project to attach to
      if (projectsMoved > 0 && movedProjects) {
        const anchorProjectId = movedProjects[0].id;
        const { error: lErr } = await supabase.from("project_log_entries").insert({
          id: `merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          project_id: anchorProjectId,
          ts: new Date().toISOString(),
          actor_user_id: actor.userId,
          actor_display_name: actor.displayName,
          action_type: "field_edit",
          description: `${actor.shortName} merged ${source.name} into ${target.name} (${projectsMoved} projects, ${buyersMoved} buyers reassigned)`,
          metadata: {
            from_customer: source.name,
            to_customer: target.name,
            projects_moved: projectsMoved,
            buyers_moved: buyersMoved,
          } as any,
        });
        if (lErr) console.warn("Merge audit log insert failed", lErr);
      }

      // Optimistic local state — realtime will reconcile.
      setCustomers((prev) => prev.filter((c) => c.id !== sourceId));
      setBuyers((prev) => prev.map((b) => (b.customer_id === sourceId ? { ...b, customer_id: targetId } : b)));

      return { projectsMoved, buyersMoved };
    },
    [customers, buyers],
  );

  // ─── Merge buyers (within same customer) ────────────────────────────────
  const mergeBuyers = useCallback(
    async (
      sourceId: string,
      targetId: string,
      actor: { userId: string; displayName: string; shortName: string },
      customerName: string,
    ) => {
      const source = buyers.find((b) => b.id === sourceId);
      const target = buyers.find((b) => b.id === targetId);
      if (!source || !target) throw new Error("Merge target not found");
      if (source.customer_id !== target.customer_id) throw new Error("Buyers must share a customer");

      // 1. Backfill survivor's empty fields from source
      const patch: Partial<Pick<Buyer, "email" | "contact">> = {};
      const fieldsCopied: string[] = [];
      if (!target.email && source.email) { patch.email = source.email; fieldsCopied.push("email"); }
      if (!target.contact && source.contact) { patch.contact = source.contact; fieldsCopied.push("contact"); }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("buyers").update(patch).eq("id", targetId);
        if (error) throw error;
      }

      // 2. Re-attribute projects.buyer_id from source → target BEFORE deletion
      const { data: movedProjects, error: mErr } = await supabase
        .from("projects")
        .update({ buyer_id: targetId })
        .eq("buyer_id", sourceId)
        .select("id");
      if (mErr) throw mErr;
      const projectsMoved = movedProjects?.length ?? 0;

      // 3. Delete source buyer (FK ON DELETE SET NULL would orphan otherwise)
      const { error: dErr } = await supabase.from("buyers").delete().eq("id", sourceId);
      if (dErr) throw dErr;

      // 4. Audit log — attach to first project under the customer (best-effort, optional)
      const { data: anchor } = await supabase
        .from("projects")
        .select("id")
        .eq("customer", customerName)
        .limit(1);
      if (anchor && anchor.length > 0) {
        const { error: lErr } = await supabase.from("project_log_entries").insert({
          id: `merge-buyer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          project_id: anchor[0].id,
          ts: new Date().toISOString(),
          actor_user_id: actor.userId,
          actor_display_name: actor.displayName,
          action_type: "field_edit",
          description: `${actor.shortName} merged buyer ${source.name} with ${target.name} under ${customerName} (${projectsMoved} project${projectsMoved === 1 ? "" : "s"} reassigned)`,
          metadata: {
            customer_name: customerName,
            kept_buyer_id: targetId,
            deleted_buyer_id: sourceId,
            source_name: source.name,
            fields_copied: fieldsCopied,
            projects_moved: projectsMoved,
          } as any,
        });
        if (lErr) console.warn("Merge-buyer audit log insert failed", lErr);
      }

      // Optimistic local state
      setBuyers((prev) =>
        prev
          .filter((b) => b.id !== sourceId)
          .map((b) => (b.id === targetId ? { ...b, ...patch } : b)),
      );

      return { fieldsCopied, projectsMoved };
    },
    [buyers],
  );

  const value = useMemo<Ctx>(() => ({
    customers, suppliers, teamMembers, products, buyers, origins, destinations, loading,
    getSupplierByAnyId, getTeamByInitials, buyersByCustomer,
    customerUsage, supplierUsage, teamUsage, productUsage,
    addCustomer, updateCustomer, deleteCustomer,
    addSupplier, updateSupplier, deleteSupplier,
    addTeamMember, updateTeamMember, deleteTeamMember,
    addProduct, updateProduct, deleteProduct,
    addBuyer, updateBuyer, deleteBuyer,
    addOrigin, addDestination,
    findCustomerByName, findBuyerByName, mergeCustomers, mergeBuyers,
  }), [
    customers, suppliers, teamMembers, products, buyers, origins, destinations, loading,
    getSupplierByAnyId, getTeamByInitials, buyersByCustomer,
    customerUsage, supplierUsage, teamUsage, productUsage,
    addCustomer, updateCustomer, deleteCustomer,
    addSupplier, updateSupplier, deleteSupplier,
    addTeamMember, updateTeamMember, deleteTeamMember,
    addProduct, updateProduct, deleteProduct,
    addBuyer, updateBuyer, deleteBuyer,
    addOrigin, addDestination,
    findCustomerByName, findBuyerByName, mergeCustomers, mergeBuyers,
  ]);

  return <MasterDataCtx.Provider value={value}>{children}</MasterDataCtx.Provider>;
};

export const useMasterData = () => {
  const ctx = useContext(MasterDataCtx);
  if (!ctx) throw new Error("useMasterData must be used inside MasterDataProvider");
  return ctx;
};
