import { useEffect, useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { spineButton, SpineText } from "./SupplierPickerSpine";

interface CategoryPickerSpineProps {
  productId: string;
  /** Visible spine label */
  label: string | null;
  bg: string;
  ariaLabel: string;
  onChanged?: () => void;
}

interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
}

export function CategoryPickerSpine({
  productId,
  label,
  bg,
  ariaLabel,
  onChanged,
}: CategoryPickerSpineProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<null | { parentId: string }>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setCreating(null);
    setNewName("");
    (async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name, parent_id")
        .order("name", { ascending: true });
      if (!error && data) setRows(data as CategoryRow[]);
    })();
  }, [open]);

  const parents = rows.filter((r) => !r.parent_id);
  const childrenOf = (pid: string) => rows.filter((r) => r.parent_id === pid);

  const filterMatches = (name: string) =>
    search.trim() === "" || name.toLowerCase().includes(search.trim().toLowerCase());

  const assign = async (subcategoryId: string) => {
    setBusy(true);
    const { error } = await supabase
      .from("products")
      .update({ subcategory_id: subcategoryId })
      .eq("id", productId);
    setBusy(false);
    if (error) {
      toast.error(`Failed to update category: ${error.message}`);
      return;
    }
    setOpen(false);
    onChanged?.();
  };

  const createSub = async () => {
    if (!creating) return;
    if (!newName.trim()) {
      toast.error("Subcategory name required");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("product_categories")
      .insert({
        name: newName.trim(),
        parent_id: creating.parentId,
        base_margin_pct: 0,
        step_size_pct: 0,
      })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      toast.error(`Failed to create subcategory: ${error?.message ?? "unknown"}`);
      return;
    }
    await assign(data.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={ariaLabel} style={spineButton(bg)}>
          <SpineText>{label ?? "—"}</SpineText>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-80 p-0">
        {!creating ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ padding: 8, borderBottom: "0.5px solid #F1F2F4" }}>
              <Input
                placeholder="Search categories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto", padding: 6 }}>
              {parents.length === 0 && (
                <div style={{ padding: 12, fontSize: 12, color: "#9CA3AF" }}>
                  No categories yet.
                </div>
              )}
              {parents.map((parent) => {
                const kids = childrenOf(parent.id);
                const parentMatches = filterMatches(parent.name);
                const visibleKids = kids.filter((k) => parentMatches || filterMatches(k.name));
                if (!parentMatches && visibleKids.length === 0) return null;
                return (
                  <div key={parent.id} style={{ marginBottom: 4 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6B7280",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        padding: "4px 8px",
                        fontWeight: 600,
                      }}
                    >
                      {parent.name}
                    </div>
                    {visibleKids.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        disabled={busy}
                        onClick={() => assign(k.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 14px",
                          background: "transparent",
                          border: "none",
                          fontSize: 13,
                          color: "#0E2849",
                          cursor: "pointer",
                          borderRadius: 4,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#F3F4F6")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <ChevronRight size={11} color="#9CA3AF" />
                        {k.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCreating({ parentId: parent.id })}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "4px 14px 6px 14px",
                        background: "transparent",
                        border: "none",
                        fontSize: 11,
                        color: "#9CA3AF",
                        fontStyle: "italic",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Plus size={11} /> Add subcategory under {parent.name}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#6B7280" }}>
              New subcategory under{" "}
              <strong>{rows.find((r) => r.id === creating.parentId)?.name}</strong>
            </div>
            <Input
              autoFocus
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createSub();
                }
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setCreating(null)}
                style={{
                  background: "transparent",
                  border: "0.5px solid #E5E7EB",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#0E2849",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={createSub}
                style={{
                  background: "#0E2849",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#FFFFFF",
                  fontWeight: 500,
                  cursor: "pointer",
                  flex: 1,
                }}
              >
                Create & assign
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
