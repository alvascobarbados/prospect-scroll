import { AlertTriangle } from "lucide-react";
import type {
  KitComponentRow,
  ProductDecoration,
} from "./helpers/buildSupplierProductDataList";

interface KitPricingBlockProps {
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

const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function pickBand(deco: ProductDecoration | null, effectiveQty: number) {
  if (!deco) return null;
  const bands = [...(deco.product_decoration_bands ?? [])]
    .map((b) => ({
      qty: Number(b.qty),
      unit: typeof b.unit_cost === "string" ? parseFloat(b.unit_cost) : Number(b.unit_cost),
      setup: typeof b.setup_cost === "string" ? parseFloat(b.setup_cost) : Number(b.setup_cost),
    }))
    .filter((b) => Number.isFinite(b.qty) && Number.isFinite(b.unit))
    .sort((a, b) => a.qty - b.qty);
  if (bands.length === 0) return null;
  let chosen = bands[0];
  for (const b of bands) {
    if (b.qty <= effectiveQty) chosen = b;
    else break;
  }
  return chosen;
}

export function KitPricingBlock({ components }: KitPricingBlockProps) {
  if (components.length === 0) {
    return (
      <div>
        <div style={HEADER_STYLE}>Kit Pricing</div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#FEF3E2",
            color: "#C2410C",
            fontSize: 11,
            fontWeight: 500,
            padding: "3px 8px",
            borderRadius: 4,
          }}
        >
          <AlertTriangle size={12} /> no components
        </div>
      </div>
    );
  }

  // Build kit qty breaks from each component's chosen-decoration bands.
  const breakSet = new Set<number>();
  for (const line of components) {
    const deco =
      line.component?.product_decorations.find((d) => d.id === line.decoration_id) ?? null;
    for (const b of deco?.product_decoration_bands ?? []) {
      const compQty = Number(b.qty);
      if (!Number.isFinite(compQty)) continue;
      // Convert component-qty break into kit-qty break.
      const kitQty = Math.max(1, Math.ceil(compQty / Math.max(1, line.quantity)));
      breakSet.add(kitQty);
    }
  }
  if (breakSet.size === 0) breakSet.add(1);
  const kitBreaks = [...breakSet].sort((a, b) => a - b);

  const rows = kitBreaks.map((Q) => {
    const incomplete: string[] = [];
    let kitUnit = 0;
    let kitSetup = 0;
    const contributions: Array<{ name: string; unit: number; setup: number; qty: number }> = [];

    for (const line of components) {
      const comp = line.component;
      if (!comp) {
        incomplete.push("missing component");
        continue;
      }
      const deco =
        comp.product_decorations.find((d) => d.id === line.decoration_id) ?? null;
      if (!deco) {
        incomplete.push(`${comp.name}: no decoration`);
        continue;
      }
      const effective = Q * line.quantity;
      const band = pickBand(deco, effective);
      if (!band) {
        incomplete.push(`${comp.name}: no tier`);
        continue;
      }
      const lineUnitContribution = band.unit * line.quantity;
      kitUnit += lineUnitContribution;
      kitSetup += band.setup;
      contributions.push({
        name: comp.name,
        unit: lineUnitContribution,
        setup: band.setup,
        qty: line.quantity,
      });
    }

    return { qty: Q, unit: kitUnit, setup: kitSetup, incomplete, contributions };
  });

  return (
    <div>
      <div style={HEADER_STYLE}>Kit Pricing</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.qty} style={{ fontSize: 12, color: "#0E2849" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "60px 90px 90px",
                columnGap: 12,
                alignItems: "baseline",
                fontWeight: 600,
              }}
            >
              <span>{r.qty.toLocaleString()}</span>
              <span>{r.incomplete.length ? "—" : fmtUsd(r.unit)}</span>
              <span style={{ color: "#6B7280", fontWeight: 400 }}>
                {r.incomplete.length ? "—" : `setup ${fmtUsd(r.setup)}`}
              </span>
            </div>
            {r.incomplete.length > 0 && (
              <div
                style={{
                  marginTop: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#FEF3E2",
                  color: "#C2410C",
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 8px",
                  borderRadius: 4,
                }}
                title={r.incomplete.join("; ")}
              >
                <AlertTriangle size={12} /> specs incomplete: {r.incomplete.join(", ")}
              </div>
            )}
            {r.incomplete.length === 0 && (
              <div style={{ marginTop: 4, paddingLeft: 4, color: "#6B7280", fontSize: 11, lineHeight: 1.5 }}>
                {r.contributions.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 6 }}>
                    <span style={{ color: "#9CA3AF" }}>×{c.qty}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name}
                    </span>
                    <span>{fmtUsd(c.unit)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          color: "#9CA3AF",
          fontStyle: "italic",
          lineHeight: 1.4,
        }}
        title="Kit FOB rollup is a sum of component FOB at each kit-qty break. Routes/duty/landed cost on the Calculations page use the full kit engine."
      >
        FOB rollup — landed cost computed on Calculations page
      </div>
    </div>
  );
}
