import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useKitCalcContext } from "@/hooks/useKitCalcContext";
import {
  computeKitCalc,
  computeComponentCalcAt,
  type KitComponentLine,
} from "@/lib/calcKitEngine";
import type { KitComponentRow } from "./helpers/buildSupplierProductDataList";

interface KitPricingBlockProps {
  kitProductId: string;
  components: KitComponentRow[];
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

const INCOMPLETE_PILL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#FEF3E2",
  color: "#C2410C",
  fontSize: 11,
  fontWeight: 500,
  padding: "3px 8px",
  borderRadius: 4,
};

const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function KitPricingBlock({ kitProductId, components }: KitPricingBlockProps) {
  const ctx = useKitCalcContext();
  const [tiers, setTiers] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_kit_tiers")
        .select("quantity, sort_order")
        .eq("kit_product_id", kitProductId)
        .order("sort_order")
        .order("quantity");
      if (cancelled) return;
      setTiers((data ?? []).map((r: any) => Number(r.quantity)).filter((n) => Number.isFinite(n) && n > 0));
    })();
    return () => {
      cancelled = true;
    };
  }, [kitProductId]);

  if (components.length === 0) {
    return (
      <div>
        <div style={HEADER_STYLE}>Kit Pricing</div>
        <div style={INCOMPLETE_PILL}>
          <AlertTriangle size={12} /> no components
        </div>
      </div>
    );
  }

  if (!ctx || tiers === null) {
    return (
      <div>
        <div style={HEADER_STYLE}>Kit Pricing</div>
        <div style={{ color: "#9CA3AF", fontSize: 12 }}>Loading…</div>
      </div>
    );
  }

  if (tiers.length === 0) {
    return (
      <div>
        <div style={HEADER_STYLE}>Kit Pricing</div>
        <div style={{ color: "#9CA3AF", fontSize: 12, fontStyle: "italic" }}>
          Add a kit quantity tier to see pricing.
        </div>
      </div>
    );
  }

  // Build engine inputs from loaded component products.
  const lines: KitComponentLine[] = [];
  const componentNameById = new Map<string, string>();
  const missingComponentIds: string[] = [];
  for (const row of components) {
    const compMeta = row.component;
    if (!compMeta) continue;
    componentNameById.set(compMeta.id, compMeta.name);
    const engineComp = ctx.componentById.get(compMeta.id);
    if (!engineComp) {
      missingComponentIds.push(compMeta.name);
      continue;
    }
    lines.push({
      id: row.id,
      component: engineComp,
      quantity: Number(row.quantity) || 1,
      decoration_id: row.decoration_id,
      sort_order: row.sort_order,
    });
  }

  const result = computeKitCalc(kitProductId, lines, tiers, ctx.routes, ctx.settings);

  return (
    <div>
      <div style={HEADER_STYLE}>Kit Pricing</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {result.rows.map((r) => {
          const incompleteNames = r.incompleteComponents.map(
            (id) => componentNameById.get(id) ?? id,
          );
          // Per-component contributions sourced from the engine (re-cost each
          // component at effectiveQty for display only — same engine path).
          const contributions = lines.map((line) => {
            const calc = computeComponentCalcAt(
              line.component,
              line.decoration_id,
              r.qty * line.quantity,
              ctx.routes,
              ctx.settings,
            );
            const fob = calc?.rows[0]?.spec.productTotalUsd.amount ?? null;
            return {
              name: componentNameById.get(line.component.id) ?? line.component.id,
              qty: line.quantity,
              fob,
            };
          });
          return (
            <div key={r.qty} style={{ fontSize: 12, color: "#0E2849" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 110px",
                  columnGap: 12,
                  alignItems: "baseline",
                  fontWeight: 600,
                }}
              >
                <span>{r.qty.toLocaleString()}</span>
                <span>{r.fobUsd == null ? "—" : fmtUsd(r.fobUsd)}</span>
              </div>
              {(incompleteNames.length > 0 || missingComponentIds.length > 0) && (
                <div
                  style={{ marginTop: 4, ...INCOMPLETE_PILL }}
                  title={[...incompleteNames, ...missingComponentIds].join("; ")}
                >
                  <AlertTriangle size={12} /> specs incomplete:{" "}
                  {[...incompleteNames, ...missingComponentIds].join(", ")}
                </div>
              )}
              {r.fobUsd != null && (
                <div style={{ marginTop: 4, paddingLeft: 4, color: "#6B7280", fontSize: 11, lineHeight: 1.5 }}>
                  {contributions.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: 6 }}>
                      <span style={{ color: "#9CA3AF" }}>×{c.qty}</span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.name}
                      </span>
                      <span>{c.fob == null ? "—" : fmtUsd(c.fob)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          color: "#9CA3AF",
          fontStyle: "italic",
          lineHeight: 1.4,
        }}
        title="Kit FOB rollup is summed by the kit engine from each component's FOB at its effective qty (Q × line qty). Routes/duty/landed cost on the Calculations page use the full kit engine."
      >
        FOB rollup — landed cost computed on Calculations page
      </div>
    </div>
  );
}
