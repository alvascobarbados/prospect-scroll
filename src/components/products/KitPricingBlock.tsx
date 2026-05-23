import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useKitCalcContext } from "@/hooks/useKitCalcContext";
import {
  computeKitCalc,
  computeComponentCalcAt,
  type KitComponentLine,
} from "@/lib/calcKitEngine";
import {
  componentDisplayName,
  type KitComponentRow,
} from "./helpers/buildSupplierProductDataList";

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

function headerCellStyle(align: "left" | "right"): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 500,
    color: "#6B7280",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    padding: "4px 8px 6px",
    textAlign: align,
    whiteSpace: "nowrap",
    borderBottom: "0.5px solid #E5E7EB",
  };
}
function bodyCellStyle(align: "left" | "right"): React.CSSProperties {
  return { padding: "6px 8px", textAlign: align, color: "#0E2849" };
}

export function KitPricingBlock({ kitProductId, components }: KitPricingBlockProps) {
  const ctx = useKitCalcContext();
  const [tiers, setTiers] = useState<number[] | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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
  const missingComponentNames: string[] = [];
  for (const row of components) {
    const compMeta = row.component;
    if (!compMeta) continue;
    componentNameById.set(compMeta.id, componentDisplayName(compMeta));
    const engineComp = ctx.componentById.get(compMeta.id);
    if (!engineComp) {
      missingComponentNames.push(componentDisplayName(compMeta));
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

  const toggle = (qty: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(qty)) next.delete(qty);
      else next.add(qty);
      return next;
    });
  };

  return (
    <div>
      <div style={HEADER_STYLE}>Kit Pricing</div>
      <table
        style={{
          width: "auto",
          tableLayout: "fixed",
          borderCollapse: "collapse",
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <colgroup>
          <col style={{ width: 56 }} />
          <col style={{ width: 72 }} />
          <col style={{ width: 18 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={headerCellStyle("left")}>Qty</th>
            <th style={headerCellStyle("right")}>Unit $</th>
            <th style={headerCellStyle("right")} aria-hidden />
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => {
            const incompleteNames = r.incompleteComponents.map(
              (id) => componentNameById.get(id) ?? id,
            );
            const allIssues = [...incompleteNames, ...missingComponentNames];
            const kitPerUnit = r.fobUsd == null ? null : r.fobUsd / r.qty;
            const isOpen = expanded.has(r.qty);
            const showChevron = kitPerUnit != null && lines.length > 0;

            return (
              <>
                <tr key={`row-${r.qty}`}>
                  <td style={{ ...bodyCellStyle("left"), fontWeight: 500 }}>
                    {r.qty.toLocaleString()}
                  </td>
                  <td style={bodyCellStyle("right")}>
                    {kitPerUnit == null ? (
                      <span style={{ color: "#9CA3AF" }}>—</span>
                    ) : (
                      <span title="Calculated — read-only">{fmtUsd(kitPerUnit)}</span>
                    )}
                  </td>
                  <td style={{ ...bodyCellStyle("right"), padding: "6px 0" }}>
                    {showChevron ? (
                      <button
                        type="button"
                        onClick={() => toggle(r.qty)}
                        aria-label={isOpen ? "Hide breakdown" : "Show breakdown"}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: "#9CA3AF",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                          transition: "transform 120ms",
                        }}
                      >
                        <ChevronRight size={12} />
                      </button>
                    ) : null}
                  </td>
                </tr>
                {allIssues.length > 0 && (
                  <tr key={`issue-${r.qty}`}>
                    <td colSpan={3} style={{ padding: "0 8px 4px" }}>
                      <span style={INCOMPLETE_PILL} title={allIssues.join("; ")}>
                        <AlertTriangle size={12} /> specs incomplete: {allIssues.join(", ")}
                      </span>
                    </td>
                  </tr>
                )}
                {isOpen && kitPerUnit != null && (
                  <tr key={`exp-${r.qty}`}>
                    <td colSpan={3} style={{ padding: "2px 8px 6px", color: "#6B7280", fontSize: 11, lineHeight: 1.5 }}>
                      {lines.map((line, i) => {
                        const calc = computeComponentCalcAt(
                          line.component,
                          line.decoration_id,
                          r.qty * line.quantity,
                          ctx.routes,
                          ctx.settings,
                        );
                        const unit = calc?.rows[0]?.spec.fobUnitUsd.amount ?? null;
                        const perKit = unit == null ? null : unit * line.quantity;
                        return (
                          <div key={i} style={{ display: "flex", gap: 6 }}>
                            <span style={{ color: "#9CA3AF" }}>×{line.quantity}</span>
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {componentNameById.get(line.component.id) ?? line.component.id}
                            </span>
                            <span>{perKit == null ? "—" : fmtUsd(perKit)}</span>
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
      <div
        style={{
          marginTop: 6,
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
