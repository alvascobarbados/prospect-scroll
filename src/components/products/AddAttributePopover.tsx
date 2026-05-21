import { useEffect, useState } from "react";
import { Plus, Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface AddAttributePopoverProps {
  productId: string;
  existingLabelIds: Set<string>;
  nextSortOrder: number;
  onAdded?: () => void;
}

interface DetailLabel {
  id: string;
  label: string;
}

type Stage =
  | { kind: "pick" }
  | { kind: "create"; draft: string }
  | { kind: "value"; label: DetailLabel };

export function AddAttributePopover({
  productId,
  existingLabelIds,
  nextSortOrder,
  onAdded,
}: AddAttributePopoverProps) {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<DetailLabel[]>([]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [valueDraft, setValueDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStage({ kind: "pick" });
    setSearch("");
    setValueDraft("");
    (async () => {
      const { data, error } = await supabase
        .from("detail_labels")
        .select("id, label")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (!error && data) setLabels(data as DetailLabel[]);
    })();
  }, [open]);

  const available = labels.filter((l) => !existingLabelIds.has(l.id));
  const hasExactMatch = available.some(
    (l) => l.label.trim().toLowerCase() === search.trim().toLowerCase(),
  );
  const canCreate = search.trim().length > 0 && !hasExactMatch;

  const pickLabel = (label: DetailLabel) => {
    setStage({ kind: "value", label });
  };

  const createLabel = async (name: string) => {
    setBusy(true);
    const trimmed = name.trim();
    // Try to fetch case-insensitive match first
    const { data: existing } = await supabase
      .from("detail_labels")
      .select("id, label")
      .ilike("label", trimmed)
      .limit(1)
      .maybeSingle();
    let label: DetailLabel | null = (existing as DetailLabel | null) ?? null;
    if (!label) {
      const { data, error } = await supabase
        .from("detail_labels")
        .insert({ label: trimmed, sort_order: 999 })
        .select("id, label")
        .single();
      if (error) {
        setBusy(false);
        toast.error(`Failed to create label: ${error.message}`);
        return;
      }
      label = data as DetailLabel;
    }
    setLabels((prev) => (prev.some((p) => p.id === label!.id) ? prev : [...prev, label!]));
    setBusy(false);
    setStage({ kind: "value", label });
  };

  const saveValue = async () => {
    if (stage.kind !== "value") return;
    const value = valueDraft.trim();
    if (!value) {
      toast.error("Value cannot be empty");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("product_details").insert({
      product_id: productId,
      detail_label_id: stage.label.id,
      value,
      sort_order: nextSortOrder,
    });
    setBusy(false);
    if (error) {
      toast.error(`Failed to add attribute: ${error.message}`);
      return;
    }
    setOpen(false);
    onAdded?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            color: "#9CA3AF",
            fontSize: 12,
            fontStyle: "italic",
            cursor: "pointer",
          }}
        >
          + Add attribute
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {stage.kind === "pick" && (
          <Command shouldFilter>
            <CommandInput
              placeholder="Search or create label…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => createLabel(search)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "#0E2849",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Plus size={13} /> Create "{search.trim()}"
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>No labels found.</span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {available.map((l) => (
                  <CommandItem key={l.id} value={l.label} onSelect={() => pickLabel(l)}>
                    {l.label}
                  </CommandItem>
                ))}
                {canCreate && available.length > 0 && (
                  <CommandItem
                    value={`__create__${search}`}
                    onSelect={() => createLabel(search)}
                  >
                    <Plus size={13} className="mr-2" /> Create "{search.trim()}"
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
        {stage.kind === "value" && (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              onClick={() => setStage({ kind: "pick" })}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                color: "#6B7280",
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
                alignSelf: "flex-start",
              }}
            >
              <ChevronLeft size={12} /> Back
            </button>
            <div style={{ fontSize: 12, color: "#6B7280" }}>{stage.label.label}</div>
            <Input
              autoFocus
              placeholder="Value (e.g. 12oz Cotton)"
              value={valueDraft}
              onChange={(e) => setValueDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveValue();
                }
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={saveValue}
              style={{
                background: "#0E2849",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 500,
                cursor: busy ? "default" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Check size={13} /> Save
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
