import { useEffect, useMemo, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  PIPELINES, PipelineId, PipelineCard, Shipment, StageId,
  SUPPLIERS, buildCard, Project,
} from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { usePipelineStore, getStageTitle, validateMove, isForwardMove } from "@/hooks/usePipelineStore";
import { StageSection } from "@/components/leads/StageSection";
import { ProjectCard } from "@/components/leads/ProjectCard";
import { PipelineTabs } from "@/components/leads/PipelineTabs";
import { PipelineStatCards, RowLabel } from "@/components/leads/PipelineStatCards";
import { DesktopFilterBar } from "@/components/leads/DesktopFilterBar";
import { FilterState, EMPTY_FILTER, filterCount } from "@/components/leads/FilterBar";
import { ProjectDetail } from "@/components/leads/ProjectDetail";
import { ShipmentView } from "@/components/leads/ShipmentView";
import { SuppliersView } from "@/components/leads/SuppliersView";
import { CustomersView } from "@/components/leads/CustomersView";

import { TrashView } from "@/components/leads/TrashView";
import { ArchiveView } from "@/components/leads/ArchiveView";
import { HamburgerDrawer } from "@/components/leads/HamburgerDrawer";
import { TopControls } from "@/components/leads/TopControls";
import { FilterSheet } from "@/components/leads/FilterSheet";
import { SortSheet, SortState, DEFAULT_DIR, SortField } from "@/components/leads/SortSheet";
import { StagePicker } from "@/components/leads/StagePicker";
import { SettingsMenu } from "@/components/leads/SettingsMenu";
import { Walkthrough } from "@/components/leads/Walkthrough";
import { Wordmark } from "@/components/leads/Wordmark";
import { UserMenu } from "@/components/leads/UserMenu";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { ShippingPipelineView, ShippingFilter } from "@/components/leads/ShippingPipelineView";
import { AllPipelineView } from "@/components/leads/AllPipelineView";
import { AssignShipmentSheet } from "@/components/leads/AssignShipmentSheet";
import type { TabId } from "@/components/leads/PipelineTabs";
import { JiggleProvider } from "@/hooks/useJiggle";
import { EditModeProvider } from "@/hooks/useEditMode";
// haptics import removed — no longer triggering nope() on missing fields (soft toast replaces hard block).
import { DesktopRail } from "@/components/leads/DesktopRail";
import { DesktopSidebarReopen } from "@/components/leads/DesktopSidebarReopen";
import { KanbanBoard } from "@/components/leads/KanbanBoard";
import { ProjectTable } from "@/components/leads/ProjectTable";
import { SubChevron } from "@/components/leads/SubChevron";
import { SubStageRow } from "@/components/leads/SubStageRow";
import { ViewSwitcher } from "@/components/leads/ViewSwitcher";
import { ColumnsPopover } from "@/components/leads/ColumnsPopover";
import { useViewMode } from "@/hooks/useViewMode";
import { NewProjectFAB } from "@/components/leads/NewProjectFAB";
import { NewProjectSheet } from "@/components/leads/NewProjectSheet";
// ─── Filter persistence (single shared filter across all tabs) ───
// Filters live above the per-tab component lifecycle so switching tabs
// preserves the active selection. They reset on full app reload — we
// intentionally do NOT persist to localStorage so a fresh session starts
// clean.
const DEFAULT_FILTER: FilterState = EMPTY_FILTER;

// ─── Sort persistence per-tab ───
const SORT_STORAGE = "alvasco.sort.v1";
const DEFAULT_SORTS: Record<TabId, SortState> = {
  all: { field: "deadline", dir: "asc" },
  sales: { field: "deadline", dir: "asc" },
  design: { field: "deadline", dir: "asc" },
  purchasing: { field: "deadline", dir: "asc" },
  production: { field: "deadline", dir: "asc" },
  operations: { field: "deadline", dir: "asc" }, // legacy alias
  shipping: { field: "deadline", dir: "asc" },
  finance: { field: "deadline", dir: "asc" },
  completed: { field: "updated", dir: "desc" },
};

function loadSorts(): Record<TabId, SortState> {
  try {
    const raw = localStorage.getItem(SORT_STORAGE);
    if (!raw) return DEFAULT_SORTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SORTS, ...parsed };
  } catch {
    return DEFAULT_SORTS;
  }
}

const DAY_MS = 86400000;
const MODE_ORDER: Record<string, number> = { Air: 0, Ocean: 1, Local: 2 };

function startOfToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}
function startOfDay(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return x;
}
function daysToDeadline(d?: Date | null) {
  if (!d) return Number.POSITIVE_INFINITY;
  return Math.round((startOfDay(d).getTime() - startOfToday().getTime()) / DAY_MS);
}

function compareCards(
  a: PipelineCard, b: PipelineCard, sort: SortState,
  idIndex: Map<string, number>, supplierName: (id?: string) => string,
): number {
  const dir = sort.dir === "asc" ? 1 : -1;
  const nullLast = (av: string, bv: string) => {
    if (av && !bv) return -1;
    if (!av && bv) return 1;
    return 0;
  };
  switch (sort.field) {
    case "deadline": {
      const at = a.deadlineDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = b.deadlineDate?.getTime() ?? Number.POSITIVE_INFINITY;
      return dir * (at - bt);
    }
    case "daysToDeadline":
      return dir * (daysToDeadline(a.deadlineDate) - daysToDeadline(b.deadlineDate));
    case "created": {
      const at = a.project.createdAt?.getTime() ?? 0;
      const bt = b.project.createdAt?.getTime() ?? 0;
      if (at !== bt) return dir * (at - bt);
      return dir * ((idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));
    }
    case "updated": {
      const at = a.project.updatedAt?.getTime() ?? a.project.createdAt?.getTime() ?? 0;
      const bt = b.project.updatedAt?.getTime() ?? b.project.createdAt?.getTime() ?? 0;
      return dir * (at - bt);
    }
    case "customer":
      return dir * a.project.customer.localeCompare(b.project.customer);
    case "projectName":
      return dir * a.project.projectName.localeCompare(b.project.projectName);
    case "supplier": {
      const av = supplierName(a.project.supplierId) || a.project.supplierLabel || "";
      const bv = supplierName(b.project.supplierId) || b.project.supplierLabel || "";
      const n = nullLast(av, bv); if (n) return n;
      return dir * av.localeCompare(bv);
    }
    case "shippingMode": {
      const av = a.project.shippingMode ?? "";
      const bv = b.project.shippingMode ?? "";
      const n = nullLast(av, bv); if (n) return n;
      return dir * ((MODE_ORDER[av] ?? 99) - (MODE_ORDER[bv] ?? 99));
    }
    case "salesRep": {
      const av = a.project.pointPerson ?? "";
      const bv = b.project.pointPerson ?? "";
      return dir * av.localeCompare(bv);
    }
    case "quote": {
      const av = a.project.quoteNumber ?? "";
      const bv = b.project.quoteNumber ?? "";
      const n = nullLast(av, bv); if (n) return n;
      return dir * av.localeCompare(bv, undefined, { numeric: true });
    }
  }
}

function projectMatchesSearch(p: Project, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const lineItemText = (p.lineItems ?? []).map((li) => li.description).join(" ");
  const fields = [
    p.customer, p.projectName, p.detailSummary ?? "", p.contactPerson ?? "",
    p.pointPerson ?? "",
    p.quoteNumber ?? "", p.poNumber ?? "", p.invoiceNumber ?? "", p.trackingRef ?? "", p.shipmentNumber ?? "",
    lineItemText,
  ];
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}

function projectHasMissingData(p: Project): boolean {
  const stageRank: Record<StageId, number> = {
    sourcing: 0, proposal: 0, quote: 1, pending: 2, stalled: 2, archive: 0,
    confirming: 2, // legacy
    client_artwork: 2, artwork_creation: 2, proof: 2, internal: 2,
    design: 2, // legacy
    purchasing: 3, production: 4, ready_to_ship: 4,
    preproduction: 3, in_production: 4, // legacy
    shipment_assigned: 6, arrived: 6,
    shipment_required: 5, // legacy
    invoice_required: 7, invoiced: 8, paid: 9, completed: 9,
  };
  const r = stageRank[p.stage] ?? 0;
  if (r >= 1 && !p.quoteNumber) return true;
  if (r >= 2 && !p.supplierId) return true;
  if (r >= 2 && !p.shippingMode) return true;
  if (r >= 2 && !p.detailSummary?.trim()) return true;
  if (r >= 3 && !p.poNumber) return true;
  if (r >= 7 && !p.invoiceNumber) return true;
  return false;
}

function cardMatchesFilter(c: PipelineCard, f: FilterState): boolean {
  const p = c.project;
  if (f.customers.length && !f.customers.includes(p.customer)) return false;
  if (f.projectNames.length && !f.projectNames.includes(p.projectName)) return false;
  if (f.supplierIds.length) {
    const wantUnassigned = f.supplierIds.includes("__unassigned");
    const matchSup = p.supplierId && f.supplierIds.includes(p.supplierId);
    const isUnassigned = !p.supplierId;
    if (!matchSup && !(wantUnassigned && isUnassigned)) return false;
  }
  if (f.shippingModes.length) {
    const mode = p.shippingMode ?? "Unassigned";
    if (!f.shippingModes.includes(mode as never)) return false;
  }
  if (f.salesReps.length) {
    const reps = (p.pointPerson ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!f.salesReps.some((r) => reps.includes(r))) return false;
  }
  if (f.stages.length && !f.stages.includes(p.stage)) return false;
  if (f.urgency) {
    if (f.urgency === "no_deadline") {
      if (c.deadlineDate) return false;
    } else {
      if (!c.deadlineDate) return false;
      const days = daysToDeadline(c.deadlineDate);
      if (f.urgency === "overdue" && days >= 0) return false;
      if (f.urgency === "this_week" && (days < 0 || days > 7)) return false;
      if (f.urgency === "this_month" && (days < 0 || days > 30)) return false;
    }
  }
  if (f.missingOnly && !projectHasMissingData(p)) return false;
  if (f.flagged === true && !p.flagged) return false;
  if (f.flagged === false && p.flagged) return false;
  return true;
}

const Index = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const store = usePipelineStore();
  const { projects, shipments, moveCard, pulsePipeline, triggerPulse, loading } = store;
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>("all");
  const isAll = activeTab === "all";
  const isCompleted = activeTab === "completed";
  const activePipeline: PipelineId =
    activeTab === "all" || activeTab === "completed" ? "sales" : activeTab;
  const { view: desktopView, setView: setDesktopView } = useViewMode(activeTab);

  // Single shared filter state — persists across pipeline tab switches and
  // across the Kanban/Table view toggle. Lives outside any per-tab component
  // lifecycle so child remounts can never reset it.
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER);

  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  
  const [trashOpen, setTrashOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [searchScopeAll, setSearchScopeAll] = useState(false);

  const [pickerCard, setPickerCard] = useState<PipelineCard | null>(null);
  const [confirmLost, setConfirmLost] = useState<{ card: PipelineCard; target: { pipeline: PipelineId; stage: StageId } } | null>(null);
  // (missingFields modal removed — soft toast in doMove now handles missing-field warnings.)
  const [shippingFilter, setShippingFilter] = useState<ShippingFilter>("in_transit");
  const [assignOpen, setAssignOpen] = useState(false);

  // Per-tab sub-stage filter (null = "All <Pipeline>"). Persists across tab switches.
  const [subStageByTab, setSubStageByTab] = useState<Partial<Record<TabId, StageId | null>>>({});
  const subStage = subStageByTab[activeTab] ?? null;
  const setSubStage = (s: StageId | null) =>
    setSubStageByTab((prev) => ({ ...prev, [activeTab]: s }));

  // Sort state, persisted per tab
  const [sorts, setSorts] = useState<Record<TabId, SortState>>(loadSorts);
  const sort = sorts[activeTab];
  const setSort = (s: SortState) => {
    const next = { ...sorts, [activeTab]: s };
    setSorts(next);
    try { localStorage.setItem(SORT_STORAGE, JSON.stringify(next)); } catch { /* noop */ }
  };

  // Reset search when switching tabs
  useEffect(() => { setSearch(""); setSearchScopeAll(false); }, [activeTab]);

  // Open project detail when arriving with ?project=ID (from Activity Log,
  // notifications, deep links, etc.). Re-runs when the param changes.
  // Waits for projects to load before warning about missing IDs.
  useEffect(() => {
    const id = searchParams.get("project");
    if (!id) return;
    if (loading) return;
    const proj = projects.find((p) => p.id === id);
    if (proj) {
      setActiveTab(proj.pipeline);
      setTimeout(() => { setSelectedCard(buildCard(proj)); setSelectedShipment(null); }, 0);
    } else {
      toast.error("Project not found");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("project");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, projects.length]);

  // Index for stable secondary ordering
  const idIndex = useMemo(() => {
    const m = new Map<string, number>();
    projects.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [projects]);

  const supplierName = useMemo(() => {
    const map = new Map(SUPPLIERS.map((s) => [s.id, s.name]));
    return (id?: string) => (id ? map.get(id) ?? "" : "");
  }, []);

  // Pipeline-facing project list — excludes archived (sales/archive) AND completed
  // (both the new pipeline=completed and the legacy finance/paid combination).
  const pipelineProjects = useMemo(
    () => projects.filter((p) =>
      !(p.pipeline === "sales" && p.stage === "archive") &&
      p.pipeline !== "completed" &&
      !(p.pipeline === "finance" && p.stage === "paid"),
    ),
    [projects],
  );

  const completedProjects = useMemo(
    () => projects.filter((p) =>
      p.pipeline === "completed" ||
      (p.pipeline === "finance" && p.stage === "paid"),
    ),
    [projects],
  );

  // Build cards list (scope by tab)
  const baseCards = useMemo<PipelineCard[]>(() => {
    if (isCompleted) return completedProjects.map(buildCard);
    if (isAll) return pipelineProjects.map(buildCard);
    return pipelineProjects.filter((p) => p.pipeline === activePipeline).map(buildCard);
  }, [activePipeline, isAll, isCompleted, pipelineProjects, completedProjects]);

  const counts = useMemo<Record<PipelineId, number>>(() => ({
    sales: pipelineProjects.filter((p) => p.pipeline === "sales").length,
    design: pipelineProjects.filter((p) => p.pipeline === "design").length,
    purchasing: pipelineProjects.filter((p) => p.pipeline === "purchasing").length,
    production: pipelineProjects.filter((p) => p.pipeline === "production").length,
    shipping: pipelineProjects.filter((p) => p.pipeline === "shipping").length,
    finance: pipelineProjects.filter((p) => p.pipeline === "finance").length,
    // "completed" is tracked separately via completedCount/completedProjects.
    completed: 0,
    operations: pipelineProjects.filter((p) => p.pipeline === "operations").length, // legacy
  }), [pipelineProjects]);

  // Filtered counts — used by chevron tabs to update live as filters change.
  const filteredCounts = useMemo<Record<PipelineId, number>>(() => {
    const q = search.trim();
    const match = (p: Project) => {
      const c = buildCard(p);
      if (!cardMatchesFilter(c, filters)) return false;
      if (q && !projectMatchesSearch(p, q)) return false;
      return true;
    };
    return {
      sales: pipelineProjects.filter((p) => p.pipeline === "sales" && match(p)).length,
      design: pipelineProjects.filter((p) => p.pipeline === "design" && match(p)).length,
      purchasing: pipelineProjects.filter((p) => p.pipeline === "purchasing" && match(p)).length,
      production: pipelineProjects.filter((p) => p.pipeline === "production" && match(p)).length,
      shipping: pipelineProjects.filter((p) => p.pipeline === "shipping" && match(p)).length,
      finance: pipelineProjects.filter((p) => p.pipeline === "finance" && match(p)).length,
      // "completed" is tracked separately via completedCount.
      completed: 0,
      operations: pipelineProjects.filter((p) => p.pipeline === "operations" && match(p)).length, // legacy
    };
  }, [pipelineProjects, filters, search]);

  const completedCount = useMemo(() => {
    const q = search.trim();
    return completedProjects.filter((p) => {
      const c = buildCard(p);
      if (!cardMatchesFilter(c, filters)) return false;
      if (q && !projectMatchesSearch(p, q)) return false;
      return true;
    }).length;
  }, [completedProjects, filters, search]);

  const customerOptions = useMemo<string[]>(() => Array.from(new Set(projects.map((p) => p.customer))).sort(), [projects]);
  const projectNameOptions = useMemo<string[]>(() => Array.from(new Set(projects.map((p) => p.projectName))).sort(), [projects]);
  // Split multi-rep strings ("AV, CB") into individual reps and dedupe.
  const salesRepOptions = useMemo<string[]>(() => {
    const set = new Set<string>();
    projects.forEach((p) => {
      (p.pointPerson ?? "").split(",").map((s) => s.trim()).filter(Boolean).forEach((r) => set.add(r));
    });
    return Array.from(set).sort();
  }, [projects]);

  // Apply filters + search + sub-stage, then sort
  const visible = useMemo(() => {
    const searchActive = !!search.trim();
    let pool = baseCards;
    if (searchActive && searchScopeAll && !isAll) {
      pool = pipelineProjects.map(buildCard);
    }
    return pool
      .filter((c) => {
        if (!cardMatchesFilter(c, filters)) return false;
        if (searchActive && !projectMatchesSearch(c.project, search.trim())) return false;
        // Sub-chevron stage filter (only applies when not in "all" / "completed" tabs).
        if (subStage && c.stage !== subStage) return false;
        return true;
      })
      .sort((a, b) => compareCards(a, b, sort, idIndex, supplierName));
  }, [baseCards, pipelineProjects, filters, sort, idIndex, search, searchScopeAll, isAll, supplierName, subStage]);

  // Per-stage counts within the active pipeline (post-filter, post-search; ignores subStage itself).
  const stageCounts = useMemo<Partial<Record<StageId, number>>>(() => {
    if (isAll || isCompleted) return {};
    const q = search.trim();
    const counts: Partial<Record<StageId, number>> = {};
    pipelineProjects
      .filter((p) => p.pipeline === activePipeline)
      .forEach((p) => {
        const c = buildCard(p);
        if (!cardMatchesFilter(c, filters)) return;
        if (q && !projectMatchesSearch(p, q)) return;
        counts[p.stage] = (counts[p.stage] ?? 0) + 1;
      });
    return counts;
  }, [pipelineProjects, activePipeline, isAll, isCompleted, filters, search]);

  const subAllCount = useMemo(
    () => Object.values(stageCounts).reduce((a, b) => a + (b ?? 0), 0),
    [stageCounts],
  );

  const pipeline = PIPELINES.find((p) => p.id === activePipeline)!;
  const hasActiveFilter = filterCount(filters) > 0;
  const isSearching = !!search.trim();

  // ─── Move logic (preserved) ───
  const performMove = (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => {
    if (target.stage === "archive" && card.stage !== "archive") {
      setConfirmLost({ card, target });
      return;
    }
    doMove(card, target);
  };

  const doMove = async (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => {
    const fromPipeline = card.pipeline;
    const fromStage = card.stage;
    const label = `${card.project.customer} · ${card.project.projectName}`;
    const result = await moveCard(card.id, target);
    if (!result.ok) return;
    if (target.pipeline !== fromPipeline) triggerPulse(target.pipeline);

    // Soft validation: if this is a forward move (not archive, not backward) and required
    // fields are missing, surface a non-blocking warning toast instead of a success toast.
    const v = validateMove(card.project, target);
    const isForward = isForwardMove(fromStage, target.stage);
    if (!v.ok && isForward) {
      const fieldLabels = v.missing.map((m) =>
        m === "detailSummary" ? "detail summary" : m === "supplier" ? "supplier" : "shipping mode",
      );
      const stageTitle = getStageTitle(target.pipeline, target.stage);
      toast.warning(`Moved to ${stageTitle} — missing ${fieldLabels.join(", ")}`, {
        description: "Tap to open project and fill in.",
        duration: 5000,
        onAutoClose: () => {},
        // Clicking the toast body opens the project detail panel.
        action: {
          label: "Open",
          onClick: () => setSelectedCard(card),
        },
      });
      return;
    }

    toast.success(`${label} moved to ${getStageTitle(target.pipeline, target.stage)}`, {
      description: `From ${getStageTitle(fromPipeline, fromStage)}. Tap Undo to reverse.`,
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          moveCard(card.id, { pipeline: fromPipeline, stage: fromStage });
          toast(`Move undone`, { duration: 2500 });
        },
      },
    });
  };

  const markAsPaid = async (card: PipelineCard) => {
    const fromPipeline = card.pipeline;
    const fromStage = card.stage;
    const label = `${card.project.customer} · ${card.project.projectName}`;
    const result = await moveCard(card.id, { pipeline: "completed", stage: "completed" });
    if (!result.ok) return;
    toast.success(`${label} marked as paid`, {
      description: "Moved to Completed.",
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => {
          moveCard(card.id, { pipeline: fromPipeline, stage: fromStage });
          toast(`Move undone`, { duration: 2000 });
        },
      },
    });
  };

  const onSwipeForward = (card: PipelineCard) => {
    // Special case: Invoiced cards swipe-right → Mark as paid (no modal)
    if (card.pipeline === "finance" && card.stage === "invoiced") {
      markAsPaid(card);
      return;
    }
    const next = nextStage(card); if (next) performMove(card, next);
  };
  const onSwipeBack = (card: PipelineCard) => { const prev = prevStage(card); if (prev) performMove(card, prev); };
  const onOpenPicker = (card: PipelineCard) => setPickerCard(card);
  const handlePickerSelect = (target: { pipeline: PipelineId; stage: StageId }) => {
    if (!pickerCard) return;
    const card = pickerCard;
    setPickerCard(null);
    performMove(card, target);
  };

  const openShipmentById = (id: string) => {
    setSelectedShipment(shipments.find((s) => s.id === id) ?? null);
    setSelectedCard(null);
  };
  const openProjectById = (id: string) => {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    setActiveTab(proj.pipeline);
    setTimeout(() => { setSelectedCard(buildCard(proj)); setSelectedShipment(null); }, 0);
  };

  // Tab swipe gesture (preserved)
  const TAB_ORDER: TabId[] = ["all", "sales", "design", "purchasing", "production", "shipping", "finance", "completed"];
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touchStart.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    const idx = TAB_ORDER.indexOf(activeTab);
    if (dx < 0 && idx < TAB_ORDER.length - 1) setActiveTab(TAB_ORDER[idx + 1]);
    if (dx > 0 && idx > 0) setActiveTab(TAB_ORDER[idx - 1]);
  };

  const accentHex = isAll ? "transparent" : PIPELINE_ACCENT[activePipeline].hex;
  const showSearchScopeToggle = isSearching && !isAll;

  // What pipeline label to show in the search results header
  const searchScopeLabel = isAll
    ? "all pipelines"
    : (searchScopeAll ? "all pipelines" : pipeline.title);

  return (
    <JiggleProvider onPick={(card, target) => performMove(card, target)}>
    <EditModeProvider>
    <div className="min-h-screen bg-background lg:flex lg:h-screen lg:min-h-0 lg:overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <DesktopRail
        trashCount={store.trashedProjects.length}
        archiveCount={store.archivedProjects.length}
      />
      <div className="contents lg:flex lg:flex-1 lg:min-w-0 lg:flex-col lg:h-screen lg:overflow-hidden lg:relative">
      <DesktopSidebarReopen />
      <header
        className="sticky top-0 border-b border-border/70"
        style={{
          zIndex: 100,
          backgroundColor: "hsl(var(--background))",
        }}
      >
        {/* Brand row — mobile only (rail handles brand on desktop) */}
        <div className="relative lg:hidden" style={{ backgroundColor: "hsl(var(--background))" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[52px] flex items-center justify-between">
            <button
              onClick={() => setHamburgerOpen(true)}
              aria-label="Open menu"
              className="inline-flex items-center justify-center rounded-full border bg-card/60 hover:bg-card transition-colors"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", color: "hsl(var(--brand-navy))", width: 36, height: 36 }}
            >
              <Menu className="h-4 w-4" />
            </button>
            <Wordmark />
            <UserMenu />
            <SettingsMenu />
          </div>
        </div>

        {/* Desktop identity strip — skinny, right-aligned, above chevron */}
        <div className="hidden lg:block border-b border-border/60" style={{ backgroundColor: "hsl(var(--background))" }}>
          <div className="max-w-none px-4 sm:px-6 h-8 flex items-center justify-end gap-2">
            <UserMenu />
            <SettingsMenu />
          </div>
        </div>

        {/* Tabs row */}
        <div className="relative" style={{ backgroundColor: "hsl(var(--background))" }}>
          {/* Mobile pill tabs */}
          <div className="lg:hidden max-w-6xl mx-auto px-4 sm:px-6 pb-1.5 pt-1.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <PipelineTabs active={activeTab} onChange={setActiveTab} counts={filteredCounts} completedCount={completedCount} pulse={pulsePipeline} loading={loading} />
            </div>
          </div>
          {/* Mobile sub-stage row — only when active pipeline has sub-stages.
              Lets the user filter by main + sub stage without opening the
              filter sheet. Mirrors the desktop SubStageRow behavior. */}
          {(activeTab === "sales" || activeTab === "design" || activeTab === "production" || activeTab === "shipping" || activeTab === "finance") && (
            <div className="lg:hidden max-w-6xl mx-auto px-4 sm:px-6 pb-1.5 overflow-x-auto">
              <SubStageRow
                activeTab={activeTab}
                selectedStage={subStage}
                onSelect={setSubStage}
                stageCounts={stageCounts}
              />
            </div>
          )}
          {/* Desktop pipeline stat cards + persistent sub-stage row.
              Sub-stage row always exists (empty when active pipeline has no
              sub-stages) so the filter row never shifts vertically. */}
          <div className="hidden lg:block max-w-none px-6 lg:px-8" style={{ paddingTop: 5, paddingBottom: 4 }}>
            <PipelineStatCards
              active={activeTab}
              onChange={setActiveTab}
              counts={filteredCounts}
              completedCount={completedCount}
              pulse={pulsePipeline}
              loading={loading}
              showFin={activeTab === "sales" || activeTab === "design" || activeTab === "finance"}
            />
            {(() => {
              const hasSub = activeTab === "sales" || activeTab === "design" || activeTab === "finance";
              return (
                <div style={{ marginTop: 10, maxWidth: "70%" }}>
                  <RowLabel variant="tight" dim={!hasSub}>Sub-stage</RowLabel>
                  <SubStageRow
                    activeTab={activeTab}
                    selectedStage={subStage}
                    onSelect={setSubStage}
                    stageCounts={stageCounts}
                  />
                </div>
              );
            })()}
          </div>
        </div>

        {/* Mobile filter row (filter pill + search + sort) */}
        <div className="relative lg:hidden" style={{ backgroundColor: "hsl(var(--background))" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-2 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <TopControls
                filter={filters}
                sort={sort}
                search={search}
                onSearchChange={setSearch}
                onOpenFilter={() => setFilterSheetOpen(true)}
                onOpenSort={() => setSortSheetOpen(true)}
              />
            </div>
          </div>
        </div>

        {/* Desktop: always-visible filter chip bar + search/sort/view-switcher */}
        <div className="hidden lg:block" style={{ backgroundColor: "hsl(var(--background))" }}>
          <div className="max-w-none px-4 sm:px-6 pb-2 pt-1.5 space-y-2">
            <DesktopFilterBar
              value={filters}
              onChange={setFilters}
              customers={customerOptions}
              suppliers={SUPPLIERS}
              salesReps={salesRepOptions}
            />
            <div className="flex items-center gap-3">
              <ViewSwitcher value={desktopView} onChange={setDesktopView} />
              {desktopView === "table" && (() => {
                const tabLabel = activeTab === "all"
                  ? "Active"
                  : activeTab === "completed"
                    ? "Completed"
                    : (PIPELINES.find((p) => p.id === activeTab)?.title ?? activeTab);
                return <ColumnsPopover activeTab={activeTab} tabLabel={tabLabel} />;
              })()}
              <div className="flex-1 min-w-0">
              <TopControls
                  filter={filters}
                  sort={sort}
                  search={search}
                  onSearchChange={setSearch}
                  onOpenFilter={() => setFilterSheetOpen(true)}
                  onOpenSort={() => setSortSheetOpen(true)}
                  hideFilter
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main key={activeTab} className="lg:hidden max-w-6xl mx-auto px-4 sm:px-6 pt-2.5 pb-6 sm:pt-3 sm:pb-8 space-y-4 sm:space-y-5 animate-fade-in">
        {isSearching && (
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular">{visible.length}</span>{" "}
              result{visible.length === 1 ? "" : "s"} in {searchScopeLabel}
            </p>
            {showSearchScopeToggle && (
              <button
                onClick={() => setSearchScopeAll((v) => !v)}
                className="text-xs font-medium underline underline-offset-4"
                style={{ color: "hsl(var(--brand-navy))" }}
              >
                {searchScopeAll ? `Search only ${pipeline.title}` : "Search all pipelines"}
              </button>
            )}
          </div>
        )}

        {(() => {
          const shippingProjectsFiltered = projects.filter((p) => {
            if (p.pipeline !== "shipping") return false;
            if (!cardMatchesFilter(buildCard(p), filters)) return false;
            if (isSearching && !projectMatchesSearch(p, search.trim())) return false;
            return true;
          });
          const intakeCount = projects.filter((p) => p.pipeline === "production" && p.stage === "ready_to_ship").length;

          if (isCompleted) {
            return (
              <section className="rounded-2xl border border-border/60 bg-[#6B8E5A]/[0.04] p-3">
                {visible.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic px-2 py-6 text-center">
                    No completed projects yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visible.map((c) => (
                      <ProjectCard
                        key={c.id}
                        card={c}
                        showStageLabel
                        onOpen={() => setSelectedCard(c)}
                        onSwipeForward={() => onSwipeForward(c)}
                        onSwipeBack={() => onSwipeBack(c)}
                        onOpenPicker={() => onOpenPicker(c)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          }

          if (isAll) {
            return (
              <AllPipelineView
                projects={projects}
                shipments={shipments}
                cards={visible}
                perPipelineCounts={counts}
                hasActiveFilter={hasActiveFilter || isSearching}
                shippingFilter={shippingFilter}
                onShippingFilterChange={setShippingFilter}
                intakeCount={intakeCount}
                onOpenIntake={() => setAssignOpen(true)}
                onOpenShipment={openShipmentById}
                onOpenCard={setSelectedCard}
                onSwipeForward={onSwipeForward}
                onSwipeBack={onSwipeBack}
                onOpenPicker={onOpenPicker}
                shippingSubs={shippingProjectsFiltered}
              />
            );
          }

          if (activePipeline === "shipping") {
            return (
              <ShippingPipelineView
                subs={shippingProjectsFiltered}
                shipments={shipments}
                filter={shippingFilter}
                onFilterChange={setShippingFilter}
                intakeCount={intakeCount}
                onOpenIntake={() => setAssignOpen(true)}
                onOpenShipment={openShipmentById}
                onOpenCard={setSelectedCard}
                onSwipeForward={onSwipeForward}
                onSwipeBack={onSwipeBack}
                onOpenPicker={onOpenPicker}
              />
            );
          }

          return pipeline.stages.map((stage) => (
            <StageSection
              key={stage.id}
              title={stage.title}
              stage={stage.id}
              cards={visible.filter((c) => c.stage === stage.id)}
              onOpenCard={setSelectedCard}
              onOpenShipment={openShipmentById}
              onSwipeForward={onSwipeForward}
              onSwipeBack={onSwipeBack}
              onOpenPicker={onOpenPicker}
              emptyHint={
                stage.id === "sourcing" ? "No projects here yet. New leads will appear in Sourcing."
                : stage.id === "proposal" ? "No projects here. Move a sourced lead forward when you're ready to write the proposal."
                : stage.id === "archive" ? "Nothing archived. Cold or lost projects will land here."
                : stage.id === "invoice_required" ? "No projects awaiting an invoice."
                : undefined
              }
            />
          ));
        })()}

        <p className="text-center text-xs text-muted-foreground pt-4 pb-1">
          Swipe → to advance, ← to send back. Long-press to jump stages. Tap ⋮ for actions.
        </p>
      </main>

      {/* Desktop main — Kanban or Table, only at ≥1024px. Mobile main above is hidden at lg. */}
      <div className="hidden lg:flex lg:flex-1 lg:min-h-0 lg:min-w-0">
        {desktopView === "table" ? (
          <ProjectTable
            activeTab={activeTab}
            visible={visible}
            onOpenCard={setSelectedCard}
            onOpenPicker={onOpenPicker}
            onPickStage={performMove}
            hasActiveFilter={hasActiveFilter || isSearching}
            onClearFilters={() => { setFilters(EMPTY_FILTER); setSearch(""); }}
            selectedCardId={selectedCard?.id ?? null}
            onCloseDetail={() => setSelectedCard(null)}
          />
        ) : isCompleted ? (
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 bg-[#6B8E5A]/[0.04]">
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground italic px-2 py-12 text-center">
                No completed projects yet.
              </p>
            ) : (
              <div
                className="grid gap-3 items-start"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
              >
                {visible.map((c) => (
                  <ProjectCard
                    key={c.id}
                    card={c}
                    showStageLabel
                    onOpen={() => setSelectedCard(c)}
                    onSwipeForward={() => onSwipeForward(c)}
                    onSwipeBack={() => onSwipeBack(c)}
                    onOpenPicker={() => onOpenPicker(c)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <KanbanBoard
            activeTab={activeTab}
            visible={visible}
            projects={projects}
            shipments={shipments}
            onOpenCard={setSelectedCard}
            onSwipeForward={onSwipeForward}
            onSwipeBack={onSwipeBack}
            onOpenPicker={onOpenPicker}
          />
        )}
      </div>

      {/* Sheets / drawers */}
      <HamburgerDrawer
        open={hamburgerOpen}
        onClose={() => setHamburgerOpen(false)}
        onOpenSuppliers={() => setSuppliersOpen(true)}
        onOpenCustomers={() => setCustomersOpen(true)}
        onOpenTrash={() => setTrashOpen(true)}
        onOpenArchive={() => setArchiveOpen(true)}
        trashCount={store.trashedProjects.length}
        archiveCount={store.archivedProjects.length}
      />
      <TrashView open={trashOpen} onClose={() => setTrashOpen(false)} />
      <ArchiveView open={archiveOpen} onClose={() => setArchiveOpen(false)} />

      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        value={filters}
        onChange={setFilters}
        customers={customerOptions}
        projectNames={projectNameOptions}
        suppliers={SUPPLIERS}
        salesReps={salesRepOptions}
      />
      <SortSheet
        open={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        value={sort}
        onChange={setSort}
      />

      <ProjectDetail card={selectedCard} onClose={() => setSelectedCard(null)} onOpenShipment={openShipmentById} />
      <ShipmentView shipment={selectedShipment} onClose={() => setSelectedShipment(null)} onOpenProject={openProjectById} />
      <SuppliersView open={suppliersOpen} onClose={() => setSuppliersOpen(false)}
        onOpenProject={(id) => { setSuppliersOpen(false); openProjectById(id); }} />
      <CustomersView open={customersOpen} onClose={() => setCustomersOpen(false)} />

      <StagePicker
        open={!!pickerCard}
        onClose={() => setPickerCard(null)}
        title={pickerCard ? pickerCard.project.projectName : ""}
        subtitle={pickerCard ? pickerCard.project.customer : ""}
        current={pickerCard ? { pipeline: pickerCard.pipeline, stage: pickerCard.stage } : null}
        onPick={handlePickerSelect}
      />

      <ConfirmDialog
        open={!!confirmLost}
        title={confirmLost ? `Move ${confirmLost.card.project.customer} · ${confirmLost.card.project.projectName} to Archive?` : ""}
        description="Archive holds closed-but-not-deleted projects (cold leads, lost deals, anything paused). You can move it back later if it comes back to life."
        confirmLabel="Yes, archive it"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setConfirmLost(null)}
        onConfirm={() => {
          if (!confirmLost) return;
          const { card, target } = confirmLost;
          setConfirmLost(null);
          doMove(card, target);
        }}
      />

      {/* "Missing details" blocking modal removed — replaced by non-blocking warning toast in doMove. */}
      <AssignShipmentSheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        intakeSubs={projects.filter((p) => p.pipeline === "production" && p.stage === "ready_to_ship")}
        shipments={shipments}
      />

      <Walkthrough />

      {!selectedCard && !selectedShipment && !suppliersOpen && !customersOpen && !trashOpen && !archiveOpen && (
        <NewProjectFAB onClick={() => setNewProjectOpen(true)} />
      )}
      <NewProjectSheet
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={(proj) => {
          setActiveTab(proj.pipeline);
          setSelectedCard(buildCard(proj));
        }}
      />
      </div>
    </div>
    </EditModeProvider>
    </JiggleProvider>
  );
};

import { getNextStage as nextS, getPrevStage as prevS } from "@/hooks/usePipelineStore";
function nextStage(card: PipelineCard) { return nextS(card.pipeline, card.stage); }
function prevStage(card: PipelineCard) { return prevS(card.pipeline, card.stage); }

export default Index;
