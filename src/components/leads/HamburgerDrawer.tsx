import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Factory, Users, HelpCircle, LogOut, Trash2, UserCircle2, Archive, KanbanSquare, Activity, Tags, Palette, Truck, MapPin, Globe2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSuppliers: () => void;
  onOpenCustomers: () => void;
  onOpenTrash: () => void;
  onOpenArchive: () => void;
  trashCount: number;
  archiveCount: number;
}

const MenuItem = ({
  icon: Icon, label, onClick, dim, badge,
}: { icon: typeof Factory; label: string; onClick: () => void; dim?: boolean; badge?: number }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-5 py-3.5 text-left rounded-xl hover:bg-muted/50 transition-colors",
      dim && "text-muted-foreground",
    )}
    style={{ minHeight: 52 }}
  >
    <Icon className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy))" }} />
    <span className="text-[15px] font-medium flex-1" style={{ color: dim ? undefined : "hsl(var(--brand-navy))" }}>
      {label}
    </span>
    {badge !== undefined && badge > 0 && (
      <span
        className="inline-flex items-center justify-center text-[11px] font-semibold tabular px-1.5 rounded-full"
        style={{
          minWidth: 22, height: 20,
          backgroundColor: "hsl(var(--brand-navy) / 0.1)",
          color: "hsl(var(--brand-navy))",
        }}
      >
        {badge}
      </span>
    )}
  </button>
);

export const HamburgerDrawer = ({
  open, onClose, onOpenSuppliers, onOpenCustomers, onOpenTrash, onOpenArchive, trashCount, archiveCount,
}: Props) => {
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <aside
        className="w-[82%] max-w-xs bg-background border-r shadow-2xl animate-slide-in-left flex flex-col"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}
      >
        <div className="px-5 pt-[max(env(safe-area-inset-top),16px)] pb-4 border-b" style={{ borderColor: "hsl(var(--brand-navy) / 0.12)" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-lg tracking-[0.18em] font-medium" style={{ color: "hsl(var(--brand-navy))" }}>
                ALVASCO ERP
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Operations team</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="p-1.5 rounded-full hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          <div className="px-5 pb-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70 font-medium">Main</div>
          <MenuItem icon={KanbanSquare} label="Pipeline"     onClick={() => { onClose(); navigate("/"); }} />
          <MenuItem icon={Activity}     label="Activity Log" onClick={() => { onClose(); navigate("/activity"); }} />

          <div className="my-3 mx-3 border-t" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }} />
          <div className="px-5 pb-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70 font-medium">Lists</div>
          <MenuItem icon={Users}        label="Customers" onClick={() => { onClose(); navigate("/customers"); }} />
          <MenuItem icon={Factory}      label="Suppliers" onClick={() => { onClose(); navigate("/suppliers"); }} />
          <MenuItem icon={UserCircle2}  label="Team"      onClick={() => { onClose(); navigate("/team"); }} />

          <div className="my-3 mx-3 border-t" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }} />
          <MenuItem icon={Archive} label="Archive" badge={archiveCount} onClick={() => { onClose(); onOpenArchive(); }} />
          <MenuItem icon={Trash2} label="Trash" badge={trashCount} onClick={() => { onClose(); onOpenTrash(); }} />

          <div className="my-3 mx-3 border-t" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }} />

          <MenuItem icon={HelpCircle} label="Help" onClick={() => { onClose(); toast("Help docs coming soon"); }} />
          <MenuItem icon={LogOut} label="Sign out" dim onClick={() => { onClose(); toast("Sign out coming soon"); }} />
        </nav>

        <div className="px-5 py-3 border-t text-[10px] uppercase tracking-[0.3em] text-muted-foreground"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }}>
          Alvasco
        </div>
      </aside>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="flex-1 bg-foreground/30 backdrop-blur-sm animate-fade-in"
      />
    </div>
  );
};
