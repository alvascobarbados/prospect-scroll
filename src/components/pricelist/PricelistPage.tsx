import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { SupplierProductDataList } from "@/components/products/SupplierProductDataList";
import { buildSupplierProductDataList } from "@/components/products/helpers/buildSupplierProductDataList";
import { useSupplierProductData } from "@/hooks/useSupplierProductData";

export function PricelistPage() {
  const navigate = useNavigate();
  const { products, error, reload } = useSupplierProductData();

  useEffect(() => {
    const prev = document.title;
    document.title = "Pricelist";
    return () => {
      document.title = prev;
    };
  }, []);

  const items = products ? buildSupplierProductDataList(products) : [];

  return (
    <DesktopAppShell>
      <div style={{ padding: "32px 32px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => navigate("/")}
            aria-label="Back"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "0.5px solid hsl(var(--border))",
              background: "transparent",
              color: "hsl(var(--foreground))",
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="font-display" style={{ fontSize: 32, color: "hsl(var(--brand-navy))", margin: 0 }}>
            Pricelist
          </h1>
        </div>

        {error && (
          <div style={{ color: "hsl(var(--destructive))", marginBottom: 16, fontSize: 13 }}>
            Failed to load pricelist: {error}
          </div>
        )}

        <div style={{ overflowX: "auto", paddingBottom: 16 }}>
          {products === null ? (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
          ) : (
            <SupplierProductDataList items={items} onChanged={reload} />
          )}
        </div>
      </div>
    </DesktopAppShell>
  );
}
