import { useEffect, useState, type ReactNode } from "react";
import { Plus, ChevronLeft, Check } from "lucide-react";
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

export interface MethodDetailOption {
  id: string;
  detail: string;
  method: { id: string; name: string } | null;
}

interface MethodDetailPickerProps {
  trigger: ReactNode;
  /** If true (default), the popover opens controlled by clicking the trigger. */
  align?: "start" | "center" | "end";
  onPicked: (md: MethodDetailOption) => void | Promise<void>;
}

type Stage =
  | { kind: "pick" }
  | { kind: "create"; detail: string };

interface Method {
  id: string;
  name: string;
}

function label(md: MethodDetailOption): string {
  const m = md.method?.name?.trim() ?? "";
  const d = md.detail.trim();
  if (!m && !d) return "Decoration";
  if (!m) return d;
  if (!d) return m;
  return m.toLowerCase() === d.toLowerCase() ? d : `${m} — ${d}`;
}

export function MethodDetailPicker({ trigger, align = "start", onPicked }: MethodDetailPickerProps) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [search, setSearch] = useState("");
  const [methodDetails, setMethodDetails] = useState<MethodDetailOption[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [methodPick, setMethodPick] = useState<Method | null>(null);
  const [newMethodName, setNewMethodName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStage({ kind: "pick" });
    setSearch("");
    setMethodPick(null);
    setNewMethodName("");
    (async () => {
      const [{ data: mds }, { data: ms }] = await Promise.all([
        supabase
          .from("method_details")
          .select("id, detail, method:decoration_methods(id, name)")
          .order("detail", { ascending: true }),
        supabase
          .from("decoration_methods")
          .select("id, name")
          .order("name", { ascending: true }),
      ]);
      setMethodDetails((mds ?? []) as unknown as MethodDetailOption[]);
      setMethods((ms ?? []) as Method[]);
    })();
  }, [open]);

  const filtered = methodDetails;
  const hasExact = filtered.some(
    (md) => label(md).trim().toLowerCase() === search.trim().toLowerCase(),
  );
  const canCreate = search.trim().length > 0 && !hasExact;

  const isNoDeco = (md: MethodDetailOption) =>
    (md.method?.name ?? "").trim().toLowerCase() === "no decoration";

  // Group method_details by their decoration_method (name). The "No Decoration"
  // group is pinned at the TOP and styled muted/italic so it reads as a bypass,
  // not a print method.
  const grouped = (() => {
    const map = new Map<string, { methodName: string; items: MethodDetailOption[]; isNoDeco: boolean }>();
    for (const md of filtered) {
      const key = md.method?.id ?? "__other__";
      const methodName = md.method?.name?.trim() || "Other";
      if (!map.has(key)) map.set(key, { methodName, items: [], isNoDeco: isNoDeco(md) });
      map.get(key)!.items.push(md);
    }
    const groups = Array.from(map.entries()).map(([key, g]) => ({
      key,
      methodName: g.methodName,
      isNoDeco: g.isNoDeco,
      items: [...g.items].sort((a, b) => a.detail.localeCompare(b.detail)),
    }));
    groups.sort((a, b) => {
      if (a.isNoDeco) return -1;
      if (b.isNoDeco) return 1;
      if (a.key === "__other__") return 1;
      if (b.key === "__other__") return -1;
      return a.methodName.localeCompare(b.methodName);
    });
    return groups;
  })();


  const handlePick = async (md: MethodDetailOption) => {
    setOpen(false);
    await onPicked(md);
  };

  const startCreate = () => {
    setStage({ kind: "create", detail: search.trim() });
    setMethodPick(null);
    setNewMethodName("");
  };

  const ensureMethodId = async (): Promise<string | null> => {
    if (methodPick) return methodPick.id;
    const name = newMethodName.trim();
    if (!name) {
      toast.error("Pick or name a method");
      return null;
    }
    // Generate a simple code from name
    const code = name.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase().slice(0, 24) || "METHOD";
    const { data, error } = await supabase
      .from("decoration_methods")
      .insert({ name, code, sub_rule_type: "none" })
      .select("id, name")
      .single();
    if (error) {
      toast.error(`Failed to create method: ${error.message}`);
      return null;
    }
    setMethods((prev) => [...prev, data as Method]);
    return (data as Method).id;
  };

  const saveCreate = async () => {
    if (stage.kind !== "create") return;
    const detail = stage.detail.trim();
    if (!detail) {
      toast.error("Detail required");
      return;
    }
    setBusy(true);
    const methodId = await ensureMethodId();
    if (!methodId) {
      setBusy(false);
      return;
    }
    const code = detail.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase().slice(0, 24) || "DETAIL";
    const { data, error } = await supabase
      .from("method_details")
      .insert({ decoration_method_id: methodId, detail, code })
      .select("id, detail, method:decoration_methods(id, name)")
      .single();
    setBusy(false);
    if (error) {
      toast.error(`Failed to create: ${error.message}`);
      return;
    }
    setOpen(false);
    await onPicked(data as unknown as MethodDetailOption);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-0">
        {stage.kind === "pick" && (
          <Command shouldFilter>
            <CommandInput
              placeholder="Search method or detail…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={startCreate}
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
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>No matches.</span>
                )}
              </CommandEmpty>
              {grouped.map((g) => (
                <CommandGroup key={g.key} heading={g.methodName}>
                  {g.items.map((md) => (
                    <CommandItem
                      key={md.id}
                      value={`${g.methodName} ${md.detail}`}
                      onSelect={() => handlePick(md)}
                      style={
                        g.isNoDeco
                          ? { fontStyle: "italic", color: "#6B7280" }
                          : undefined
                      }
                    >
                      {md.detail}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {canCreate && filtered.length > 0 && (
                <CommandGroup>
                  <CommandItem value={`__create__${search}`} onSelect={startCreate}>
                    <Plus size={13} className="mr-2" /> Create "{search.trim()}"
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        )}
        {stage.kind === "create" && (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
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
            <div>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Detail</div>
              <Input
                value={stage.detail}
                onChange={(e) => setStage({ kind: "create", detail: e.target.value })}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Method</div>
              <select
                value={methodPick?.id ?? ""}
                onChange={(e) => {
                  const m = methods.find((mm) => mm.id === e.target.value) ?? null;
                  setMethodPick(m);
                  if (m) setNewMethodName("");
                }}
                style={{
                  width: "100%",
                  border: "0.5px solid #D1D5DB",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 13,
                  background: "white",
                }}
              >
                <option value="">— New method —</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              {!methodPick && (
                <Input
                  placeholder="New method name"
                  value={newMethodName}
                  onChange={(e) => setNewMethodName(e.target.value)}
                  style={{ marginTop: 6 }}
                />
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={saveCreate}
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

export function methodDetailLabel(md: MethodDetailOption | null): string {
  if (!md) return "Decoration";
  return label(md);
}
