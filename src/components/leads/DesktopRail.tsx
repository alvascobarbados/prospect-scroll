/**
 * Persistent left navigation rail — desktop only.
 *
 * Visual: dark navy background (#1B2A4E), white text. Sections grouped under
 * uppercase labels: MAIN / TEAM / OTHER. Active item is highlighted with an
 * orange-tinted fill. Footer holds avatar + Help + Settings.
 */
import { useNavigate, useLocation } from "react-router-dom";
import {
  Users, Factory, UserCircle2, Trash2, HelpCircle, Settings,
  Archive, KanbanSquare, ChevronLeft, Activity, LogOut,
  Tags, Palette, Truck, MapPin, Globe2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface Props {
  trashCount: number;
  archiveCount: number;
}

interface Item {
  icon: typeof Users;
  label: string;
  to?: string;
  onClick?: () => void;
  badge?: number;
}

const SectionLabel = ({ children }: { children: string }) => (
  <div
    className="px-3 pt-4 pb-1.5 text-[11px] uppercase font-semibold"
    style={{ color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em" }}
  >
    {children}
  </div>
);

export const DesktopRail = ({ trashCount, archiveCount }: Props) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/");

  const mainItems: Item[] = [
    { icon: KanbanSquare, label: "Pipeline", to: "/" },
    { icon: Activity, label: "Activity Log", to: "/activity" },
  ];
  const dataItems: Item[] = [
    { icon: UserCircle2, label: "Users", to: "/users" },
    { icon: Users, label: "Customers", to: "/customers" },
    { icon: Factory, label: "Suppliers", to: "/suppliers" },
    { icon: Tags, label: "Product Categories", to: "/product-categories" },
    { icon: Palette, label: "Decoration Methods", to: "/decoration-methods" },
    { icon: Truck, label: "Shipping Methods", to: "/shipping-methods" },
    { icon: MapPin, label: "Origins", to: "/origins" },
    { icon: Globe2, label: "Destinations", to: "/destinations" },
    { icon: Settings, label: "Settings", to: "/settings" },
  ];
  const otherItems: Item[] = [
    { icon: Archive, label: "Archive", to: "/archive", badge: archiveCount },
    { icon: Trash2, label: "Trash", to: "/trash", badge: trashCount },
  ];

  const renderItem = (item: Item, key: string) => {
    const active = item.to ? isActive(item.to) : false;
    const handleClick = () => {
      if (item.to) navigate(item.to);
      else item.onClick?.();
    };
    return (
      <button
        key={key}
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors",
        )}
        style={{
          backgroundColor: active
            ? "hsl(var(--brand-orange) / 0.18)"
            : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)";
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <item.icon
          className="h-4 w-4 shrink-0"
          style={{
            color: active ? "hsl(var(--brand-orange))" : "rgba(255,255,255,0.85)",
          }}
        />
        <span
          className="text-[14px] flex-1 truncate"
          style={{
            color: active ? "#fff" : "rgba(255,255,255,0.92)",
            fontWeight: active ? 600 : 500,
          }}
        >
          {item.label}
        </span>
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className="inline-flex items-center justify-center text-[10px] font-semibold tabular px-1.5 rounded-full"
            style={{
              minWidth: 20,
              height: 18,
              backgroundColor: active ? "hsl(var(--brand-orange))" : "rgba(255,255,255,0.15)",
              color: active ? "#fff" : "rgba(255,255,255,0.95)",
            }}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  const { collapsed, toggle } = useSidebarCollapsed();
  const user = useCurrentUser();
  if (collapsed) return null;

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 h-screen sticky top-0"
      style={{
        width: 240,
        backgroundColor: "hsl(var(--brand-navy))",
        borderRight: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Brand row */}
      <div className="px-5 pt-6 pb-5 flex items-center justify-between gap-2">
        <button
          onClick={() => navigate("/")}
          className="block"
          aria-label="Home"
        >
          <span
            className="font-display text-[22px] leading-none tracking-tight"
            style={{ fontWeight: 600 }}
          >
            <span style={{ color: "#fff" }}>alvas</span>
            <span style={{ color: "hsl(var(--brand-orange))" }}>co</span>
          </span>
        </button>
        <button
          onClick={toggle}
          aria-label="Collapse sidebar"
          title="Collapse sidebar (⌘\\)"
          className="inline-flex items-center justify-center rounded-md transition-colors"
          style={{ width: 28, height: 28, color: "rgba(255,255,255,0.7)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="border-t mx-3" style={{ borderColor: "rgba(255,255,255,0.08)" }} />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        <SectionLabel>Main</SectionLabel>
        {mainItems.map((it, i) => renderItem(it, "m" + i))}

        <SectionLabel>Team</SectionLabel>
        {teamItems.map((it, i) => renderItem(it, "t" + i))}

        <SectionLabel>Other</SectionLabel>
        {otherItems.map((it, i) => renderItem(it, "o" + i))}
      </nav>

      <div className="border-t mx-3" style={{ borderColor: "rgba(255,255,255,0.08)" }} />

      {/* Footer: avatar + name + Help/Settings */}
      <div className="px-3 py-3 space-y-1">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0"
            style={{
              backgroundColor: "hsl(var(--brand-orange))",
              color: "#fff",
            }}
          >
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate" style={{ color: "#fff" }}>
              {user.shortName}
            </div>
            <div className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
              {user.role ?? "Team"}
            </div>
          </div>
        </div>
        {renderItem({ icon: HelpCircle, label: "Help", onClick: () => toast("Help docs coming soon") }, "fh")}
        {renderItem({ icon: Settings, label: "Settings", onClick: () => toast("Settings coming soon") }, "fs")}
        {renderItem({ icon: LogOut, label: "Sign out", onClick: () => { void user.signOut(); } }, "fo")}
      </div>
    </aside>
  );
};
