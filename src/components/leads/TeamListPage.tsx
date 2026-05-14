/**
 * Team list page — spreadsheet-style rows with inline-editable cells
 * (Full Name, Initials, Email) and a three-dots menu per row that
 * deep-links to sections of the TeamMemberPage.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Search, ChevronUp, ChevronDown,
  MoreVertical, Trash2, User, Shield, FolderKanban, Activity as ActivityIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMasterData, parseInitials } from "@/hooks/useMasterData";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { InlineAdd } from "@/components/leads/EntityPicker";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
type SortKey = "full_name" | "initials" | "email";

export const TeamListPage = () => {
  const navigate = useNavigate();
  const md = useMasterData();
  const store = usePipelineStore();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; assigned: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: SortKey } | null>(null);
  const [draft, setDraft] = useState("");

  const term = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    return md.teamMembers.filter(
      (t) =>
        !term ||
        t.full_name.toLowerCase().includes(term) ||
        t.initials.toLowerCase().includes(term) ||
        (t.email ?? "").toLowerCase().includes(term),
    );
  }, [md.teamMembers, term]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = (a[sortKey] ?? "").toString();
      const bv = (b[sortKey] ?? "").toString();
      // null/empty last
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return dir * av.localeCompare(bv);
    });
  }, [filtered, sortKey, sortDir]);

  const onSortClick = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const assignedCount = (initials: string) => {
    const I = initials.toUpperCase();
    return store.projects.filter(
      (p) => parseInitials(p.pointPerson).map((s) => s.toUpperCase()).includes(I),
    ).length;
  };

  const startEdit = (id: string, field: SortKey, current: string) => {
    setEditingCell({ id, field });
    setDraft(current);
  };

  const commitEdit = async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const member = md.teamMembers.find((t) => t.id === id);
    if (!member) { setEditingCell(null); return; }

    let v = draft.trim();
    try {
      if (field === "full_name") {
        if (!v) { toast.error("Full name is required"); return; }
        if (v === member.full_name) { setEditingCell(null); return; }
        await md.updateTeamMember(id, { full_name: v });
      } else if (field === "initials") {
        v = v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
        if (!v) { toast.error("Initials required"); return; }
        if (v === member.initials) { setEditingCell(null); return; }
        const dup = md.teamMembers.find((t) => t.id !== id && t.initials.toUpperCase() === v);
        if (dup) { toast.error(`Initials "${v}" already used by ${dup.full_name}`); return; }
        await md.updateTeamMember(id, { initials: v });
      } else if (field === "email") {
        v = v.toLowerCase();
        if (v && !emailOk(v)) { toast.error("Invalid email format"); return; }
        if ((v || null) === (member.email ?? null)) { setEditingCell(null); return; }
        await md.updateTeamMember(id, { email: v || null } as any);
      }
      setEditingCell(null);
    } catch (err: any) {
      const msg: string = err?.message ?? "Save failed";
      if (/duplicate|unique/i.test(msg)) toast.error("That email is already used by another team member");
      else toast.error(msg);
    }
  };

  const cancelEdit = () => { setEditingCell(null); setDraft(""); };

  const openMember = (id: string, section?: "profile" | "permissions" | "projects" | "activity") => {
    const params = new URLSearchParams({ team_member: id });
    if (section) params.set("section", section);
    navigate(`/team?${params.toString()}`);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await md.deleteTeamMember(confirmDelete.id);
      toast.success(`${confirmDelete.name} removed from team`);
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
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
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Master data</div>
              <h1
                className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}
              >
                Team <span className="text-muted-foreground font-light">· {md.teamMembers.length}</span>
              </h1>
            </div>
            <button
              onClick={() => setAdding(true)}
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
              placeholder="Search team…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }}
            />
          </div>

          {/* Header row */}
          <div
            className="grid gap-3 px-3 py-2 text-[10px] uppercase tracking-[0.18em] font-medium text-muted-foreground items-center"
            style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,2fr) 40px" }}
          >
            <SortHead label="Full name" k="full_name" sortKey={sortKey} sortDir={sortDir} onClick={onSortClick} />
            <SortHead label="Initials" k="initials" sortKey={sortKey} sortDir={sortDir} onClick={onSortClick} />
            <SortHead label="Email" k="email" sortKey={sortKey} sortDir={sortDir} onClick={onSortClick} />
            <span />
          </div>

          <ul className="space-y-1.5">
            {sorted.map((t) => {
              const isEditing = (field: SortKey) => editingCell?.id === t.id && editingCell.field === field;
              return (
                <li key={t.id}>
                  <div
                    className="grid gap-3 px-3 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors items-center"
                    style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,2fr) 40px", minHeight: 56 }}
                    onClick={(e) => {
                      // Open member page when clicking row body (not a cell, not the menu)
                      if ((e.target as HTMLElement).closest("[data-cell],[data-menu],input")) return;
                      openMember(t.id, "profile");
                    }}
                  >
                    {/* Full Name */}
                    <Cell editing={isEditing("full_name")}
                      onClick={() => startEdit(t.id, "full_name", t.full_name)}
                      onCommit={commitEdit} onCancel={cancelEdit}
                      draft={draft} setDraft={setDraft}
                      display={<span className="font-medium text-foreground truncate">{t.full_name}</span>}
                    />
                    {/* Initials */}
                    <Cell editing={isEditing("initials")}
                      onClick={() => startEdit(t.id, "initials", t.initials)}
                      onCommit={commitEdit} onCancel={cancelEdit}
                      draft={draft} setDraft={setDraft}
                      maxLen={3}
                      transform={(v) => v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3)}
                      display={<span className="text-muted-foreground font-mono">{t.initials}</span>}
                    />
                    {/* Email */}
                    <Cell editing={isEditing("email")}
                      onClick={() => startEdit(t.id, "email", t.email ?? "")}
                      onCommit={commitEdit} onCancel={cancelEdit}
                      draft={draft} setDraft={setDraft}
                      type="email"
                      display={
                        t.email
                          ? <span className="text-muted-foreground truncate">{t.email}</span>
                          : <span className="text-muted-foreground/50 italic">—</span>
                      }
                    />
                    {/* Three-dots */}
                    <div data-menu className="flex justify-end">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className="p-1.5 rounded-md hover:bg-muted/60"
                            aria-label="Row actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" style={{ color: "hsl(var(--brand-navy) / 0.6)" }} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-52 p-1">
                          <MenuItem icon={<User className="h-4 w-4" />} label="View Profile" onClick={() => openMember(t.id, "profile")} />
                          <MenuItem icon={<Shield className="h-4 w-4" />} label="Permissions" onClick={() => openMember(t.id, "permissions")} />
                          <MenuItem icon={<FolderKanban className="h-4 w-4" />} label="Open Projects" onClick={() => openMember(t.id, "projects")} />
                          <MenuItem icon={<ActivityIcon className="h-4 w-4" />} label="Activity Log" onClick={() => openMember(t.id, "activity")} />
                          <div className="my-1 h-px" style={{ backgroundColor: "hsl(var(--brand-navy) / 0.1)" }} />
                          <MenuItem
                            icon={<Trash2 className="h-4 w-4" />}
                            label="Delete"
                            destructive
                            onClick={() => setConfirmDelete({ id: t.id, name: t.full_name, assigned: assignedCount(t.initials) })}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </li>
              );
            })}
            {sorted.length === 0 && (
              <li className="text-sm text-muted-foreground italic px-3 py-12 text-center">
                {q ? "No matches." : "No team members yet."}
              </li>
            )}
          </ul>
        </main>

        <InlineAdd open={adding} kind="team" onClose={() => setAdding(false)} onCreated={() => setAdding(false)} />

        <ConfirmDialog
          open={!!confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          title={confirmDelete ? `Remove ${confirmDelete.name} from team?` : ""}
          description={
            confirmDelete
              ? confirmDelete.assigned > 0
                ? `Their historical activity will remain in the audit log. This cannot be undone. ${confirmDelete.name} is assigned to ${confirmDelete.assigned} active project${confirmDelete.assigned === 1 ? "" : "s"}. Their assignment will remain — you'll need to reassign manually.`
                : "Their historical activity will remain in the audit log. This cannot be undone."
              : ""
          }
          confirmLabel="Remove"
          destructive
          onConfirm={handleDelete}
        />
      </div>
    </DesktopAppShell>
  );
};

// ─── Sortable column header ──────────────────────────────────────────────
const SortHead = ({
  label, k, sortKey, sortDir, onClick,
}: {
  label: string; k: SortKey;
  sortKey: SortKey; sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) => (
  <button
    onClick={() => onClick(k)}
    className="inline-flex items-center gap-1 hover:text-foreground transition-colors text-left"
  >
    {label}
    {sortKey === k && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
  </button>
);

// ─── Editable cell ───────────────────────────────────────────────────────
const Cell = ({
  editing, onClick, onCommit, onCancel, draft, setDraft, display, maxLen, transform, type,
}: {
  editing: boolean;
  onClick: () => void;
  onCommit: () => void;
  onCancel: () => void;
  draft: string;
  setDraft: (v: string) => void;
  display: React.ReactNode;
  maxLen?: number;
  transform?: (v: string) => string;
  type?: string;
}) => {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <div data-cell onClick={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(transform ? transform(e.target.value) : e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          }}
          maxLength={maxLen}
          type={type}
          className="w-full rounded-md border bg-card px-2 py-1.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
        />
      </div>
    );
  }
  return (
    <button
      data-cell
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="text-left text-[14px] truncate hover:underline decoration-dotted underline-offset-2"
    >
      {display}
    </button>
  );
};

const MenuItem = ({
  icon, label, onClick, destructive,
}: {
  icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean;
}) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-muted/50"
    style={destructive ? { color: "hsl(var(--urgent))" } : undefined}
  >
    {icon} {label}
  </button>
);
