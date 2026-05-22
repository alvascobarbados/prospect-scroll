/**
 * CalculationsCard — one wide horizontal card per product.
 *
 * Visually extends the Supplier Product Data card rightward through the
 * full landed-cost chain:
 *   Spine → Image → Identity → Specs → Product Costs → [FOB] →
 *   Transport → [CIF] → LAC → [LDF] → Duty → [LDP]
 *
 * Blocks in [brackets] are amber outputs; the rest are white workings.
 * Route bubbles render in a stable global order; mismatched-origin
 * bubbles gray out (the table structure never shifts per product).
 */
import { useMemo } from "react";
import { SupplierSpine } from "@/components/products/SupplierSpine";
import { formatMoney, formatNumber } from "@/lib/formatMoney";
import {
  cheapestBbRouteForRow,
  computeProductCalc,
  type CalcRow,
  type ProductInput,
  type RouteInput,
  type Settings,
} from "@/lib/calcEngine";
import type { CalcPageProduct } from "@/hooks/useCalcPageData";

const EM = "\u2014";

// ───────── Tokens ─────────
const AMBER_BG = "#FFFAF0";
const AMBER_BORDER = "#F2D9B2";
const AMBER_TEXT = "#6B4F2A";
const NAVY = "#0E2849";
const GRAY_BG = "#F3F4F6";
const SELECT_USD_BG = "#E5EAF1";
const SELECT_AMBER_BG = "#FEF3E2";
const BLOCK_BORDER = "0.5px solid #E5E7EB";
const BUBBLE_BORDER = "0.5px solid #E5E7EB";

const NUM_FONT: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

// ───────── Helpers ─────────

/** Decode subcategory.duty_rate_pct → engine decimal or null.
 *  null  = rate not set (engine flags dutyMissing).
 *  0     = legitimate 0% duty (real 0).
 *  20    = 20% → 0.20. */
function dutyDecimal(p: CalcPageProduct): number | null {
  const raw = p.subcategory?.duty_rate_pct;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

function toProductInput(p: CalcPageProduct): ProductInput | null {
  if (!p.origin?.code) return null;
  const tiers: { qty: number; unitUsd: number; setupUsd: number; inlandFreightUsd: number | null }[] = [];
  const seen = new Set<number>();
  for (const d of p.product_decorations ?? []) {
    for (const b of d.product_decoration_bands ?? []) {
      if (seen.has(b.qty)) continue;
      seen.add(b.qty);
      const rawItc = (b as { inland_freight_usd?: number | string | null }).inland_freight_usd;
      const itc =
        rawItc == null || rawItc === ""
          ? null
          : typeof rawItc === "string"
            ? parseFloat(rawItc)
            : Number(rawItc);
      tiers.push({
        qty: Number(b.qty),
        unitUsd: typeof b.unit_cost === "string" ? parseFloat(b.unit_cost) : Number(b.unit_cost),
        setupUsd: typeof b.setup_cost === "string" ? parseFloat(b.setup_cost) : Number(b.setup_cost),
        inlandFreightUsd: Number.isFinite(itc as number) ? (itc as number) : null,
      });
    }
  }
  tiers.sort((a, b) => a.qty - b.qty);
  if (
    !tiers.length ||
    p.carton_pack == null ||
    p.carton_length == null ||
    p.carton_width == null ||
    p.carton_height == null ||
    p.carton_weight == null
  ) {
    return null;
  }
  return {
    id: p.id,
    origin: p.origin.code,
    pcsPerCtn: Number(p.carton_pack),
    ctnLengthRaw: Number(p.carton_length),
    ctnWidthRaw: Number(p.carton_width),
    ctnHeightRaw: Number(p.carton_height),
    wtPerCtnRaw: Number(p.carton_weight),
    dimensionUnit: (p.supplier?.dimension_unit ?? "cm") as "cm" | "in",
    weightUnit: (p.supplier?.weight_unit_v2 ?? "kg") as "kg" | "lb",
    dutyRate: dutyDecimal(p),
    pricingTiers: tiers,
  };
}

// ───────── Reusable atoms ─────────

const Tag = ({ children, kind }: { children: React.ReactNode; kind: "built" | "new" | "output" }) => {
  const styles: Record<typeof kind, React.CSSProperties> =
    kind === "built"
      ? ({ built: { background: "#DCFCE7", color: "#166534" } } as any)
      : kind === "new"
        ? ({ new: { background: "#FEF3E2", color: "#C2410C" } } as any)
        : ({ output: { background: "#FEF3E2", color: "#C2410C" } } as any);
  const s = (styles as any)[kind] as React.CSSProperties;
  return (
    <span
      style={{
        ...s,
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        padding: "1px 6px",
        borderRadius: 4,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
};

const CurrencyBadge = ({ currency }: { currency: "USD" | "BBD" }) => (
  <span
    style={{
      background: currency === "USD" ? "#E5EAF1" : "#DBEAFE",
      color: currency === "USD" ? "#0E2849" : "#1E3A8A",
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.05em",
      padding: "1px 5px",
      borderRadius: 4,
    }}
  >
    {currency}
  </span>
);

const ScopeBadge = () => (
  <span
    style={{
      background: "#FEF3E2",
      color: "#C2410C",
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.05em",
      padding: "1px 5px",
      borderRadius: 4,
    }}
  >
    → BB
  </span>
);

const BlockHeader = ({
  title,
  currency,
  scopeBB,
  tag,
}: {
  title: string;
  currency: "USD" | "BBD";
  scopeBB?: boolean;
  tag: "built" | "new" | "output";
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, whiteSpace: "nowrap" }}>
    <span style={{ fontSize: 14, fontWeight: 600, color: NAVY, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {title}
    </span>
    <Tag kind={tag}>{tag}</Tag>
    <CurrencyBadge currency={currency} />
    {scopeBB && <ScopeBadge />}
  </div>
);

const RouteColumnHeader = ({ label }: { label: string }) => (
  <div
    style={{
      fontSize: 9,
      fontWeight: 700,
      color: "#6B7280",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      textAlign: "center",
      whiteSpace: "nowrap",
      padding: "0 4px 4px",
    }}
  >
    {label}
  </div>
);

const BUBBLE_W = 196;
const ROW_H = 64;
const BUBBLE_GAP = 6;

interface BubbleProps {
  children: React.ReactNode;
  amber?: boolean;
  gray?: boolean;
  selected?: boolean;
  height?: number;
}

const Bubble = ({ children, amber, gray, selected, height = ROW_H }: BubbleProps) => {
  let bg = "#FFFFFF";
  let border = BUBBLE_BORDER;
  let color: string | undefined;
  if (gray) {
    bg = GRAY_BG;
    color = "#9CA3AF";
  } else if (amber) {
    bg = selected ? SELECT_AMBER_BG : AMBER_BG;
    border = `0.5px solid ${selected ? AMBER_TEXT : AMBER_BORDER}`;
    color = AMBER_TEXT;
  } else if (selected) {
    bg = SELECT_USD_BG;
    border = `0.5px solid ${NAVY}`;
  }
  return (
    <div
      style={{
        width: BUBBLE_W,
        height,
        background: bg,
        border,
        borderRadius: 6,
        padding: "6px 8px",
        color,
        fontSize: 14,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        ...NUM_FONT,
      }}
    >
      {children}
    </div>
  );
};

const RowGap = ({ height = 8 }: { height?: number }) => <div style={{ height }} />;

// ───────── Block components ─────────

const SpecsBlock = ({ p }: { p: CalcPageProduct }) => {
  const leadTime =
    p.production_days_min == null
      ? EM
      : p.production_days_max == null
        ? `${p.production_days_min}d`
        : `${p.production_days_min}–${p.production_days_max}d`;
  const dimUnit = p.supplier?.dimension_unit ?? "cm";
  const wtUnit = p.supplier?.weight_unit_v2 ?? "kg";
  const wtLabel = wtUnit === "lb" ? "lbs" : "kg";
  const dims =
    p.carton_length != null && p.carton_width != null && p.carton_height != null
      ? `${p.carton_length}×${p.carton_width}×${p.carton_height} ${dimUnit}`
      : EM;
  return (
    <div style={{ padding: "12px 14px", borderRight: BLOCK_BORDER, minWidth: 200, whiteSpace: "nowrap", flexShrink: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Specs
      </div>
      <div style={{ fontSize: 13, color: "#374151", display: "grid", gap: 4 }}>
        <div><span style={{ color: "#9CA3AF" }}>Pcs/Ctn </span>{p.carton_pack ?? EM}</div>
        <div><span style={{ color: "#9CA3AF" }}>Ctn </span>{dims}</div>
        <div><span style={{ color: "#9CA3AF" }}>Wt </span>{p.carton_weight != null ? `${p.carton_weight} ${wtLabel}` : EM}</div>
        <div><span style={{ color: "#9CA3AF" }}>Lead </span>{leadTime}</div>
      </div>
    </div>
  );
};

const IdentityBlock = ({ p }: { p: CalcPageProduct }) => (
  <div style={{ padding: "12px 14px", borderRight: BLOCK_BORDER, minWidth: 240, maxWidth: 300, flexShrink: 0 }}>
    <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
      {p.supplier?.code ?? EM}
    </div>
    <div style={{ fontSize: 15, fontWeight: 600, color: "#18181B", lineHeight: 1.25 }}>{p.name}</div>
    {p.variant_name && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{p.variant_name}</div>}
    {p.supplier_item_number && (
      <div style={{ display: "inline-block", marginTop: 6, fontSize: 11, fontFamily: "monospace", color: "#6B7280", background: "#F3F4F6", padding: "1px 6px", borderRadius: 4 }}>
        {p.supplier_item_number}
      </div>
    )}
  </div>
);

const ImageBlock = ({ p }: { p: CalcPageProduct }) => (
  <div style={{ width: 90, padding: 8, borderRight: BLOCK_BORDER, display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFBFC", flexShrink: 0 }}>
    {p.image_url ? (
      <img src={p.image_url} alt={p.name} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6 }} />
    ) : (
      <div style={{ width: 72, height: 72, borderRadius: 6, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", color: "#D1D5DB", fontSize: 10 }}>
        no img
      </div>
    )}
  </div>
);

// ───────── The card ─────────

interface Props {
  product: CalcPageProduct;
  routes: RouteInput[];
  settings: Settings;
}

export function CalculationsCard({ product, routes, settings }: Props) {
  const supplierName = product.supplier?.name ?? "Unknown";
  const productInput = useMemo(() => toProductInput(product), [product]);

  const calc = useMemo(
    () => (productInput ? computeProductCalc(productInput, routes, settings) : null),
    [productInput, routes, settings],
  );

  const orderedRoutes = useMemo(
    () => [...routes].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    [routes],
  );
  const bbRoutes = useMemo(() => orderedRoutes.filter((r) => r.destination === "BB"), [orderedRoutes]);

  const selectedByRow: Record<number, string | null> = useMemo(() => {
    const out: Record<number, string | null> = {};
    calc?.rows.forEach((r, i) => {
      out[i] = cheapestBbRouteForRow(r, calc.bbRouteOrder);
    });
    return out;
  }, [calc]);

  // Engine is the single source of truth for "duty rate missing" — the
  // flag is set on every active BB-route cell. We just observe it here.
  const dutyUnset = useMemo(() => {
    if (!calc) return false;
    for (const row of calc.rows) {
      for (const id of calc.bbRouteOrder) {
        const c = row.bbOutputs[id];
        if (c && c.active && c.dutyMissing) return true;
      }
    }
    return false;
  }, [calc]);

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        position: "relative",
        width: "max-content",
        minWidth: "100%",
      }}
    >
      <SupplierSpine supplierName={supplierName} />
      {dutyUnset && (
        <div
          role="alert"
          style={{
            marginLeft: 26,
            padding: "6px 12px",
            background: "#FEF3C7",
            borderBottom: "0.5px solid #F2D9B2",
            color: "#92400E",
            fontSize: 11,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13 }}>⚠</span>
          Duty rate not set for "{product.subcategory?.name ?? "subcategory"}" — landed cost is computed with 0% duty and may be understated.
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "nowrap",
          alignItems: "stretch",
          marginLeft: 26,
          width: "max-content",
        }}
      >
        <ImageBlock p={product} />
        <IdentityBlock p={product} />
        <SpecsBlock p={product} />

        {!calc && (
          <div style={{ padding: 24, fontSize: 12, color: "#9CA3AF", fontStyle: "italic" }}>
            Missing data — fill carton specs and at least one pricing band to see calculations.
          </div>
        )}

        {calc && (
          <>
            {/* ─── Product Costs (white, USD, Built) ─── */}
            <div style={{ padding: "12px 14px", borderRight: BLOCK_BORDER, background: "#fff", flexShrink: 0 }}>
              <BlockHeader title="Product Costs" currency="USD" tag="built" />
              <table style={{ borderCollapse: "collapse", fontSize: 14, ...NUM_FONT }}>
                <thead>
                  <tr style={{ color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11 }}>
                    <Th>Qty</Th>
                    <Th align="right">Unit</Th>
                    <Th align="right">Setup</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {calc.rows.map((row, i) => {
                    const tier = productInput!.pricingTiers[i];
                    return (
                      <tr key={i} style={{ height: ROW_H }}>
                        <Td>{row.spec.qty}</Td>
                        <Td align="right">{formatMoney({ amount: tier.unitUsd, currency: "USD" })}</Td>
                        <Td align="right">{formatMoney({ amount: tier.setupUsd, currency: "USD" })}</Td>
                        <Td align="right" bold>
                          {formatMoney(row.spec.productTotalUsd)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ─── FOB (amber output, USD, single column) ─── */}
            <OutputColumn label="FOB" columns={[{ id: "all", label: "All routes" }]}>
              {calc.rows.map((row, i) => (
                <Bubble key={i} amber>
                  <div style={{ fontWeight: 600 }}>{formatMoney(row.spec.productTotalUsd)}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{formatMoney(row.spec.fobUnitUsd)} /u</div>
                </Bubble>
              ))}
            </OutputColumn>

            {/* ─── Transport (white, USD, New) ─── */}
            <RouteColumnBlock
              title="Transportation Costs"
              tag="new"
              currency="USD"
              routes={orderedRoutes}
              rows={calc.rows}
              renderCell={(row, route, i) => {
                const c = row.transports[route.id];
                if (!c.active) {
                  // "invalid data" → amber warning (visibly distinct from
                  // the neutral gray "origin mismatch" / "no tier").
                  const isInvalid = c.reason === "invalid data";
                  return (
                    <Bubble key={route.id} gray={!isInvalid} amber={isInvalid}>
                      <div style={{ textAlign: "center" }}>
                        {isInvalid ? "⚠" : EM}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontStyle: isInvalid ? "normal" : "italic",
                          textAlign: "center",
                          color: isInvalid ? "#92400E" : undefined,
                          fontWeight: isInvalid ? 600 : undefined,
                        }}
                      >
                        {c.reason}
                      </div>
                    </Bubble>
                  );
                }
                const tierLabel = c.tier
                  ? `${formatNumber(c.tier.from, 0)}–${c.tier.to == null ? "∞" : formatNumber(c.tier.to, 0)}`
                  : "—";
                const surchargeMul = (1 + route.fuelPct) * (1 + route.bufferPct);
                const surchargeStr = surchargeMul === 1 ? "" : ` × ${formatNumber(surchargeMul, 2)}`;
                const selected = selectedByRow[i] === route.id;
                const itcStr = c.itcUsd > 0
                  ? ` + ${formatMoney({ amount: c.itcUsd, currency: "USD" })} ground`
                  : "";
                return (
                  <Bubble key={route.id} selected={selected} amber={c.itcMissing}>
                    <div style={{ fontSize: 12, color: c.itcMissing ? "#92400E" : "#6B7280", lineHeight: 1.3 }}>
                      {c.itcMissing
                        ? "⚠ inland freight not set"
                        : `${formatNumber(c.applied, 2)} ${route.chargeableUnit} · ${tierLabel} @ ${formatMoney({ amount: c.tier!.rateUsd ?? 0, currency: "USD" })}`}
                    </div>
                    <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.3 }}>
                      ({formatMoney({ amount: route.baseFeeUsd ?? 0, currency: "USD" })} + {formatMoney({ amount: c.tierCostUsd, currency: "USD" })}{itcStr})
                      {surchargeStr} = <strong>{formatMoney(c.transportUsd)}</strong>
                    </div>
                  </Bubble>
                );
              }}
              ROW_H={86}
            />


            {/* ─── CIF (amber output, USD) ─── */}
            <RouteColumnBlock
              title="CIF"
              tag="output"
              currency="USD"
              routes={orderedRoutes}
              rows={calc.rows}
              isOutput
              renderCell={(row, route, i) => {
                const c = row.transports[route.id];
                if (!c.active) {
                  return (
                    <Bubble key={route.id} gray>
                      <div style={{ textAlign: "center" }}>{EM}</div>
                    </Bubble>
                  );
                }
                const selected = selectedByRow[i] === route.id;
                return (
                  <Bubble key={route.id} amber selected={selected}>
                    <div style={{ fontWeight: 600 }}>{formatMoney(c.cifUsd)}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{formatMoney(c.cifUnitUsd)} /u</div>
                  </Bubble>
                );
              }}
            />

            {/* ─── LAC (white, BBD, → BB) ─── */}
            {bbRoutes.length > 0 && (
              <RouteColumnBlock
                title="Local Area Charges"
                tag="new"
                currency="BBD"
                scopeBB
                routes={bbRoutes}
                rows={calc.rows}
                renderCell={(row, route, i) => {
                  const c = row.bbOutputs[route.id];
                  if (!c.active) {
                    return (
                      <Bubble key={route.id} gray>
                        <div style={{ textAlign: "center" }}>{EM}</div>
                        <div style={{ fontSize: 11, fontStyle: "italic", textAlign: "center" }}>{('reason' in c) ? c.reason : ''}</div>
                      </Bubble>
                    );
                  }
                  const selected = selectedByRow[i] === route.id;
                  return (
                    <Bubble key={route.id} selected={selected}>
                      <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.3 }}>
                        {formatMoney({ amount: route.lacFixedBbd, currency: "BBD" })} + {formatNumber(row.spec.totalCbm, 5)} × {formatMoney({ amount: route.lacPerCbmBbd, currency: "BBD" })}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{formatMoney(c.lacBbd)}</div>
                    </Bubble>
                  );
                }}
                ROW_H={68}
              />
            )}

            {/* ─── LDF (amber, BBD, → BB) ─── */}
            {bbRoutes.length > 0 && (
              <RouteColumnBlock
                title="LDF"
                tag="output"
                currency="BBD"
                scopeBB
                isOutput
                routes={bbRoutes}
                rows={calc.rows}
                renderCell={(row, route, i) => {
                  const c = row.bbOutputs[route.id];
                  if (!c.active) {
                    return (
                      <Bubble key={route.id} gray>
                        <div style={{ textAlign: "center" }}>{EM}</div>
                      </Bubble>
                    );
                  }
                  const selected = selectedByRow[i] === route.id;
                  return (
                    <Bubble key={route.id} amber selected={selected}>
                      <div style={{ fontWeight: 600 }}>{formatMoney(c.ldfBbd)}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{formatMoney(c.ldfUnitBbd)} /u</div>
                    </Bubble>
                  );
                }}
              />
            )}

            {/* ─── Duty (white, BBD, → BB) ─── */}
            {bbRoutes.length > 0 && (
              <RouteColumnBlock
                title="Duties Cost"
                tag="new"
                currency="BBD"
                scopeBB
                routes={bbRoutes}
                rows={calc.rows}
                renderCell={(row, route, i) => {
                  const t = row.transports[route.id];
                  const c = row.bbOutputs[route.id];
                  if (!c.active || !t.active) {
                    return (
                      <Bubble key={route.id} gray>
                        <div style={{ textAlign: "center" }}>{EM}</div>
                      </Bubble>
                    );
                  }
                  const selected = selectedByRow[i] === route.id;
                  return (
                    <Bubble key={route.id} selected={selected} amber={dutyUnset}>
                      <div style={{ fontSize: 12, color: dutyUnset ? "#92400E" : "#6B7280", lineHeight: 1.3 }}>
                        {dutyUnset
                          ? "duty rate not set"
                          : `${formatMoney(t.cifUsd)} × ${formatNumber(settings.customsMultiplier, 1)} × ${formatNumber(settings.dvf, 2)} × ${formatNumber(productInput!.dutyRate * 100, 0)}%`}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{formatMoney(c.dutyBbd)}</div>
                    </Bubble>
                  );
                }}
                ROW_H={68}
              />
            )}

            {/* ─── LDP (amber, BBD, → BB) ─── */}
            {bbRoutes.length > 0 && (
              <RouteColumnBlock
                title="LDP"
                tag="output"
                currency="BBD"
                scopeBB
                isOutput
                routes={bbRoutes}
                rows={calc.rows}
                renderCell={(row, route, i) => {
                  const c = row.bbOutputs[route.id];
                  if (!c.active) {
                    return (
                      <Bubble key={route.id} gray>
                        <div style={{ textAlign: "center" }}>{EM}</div>
                      </Bubble>
                    );
                  }
                  const selected = selectedByRow[i] === route.id;
                  return (
                    <Bubble key={route.id} amber selected={selected}>
                      <div style={{ fontWeight: 700 }}>{formatMoney(c.ldpBbd)}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{formatMoney(c.ldpUnitBbd)} /u</div>
                    </Bubble>
                  );
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ───────── Small table cells for the Product Costs sub-table ─────────

const Th = ({ children, align }: { children: React.ReactNode; align?: "right" }) => (
  <th
    style={{
      padding: "2px 8px",
      fontWeight: 700,
      textAlign: align ?? "left",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </th>
);

const Td = ({ children, align, bold }: { children: React.ReactNode; align?: "right"; bold?: boolean }) => (
  <td
    style={{
      padding: "2px 8px",
      textAlign: align ?? "left",
      fontWeight: bold ? 600 : 400,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </td>
);

// ───────── Output column (single-column, e.g. FOB) ─────────

const OutputColumn = ({
  label,
  columns,
  children,
}: {
  label: string;
  columns: { id: string; label: string }[];
  children: React.ReactNode;
}) => (
  <div style={{ padding: "12px 14px", borderRight: BLOCK_BORDER, background: AMBER_BG, flexShrink: 0 }}>
    <BlockHeader title={label} currency="USD" tag="output" />
    <div style={{ display: "flex", gap: BUBBLE_GAP, marginBottom: 4 }}>
      {columns.map((c) => (
        <div key={c.id} style={{ width: BUBBLE_W }}>
          <RouteColumnHeader label={c.label} />
        </div>
      ))}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: BUBBLE_GAP }}>{children}</div>
  </div>
);

// ───────── Route-column block (Transport, CIF, LAC, LDF, Duty, LDP) ─────────

const RouteColumnBlock = ({
  title,
  tag,
  currency,
  scopeBB,
  isOutput,
  routes,
  rows,
  renderCell,
  ROW_H: rowH = ROW_H,
}: {
  title: string;
  tag: "new" | "output";
  currency: "USD" | "BBD";
  scopeBB?: boolean;
  isOutput?: boolean;
  routes: RouteInput[];
  rows: CalcRow[];
  renderCell: (row: CalcRow, route: RouteInput, rowIdx: number) => React.ReactNode;
  ROW_H?: number;
}) => (
  <div
    style={{
      padding: "12px 14px",
      borderRight: BLOCK_BORDER,
      background: isOutput ? AMBER_BG : "#FFFFFF",
      flexShrink: 0,
    }}
  >
    <BlockHeader title={title} currency={currency} tag={tag} scopeBB={scopeBB} />
    <div style={{ display: "flex", gap: BUBBLE_GAP, marginBottom: 4 }}>
      {routes.map((r) => (
        <div key={r.id} style={{ width: BUBBLE_W }}>
          <RouteColumnHeader label={r.code} />
        </div>
      ))}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: BUBBLE_GAP }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: BUBBLE_GAP, minHeight: rowH }}>
          {routes.map((r) => (
            <div key={r.id}>
              {/* delegate to renderCell; it returns a <Bubble/> */}
              {renderCell(row, r, i)}
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);
