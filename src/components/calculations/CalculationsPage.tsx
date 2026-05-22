import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { useCalcPageData } from "@/hooks/useCalcPageData";
import { CalculationsCard } from "./CalculationsCard";

export function CalculationsPage() {
  const navigate = useNavigate();
  const { products, routes, settings, error } = useCalcPageData();
  const [supplierFilter, setSupplierFilter] = useState<string>("__all__");

  useEffect(() => {
    const prev = document.title;
    document.title = "Calculations";
    return () => { document.title = prev; };
  }, []);

  const suppliers = useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    for (const p of products) if (p.supplier?.code) set.add(p.supplier.code);
    return Array.from(set).sort();
  }, [products]);

  const visibleProducts = useMemo(() => {
    if (!products) return [];
    return supplierFilter === "__all__"
      ? products
      : products.filter((p) => p.supplier?.code === supplierFilter);
  }, [products, supplierFilter]);

  return (
    <DesktopAppShell>
      <div style={{ padding: "32px 32px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <button
            onClick={() => navigate("/")}
            aria-label="Back"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 8,
              border: "0.5px solid hsl(var(--border))", background: "transparent",
              color: "hsl(var(--foreground))", cursor: "pointer",
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="font-display" style={{ fontSize: 32, color: "hsl(var(--brand-navy))", margin: 0 }}>
            Calculations
          </h1>
        </div>
        <div style={{ fontStyle: "italic", color: "#6B7280", fontSize: 12, marginBottom: 20, marginLeft: 44 }}>
          Cost engine — Identity → Specs → Product Costs → FOB → Transport → CIF → LAC → LDF → Duty → LDP.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "#6B7280" }}>Supplier:</label>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            style={{
              fontSize: 12, padding: "4px 8px", borderRadius: 6,
              border: "0.5px solid hsl(var(--border))", background: "#fff", minWidth: 140,
            }}
          >
            <option value="__all__">All suppliers</option>
            {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#6B7280" }}>
            {visibleProducts.length} product{visibleProducts.length === 1 ? "" : "s"}
          </span>
        </div>

        {error && (
          <div style={{ color: "hsl(var(--destructive))", marginBottom: 16, fontSize: 13 }}>
            Failed to load: {error}
          </div>
        )}

        {products === null && (
          <div style={{ padding: 24, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>Loading…</div>
        )}

        {settings && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {visibleProducts.map((p) => (
              <div key={p.id} style={{ overflowX: "auto" }}>
                <CalculationsCard product={p} routes={routes} settings={settings} />
              </div>
            ))}
            {visibleProducts.length === 0 && products && products.length > 0 && (
              <div style={{ padding: 24, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>
                No products match filter.
              </div>
            )}
          </div>
        )}
      </div>
    </DesktopAppShell>
  );
}
