import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface InlinePickerOption {
  id: string;
  label: string;
  /** Optional secondary text shown right-aligned. */
  hint?: string;
}

interface InlinePickerProps {
  /** Read-mode display content (typically the selected option's label). */
  display: ReactNode;
  /** Available options. */
  options: InlinePickerOption[];
  /** Called when an option is selected. */
  onSelect: (option: InlinePickerOption) => void | Promise<void>;
  /** If provided, enables "Create new" with the typed value. */
  onCreate?: (typed: string) => void | Promise<void>;
  /** Optional initial value for the search box. */
  initialSearch?: string;
  /** Read-mode wrapper class. */
  className?: string;
  /** Read-mode wrapper style. */
  style?: React.CSSProperties;
  placeholder?: string;
  /** Optional placeholder for empty display. */
  emptyDisplay?: ReactNode;
}

export function InlinePicker({
  display,
  options,
  onSelect,
  onCreate,
  initialSearch = "",
  className,
  style,
  placeholder = "Search…",
  emptyDisplay,
}: InlinePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(initialSearch);

  useEffect(() => {
    if (open) setSearch(initialSearch);
  }, [open, initialSearch]);

  const hasExact = options.some(
    (o) => o.label.trim().toLowerCase() === search.trim().toLowerCase(),
  );
  const canCreate = !!onCreate && search.trim().length > 0 && !hasExact;

  const handleSelect = async (opt: InlinePickerOption) => {
    setOpen(false);
    await onSelect(opt);
  };

  const handleCreate = async () => {
    if (!onCreate) return;
    const typed = search.trim();
    if (!typed) return;
    setOpen(false);
    await onCreate(typed);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`cursor-pointer rounded px-0.5 hover:bg-[#F3F4F6] transition-colors text-left ${className ?? ""}`}
          style={{ background: "transparent", border: "none", padding: 0, ...style }}
        >
          {display || emptyDisplay || (
            <span className="italic" style={{ color: "#9CA3AF" }}>
              —
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter>
          <CommandInput placeholder={placeholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>
              {canCreate ? (
                <button
                  type="button"
                  onClick={handleCreate}
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
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>No results.</span>
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.id} value={o.label} onSelect={() => handleSelect(o)}>
                  <span style={{ flex: 1 }}>{o.label}</span>
                  {o.hint && (
                    <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 8 }}>
                      {o.hint}
                    </span>
                  )}
                </CommandItem>
              ))}
              {canCreate && options.length > 0 && (
                <CommandItem value={`__create__${search}`} onSelect={handleCreate}>
                  <Plus size={13} className="mr-2" /> Create "{search.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
