import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { useSupplierProductData } from "@/hooks/useSupplierProductData";
import { formatLeadTime } from "@/components/products/helpers/formatLeadTime";
import type { Product } from "@/components/products/helpers/buildSupplierProductDataList";

const EM = "\u2014";

interface Row {
  key: string;
  supplierCode: string;
  productName: string;
  variantName: string | null;
  itemNumber: string | null;
  decorationLabel: string;
  qty: number;
  unitCost: number | string;
  setupCost: number | string;
  pack: number | null;
  dims: { l: number | null; w: number | null; h: number | null; unit: string };
  weight: { value: number | null; unit: string };
  leadTime: string;
  moq: number | null;
  updated: string;
  origin: string | null;
  category: string | null;
}

function decorationLabel(method: string | null, detail: string | null): string {
  const m = (method ?? "").trim();
  const d = (detail ?? "").trim();
  if (!m && !d) return EM;
  if (!m) return d;
  if (!d) return m;
  if (m.toLowerCase() === d.toLowerCase()) return m;
  return `${m} ${d}`;
}

function buildRows(products: Product[]): Row[] {
  const rows: Row[] = [];
  for (const p of products) {
    const unitSystem = p.supplier?.unit_system ?? "metric";
    const linUnit = unitSystem === "imperial" ? "in" : "cm";
    const wtUnit = unitSystem === "imperial" ? "lbs" : "kg";
    const decos = (p.product_decorations ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    for (const d of decos) {
      const bands = (d.product_decoration_bands ?? [])
        .slice()
        .sort((a, b) => a.qty - b.qty);
      if (bands.length === 0) continue;
      const label = decorationLabel(
        d.method_detail?.method?.name ?? null,
        d.method_detail?.detail ?? null,
      );
      for (const b of bands) {
        rows.push({
          key: `${p.id}::${d.id}::${b.id}`,
          supplierCode: p.supplier?.code ?? EM,
          productName: p.name,
          variantName: p.variant_name,
          itemNumber: p.supplier_item_number,
          decorationLabel: label,
          qty: b.qty,
          unitCost: b.unit_cost,
          setupCost: b.setup_cost,
          pack: p.carton_pack,
          dims: { l: p.carton_length, w: p.carton_width, h: p.carton_height, unit: linUnit },
          weight: { value: p.carton_weight, unit: wtUnit },
          leadTime: formatLeadTime(p.production_days_min, p.production_days_max),
          moq: (p as Product & { moq?: number | null }).moq ?? null,
          updated: formatDistanceToNowStrict(new Date(p.updated_at), { addSuffix: false }) + " ago",
          origin: p.origin?.name ?? null,
          category: p.subcategory?.name ?? null,
        });
      }
    }
  }
  return rows;
}

const HEADER_BG = "#F9FAFB";
const HEADER_COLOR = "#6B7280";
const ROW_BORDER = "#F1F2F4";
const GROUP_BORDER = "#E5E7EB";
const HOVER_BG = "#FAFBFC";

function fmtNum(v: number | string | null | undefined, decimals?: number): string {
  if (v == null || v === "") return EM;
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return EM;
  return decimals != null ? n.toFixed(decimals) : String(n);
}

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null || v === "") return EM;
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return EM;
  return n.toFixed(2);
}

const numCellStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 12,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  borderBottom: `0.5px solid ${ROW_BORDER}`,
  whiteSpace: "nowrap",
};

const textCellStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 12,
  textAlign: "left",
  borderBottom: `0.5px solid ${ROW_BORDER}`,
  whiteSpace: "nowrap",
};

const headerCellStyle: React.CSSProperties = {
  padding: "8px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: HEADER_COLOR,
  background: HEADER_BG,
  borderBottom: `0.5px solid ${GROUP_BORDER}`,
  fontWeight: 600,
  position: "sticky",
  top: 0,
  zIndex: 2,
  textAlign: "left",
  whiteSpace: "nowrap",
};

const groupDividerLeft: React.CSSProperties = { borderLeft: `1.5px solid ${GROUP_BORDER}` };

// Sticky left columns (identity, 6 cols). Widths chosen for compact density.
const STICKY_WIDTHS = [72, 200, 140, 110, 220, 60]; // sum = 802
const STICKY_OFFSETS = STICKY_WIDTHS.reduce<number[]>((acc, w, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + STICKY_WIDTHS[i - 1]);
  return acc;
}, []);

function stickyCellStyle(idx: number, isHeader: boolean, bg: string): React.CSSProperties {
  return {
    position: "sticky",
    left: STICKY_OFFSETS[idx],
    width: STICKY_WIDTHS[idx],
    minWidth: STICKY_WIDTHS[idx],
    maxWidth: STICKY_WIDTHS[idx],
    background: bg,
    zIndex: isHeader ? 3 : 1,
  };
}

const unitSuffixStyle: React.CSSProperties = {
  fontSize: 11,
  color: HEADER_COLOR,
  marginLeft: 4,
};

export function CalculationsPage() {
  const navigate = useNavigate();
  const { products, error } = useSupplierProductData();
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string>("__all__");

  useEffect(() => {
    const prev = document.title;
    document.title = "Calculations";
    return () => {
      document.title = prev;
    };
  }, []);

  const allRows = useMemo(() => (products ? buildRows(products) : []), [products]);
  const suppliers = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) if (r.supplierCode && r.supplierCode !== EM) set.add(r.supplierCode);
    return Array.from(set).sort();
  }, [allRows]);
  const rows = useMemo(
    () => (supplierFilter === "__all__" ? allRows : allRows.filter((r) => r.supplierCode === supplierFilter)),
    [allRows, supplierFilter],
  );

  return (
    <DesktopAppShell>
      <div style={{ padding: "32px 32px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
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
            Calculations
          </h1>
        </div>
        <div style={{ fontStyle: "italic", color: "#6B7280", fontSize: 12, marginBottom: 20, marginLeft: 44 }}>
          Block 1 of N. Raw product data only — no calculations yet.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "#6B7280" }}>Supplier:</label>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 6,
              border: "0.5px solid hsl(var(--border))",
              background: "#fff",
              minWidth: 140,
            }}
          >
            <option value="__all__">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#6B7280" }}>
            {rows.length} row{rows.length === 1 ? "" : "s"}
          </span>
        </div>

        {error && (
          <div style={{ color: "hsl(var(--destructive))", marginBottom: 16, fontSize: 13 }}>
            Failed to load: {error}
          </div>
        )}

        <div
          style={{
            overflow: "auto",
            maxHeight: "calc(100vh - 220px)",
            border: `0.5px solid ${GROUP_BORDER}`,
            borderRadius: 6,
            background: "#fff",
          }}
        >
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "max-content", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, ...stickyCellStyle(0, true, HEADER_BG) }}>Supplier</th>
                <th style={{ ...headerCellStyle, ...stickyCellStyle(1, true, HEADER_BG) }}>Product</th>
                <th style={{ ...headerCellStyle, ...stickyCellStyle(2, true, HEADER_BG) }}>Variant</th>
                <th style={{ ...headerCellStyle, ...stickyCellStyle(3, true, HEADER_BG) }}>Item #</th>
                <th style={{ ...headerCellStyle, ...stickyCellStyle(4, true, HEADER_BG) }}>Decoration</th>
                <th style={{ ...headerCellStyle, ...stickyCellStyle(5, true, HEADER_BG), textAlign: "right" }}>Qty</th>
                <th style={{ ...headerCellStyle, textAlign: "right", ...groupDividerLeft }}>Unit USD</th>
                <th style={{ ...headerCellStyle, textAlign: "right" }}>Setup USD</th>
                <th style={{ ...headerCellStyle, textAlign: "right", ...groupDividerLeft }}>Pack</th>
                <th style={{ ...headerCellStyle, textAlign: "right" }}>L×W×H</th>
                <th style={{ ...headerCellStyle, textAlign: "right" }}>Wt/ctn</th>
                <th style={{ ...headerCellStyle }}>Lead time</th>
                <th style={{ ...headerCellStyle, textAlign: "right" }}>MOQ</th>
                <th style={{ ...headerCellStyle, ...groupDividerLeft }}>Updated</th>
                <th style={{ ...headerCellStyle }}>Origin</th>
                <th style={{ ...headerCellStyle }}>Category</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bg = hoverKey === r.key ? HOVER_BG : "#fff";
                const dims =
                  r.dims.l == null && r.dims.w == null && r.dims.h == null
                    ? null
                    : `${fmtNum(r.dims.l)}×${fmtNum(r.dims.w)}×${fmtNum(r.dims.h)}`;
                return (
                  <tr
                    key={r.key}
                    onMouseEnter={() => setHoverKey(r.key)}
                    onMouseLeave={() => setHoverKey(null)}
                    style={{ height: 32 }}
                  >
                    <td style={{ ...textCellStyle, ...stickyCellStyle(0, false, bg) }}>{r.supplierCode}</td>
                    <td style={{ ...textCellStyle, ...stickyCellStyle(1, false, bg), overflow: "hidden", textOverflow: "ellipsis" }} title={r.productName}>{r.productName}</td>
                    <td style={{ ...textCellStyle, ...stickyCellStyle(2, false, bg), overflow: "hidden", textOverflow: "ellipsis" }} title={r.variantName ?? ""}>{r.variantName ?? EM}</td>
                    <td style={{ ...textCellStyle, ...stickyCellStyle(3, false, bg) }}>{r.itemNumber ?? EM}</td>
                    <td style={{ ...textCellStyle, ...stickyCellStyle(4, false, bg), overflow: "hidden", textOverflow: "ellipsis" }} title={r.decorationLabel}>{r.decorationLabel}</td>
                    <td style={{ ...numCellStyle, ...stickyCellStyle(5, false, bg) }}>{fmtNum(r.qty)}</td>
                    <td style={{ ...numCellStyle, ...groupDividerLeft }}>{fmtMoney(r.unitCost)}</td>
                    <td style={{ ...numCellStyle }}>{fmtMoney(r.setupCost)}</td>
                    <td style={{ ...numCellStyle, ...groupDividerLeft }}>{r.pack == null ? EM : fmtNum(r.pack)}</td>
                    <td style={{ ...numCellStyle }}>
                      {dims == null ? EM : (
                        <>
                          {dims}
                          <span style={unitSuffixStyle}>{r.dims.unit}</span>
                        </>
                      )}
                    </td>
                    <td style={{ ...numCellStyle }}>
                      {r.weight.value == null ? EM : (
                        <>
                          {fmtNum(r.weight.value)}
                          <span style={unitSuffixStyle}>{r.weight.unit}</span>
                        </>
                      )}
                    </td>
                    <td style={{ ...textCellStyle }}>{r.leadTime}</td>
                    <td style={{ ...numCellStyle }}>{r.moq == null ? EM : fmtNum(r.moq)}</td>
                    <td style={{ ...textCellStyle, ...groupDividerLeft }}>{r.updated}</td>
                    <td style={{ ...textCellStyle }}>{r.origin ?? EM}</td>
                    <td style={{ ...textCellStyle }}>{r.category ?? EM}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && products !== null && (
                <tr>
                  <td colSpan={16} style={{ padding: 24, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>
                    No rows.
                  </td>
                </tr>
              )}
              {products === null && (
                <tr>
                  <td colSpan={16} style={{ padding: 24, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DesktopAppShell>
  );
}
