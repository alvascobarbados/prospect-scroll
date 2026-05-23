import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InlineNumber } from "@/components/inline/InlineNumber";
import { InlinePicker } from "@/components/inline/InlinePicker";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import {
  componentDisplayName,
  type KitComponentRow,
  type Product,
  type ProductDecoration,
} from "./helpers/buildSupplierProductDataList";

interface KitComponentsBlockProps {
  kitProductId: string;
  components: KitComponentRow[];
  /** All loaded products on the sheet, used to filter eligible single products. */
  allProducts: Product[];
  onChanged?: () => void;
}

const HEADER_STYLE: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#6B7280",
  marginBottom: 8,
  fontWeight: 600,
  lineHeight: 1.2,
};

function isPrintMethod(d: ProductDecoration): boolean {
  // Treat anything that isn't NODECO as a "print" method.
  const codeOrName = (d.method_detail?.method?.name ?? "").toLowerCase();
  return codeOrName !== "no decoration" && codeOrName !== "";
}

function eligibleAsComponent(p: Product, kitProductId: string): boolean {
  if (p.id === kitProductId) return false;
  if ((p.product_kind ?? "single") !== "single") return false;
  const printCount = (p.product_decorations ?? []).filter(isPrintMethod).length;
  return printCount <= 1;
}

export function KitComponentsBlock({
  kitProductId,
  components,
  allProducts,
  onChanged,
}: KitComponentsBlockProps) {
  const sorted = [...components].sort((a, b) => a.sort_order - b.sort_order);

  const eligibles = allProducts.filter((p) => eligibleAsComponent(p, kitProductId));


  return (
    <div>
      <div style={HEADER_STYLE}>Components</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((line) => (
          <ComponentLine
            key={line.id}
            line={line}
            eligibles={eligibles}
            onChanged={onChanged}
          />
        ))}
        <AddComponentRow
          kitProductId={kitProductId}
          eligibles={eligibles}
          nextSort={(sorted.at(-1)?.sort_order ?? 0) + 1}
          onAdded={onChanged}
        />
      </div>
    </div>
  );
}

function ComponentLine({
  line,
  eligibles,
  onChanged,
}: {
  line: KitComponentRow;
  eligibles: Product[];
  onChanged?: () => void;
}) {
  const [hover, setHover] = useState(false);

  const comp = line.component;
  const decoOptions = (comp?.product_decorations ?? [])
    .slice()
    .sort((a, b) => {
      // No Decoration first.
      const aNo = !isPrintMethod(a);
      const bNo = !isPrintMethod(b);
      if (aNo && !bNo) return -1;
      if (!aNo && bNo) return 1;
      return a.sort_order - b.sort_order;
    });

  const currentDeco =
    comp?.product_decorations.find((d) => d.id === line.decoration_id) ?? null;
  const currentDecoLabel = (() => {
    if (!currentDeco) return "—";
    const m = currentDeco.method_detail?.method?.name?.trim() ?? "";
    const d = currentDeco.method_detail?.detail?.trim() ?? "";
    if (!m && !d) return "Decoration";
    if (!m) return d;
    if (!d) return m;
    return m.toLowerCase() === d.toLowerCase() ? d : `${m} — ${d}`;
  })();

  const remove = async () => {
    const { error } = await supabase
      .from("product_kit_components")
      .delete()
      .eq("id", line.id);
    if (error) {
      toast.error(`Failed to remove: ${error.message}`);
      return;
    }
    onChanged?.();
  };

  const updateLine = async (patch: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("product_kit_components").update(patch as any).eq("id", line.id) as any);
    if (error) {
      toast.error(error.message);
      throw new Error(error.message);
    }
    onChanged?.();
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 56px 14px",
        columnGap: 8,
        rowGap: 4,
        alignItems: "baseline",
        fontSize: 12,
        color: "#0E2849",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <InlinePicker
          display={
            <span>
              {comp ? (
                <>
                  <span style={{ fontWeight: 500 }}>{componentDisplayName(comp)}</span>
                  {comp.supplier_item_number && (
                    <span style={{ color: "#6B7280", marginLeft: 6, fontSize: 11 }}>
                      {comp.supplier_item_number}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>missing component</span>
              )}
            </span>
          }
          options={eligibles.map((p) => ({
            id: p.id,
            label: componentDisplayName(p),
            hint: p.supplier_item_number ?? undefined,
          }))}
          onSelect={async (opt) => {
            if (opt.id === comp?.id) return;
            await updateLine({ component_product_id: opt.id, decoration_id: null });
          }}
          placeholder="Search component…"
        />
      </div>
      <InlineNumber
        value={line.quantity}
        integer
        min={1}
        width={48}
        onSave={async (v) => {
          await updateLine({ quantity: v ?? 1 });
        }}
      />
      <button
        type="button"
        onClick={remove}
        aria-label="Remove component"
        style={{
          opacity: hover ? 1 : 0,
          transition: "opacity 120ms",
          background: "transparent",
          border: "none",
          padding: 0,
          color: "#9CA3AF",
          cursor: "pointer",
          width: 14,
          height: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={11} />
      </button>
      <div style={{ gridColumn: "1 / span 3" }}>
        <DecorationPicker
          options={decoOptions}
          currentLabel={currentDecoLabel}
          isNoDeco={currentDeco ? !isPrintMethod(currentDeco) : false}
          onPick={async (d) => {
            await updateLine({ decoration_id: d.id });
          }}
        />
      </div>
    </div>
  );
}

function DecorationPicker({
  options,
  currentLabel,
  isNoDeco,
  onPick,
}: {
  options: ProductDecoration[];
  currentLabel: string;
  isNoDeco: boolean;
  onPick: (d: ProductDecoration) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group cursor-pointer rounded px-0.5 hover:bg-[#F3F4F6] transition-colors text-left inline-flex items-center gap-1"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            fontSize: 11,
            color: isNoDeco ? "#6B7280" : "#0E2849",
            fontStyle: isNoDeco ? "italic" : "normal",
          }}
        >
          <span>{currentLabel}</span>
          <ChevronDown
            size={11}
            strokeWidth={2}
            className="opacity-30 group-hover:opacity-100 transition-opacity shrink-0"
            style={{ color: "#9CA3AF" }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter>
          <CommandInput placeholder="Search decoration…" />
          <CommandList>
            <CommandEmpty>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>No decorations on this component.</span>
            </CommandEmpty>
            {options.map((d) => {
              const m = d.method_detail?.method?.name?.trim() ?? "";
              const det = d.method_detail?.detail?.trim() ?? "";
              const lbl = !m ? det : !det ? m : m.toLowerCase() === det.toLowerCase() ? det : `${m} — ${det}`;
              const noDeco = !isPrintMethod(d);
              return (
                <CommandGroup key={d.id} heading={noDeco ? "No Decoration" : m || "Decoration"}>
                  <CommandItem
                    value={`${m} ${det}`}
                    onSelect={async () => {
                      setOpen(false);
                      await onPick(d);
                    }}
                    style={noDeco ? { fontStyle: "italic", color: "#6B7280" } : undefined}
                  >
                    {det || lbl}
                  </CommandItem>
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AddComponentRow({
  kitProductId,
  eligibles,
  nextSort,
  onAdded,
}: {
  kitProductId: string;
  eligibles: Product[];
  nextSort: number;
  onAdded?: () => void;
}) {
  const add = async (componentId: string) => {
    const { error } = await supabase.from("product_kit_components").insert({
      kit_product_id: kitProductId,
      component_product_id: componentId,
      quantity: 1,
      decoration_id: null,
      sort_order: nextSort,
    });
    if (error) {
      toast.error(`Failed to add component: ${error.message}`);
      return;
    }
    onAdded?.();
  };

  return (
    <div style={{ marginTop: 4 }}>
      <InlinePicker
        display={
          <span style={{ color: "#9CA3AF", fontSize: 12, fontStyle: "italic" }}>
            + Add component
          </span>
        }
        options={eligibles.map((p) => ({
          id: p.id,
          label: componentDisplayName(p),
          hint: p.supplier_item_number ?? undefined,
        }))}
        onSelect={async (opt) => {
          await add(opt.id);
        }}
        placeholder="Search component…"
      />
    </div>
  );
}
