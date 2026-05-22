import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ProductCardMenuProps {
  onDuplicateAsVariant: () => void | Promise<void>;
}

export function ProductCardMenu({ onDuplicateAsVariant }: ProductCardMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handle = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Product actions"
          title="Product actions"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: "none",
            background: open ? "#F3F4F6" : "transparent",
            color: "#6B7280",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MoreHorizontal size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-52 p-1"
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => handle(onDuplicateAsVariant)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "8px 10px",
            fontSize: 13,
            color: "#0E2849",
            background: "transparent",
            border: "none",
            borderRadius: 4,
            cursor: busy ? "wait" : "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#F3F4F6")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {busy ? "Duplicating…" : "Duplicate as variant"}
        </button>
      </PopoverContent>
    </Popover>
  );
}
