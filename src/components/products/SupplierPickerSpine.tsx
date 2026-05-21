import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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

interface SupplierPickerSpineProps {
  productId: string;
  supplierName: string | null;
  onChanged?: () => void;
}

interface SupplierRow {
  id: string;
  name: string;
  code: string | null;
}

export function SupplierPickerSpine({ productId, supplierName, onChanged }: SupplierPickerSpineProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setCreating(false);
    setNewName("");
    setNewCode("");
    (async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, code")
        .order("name", { ascending: true });
      if (!error && data) setRows(data as SupplierRow[]);
    })();
  }, [open]);

  const assign = async (supplierId: string) => {
    setBusy(true);
    const { error } = await supabase
      .from("products")
      .update({ supplier_id: supplierId })
      .eq("id", productId);
    setBusy(false);
    if (error) {
      toast.error(`Failed to update supplier: ${error.message}`);
      return;
    }
    setOpen(false);
    onChanged?.();
  };

  const createAndAssign = async () => {
    if (!newName.trim()) {
      toast.error("Supplier name required");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("suppliers")
      .insert({ name: newName.trim(), code: newCode.trim() || null })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      toast.error(`Failed to create supplier: ${error?.message ?? "unknown"}`);
      return;
    }
    await assign(data.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change supplier"
          style={spineButton("#0E2849")}
        >
          <SpineText>{supplierName ?? "—"}</SpineText>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-72 p-0">
        {!creating ? (
          <Command shouldFilter>
            <CommandInput
              placeholder="Search suppliers…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>No suppliers found.</span>
              </CommandEmpty>
              <CommandGroup>
                {rows.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`${r.name} ${r.code ?? ""}`}
                    onSelect={() => assign(r.id)}
                  >
                    <span style={{ flex: 1 }}>{r.name}</span>
                    {r.code && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          color: "#6B7280",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {r.code}
                      </span>
                    )}
                  </CommandItem>
                ))}
                <CommandItem value="__create__" onSelect={() => setCreating(true)}>
                  <Plus size={13} className="mr-2" /> Create new supplier…
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#6B7280" }}>New supplier</div>
            <Input
              autoFocus
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              placeholder="Code (e.g. ACME)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setCreating(false)}
                style={ghostBtnStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={createAndAssign}
                style={primaryBtnStyle}
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

function SpineText({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        writingMode: "vertical-rl",
        transform: "rotate(180deg)",
        fontSize: 11,
        color: "#FFFFFF",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function spineButton(bg: string): React.CSSProperties {
  return {
    width: 26,
    background: bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    padding: 0,
    cursor: "pointer",
  };
}

const ghostBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "0.5px solid #E5E7EB",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
  color: "#0E2849",
  cursor: "pointer",
};

const primaryBtnStyle: React.CSSProperties = {
  background: "#0E2849",
  border: "none",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
  color: "#FFFFFF",
  fontWeight: 500,
  cursor: "pointer",
  flex: 1,
};

export { spineButton, SpineText };
