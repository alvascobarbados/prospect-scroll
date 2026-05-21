import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { useCalculationRows, type CalcProduct } from "@/hooks/useCalculationRows";

const EM = "\u2014";

interface Row {
  key: string;
  supplierCode: string;
  productName: string;
  variantName: string | null;
  itemNumber: string | null;
  decorationLabel: string;
  qty: number;
  unitCost: number;
  setupCost: number;
  total: number;
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

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function buildRows(products: CalcProduct[]): Row[] {
  const rows: Row[] = [];
  for (const p of products) {
    const decos = (p.product_decorations ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    for (const d of decos) {
      const bands = (d.product_decoration_bands ?? []).slice().sort((a, b) => a.qty - b.qty);
      if (bands.length === 0) continue;
      const label = decorationLabel(d.method_detail?.method?.name ?? null, d.method_detail?.detail ?? null);
      for (const b of bands) {
        const unit = toNum(b.unit_cost);
        const setup = toNum(b.setup_cost);
        const qty = b.qty;
        rows.push({
          key: `${p.id}::${d.id}::${b.id}`,
          supplierCode: p.supplier?.code ?? EM,
          productName: p.name,
          variantName: p.variant_name,
          itemNumber: p.supplier_item_number,
          decorationLabel: label,
          qty,
          unitCost: unit,
          setupCost: setup,
          total: unit * qty + setup,
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
const GROUP_LABEL_COLOR = "#9CA3AF";

function fmtMoney(v: number): string {
  if (!Number.isFinite(v) || v === 0) return EM;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const numCellStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  borderBottom: `0.5px solid ${ROW_BORDER}`,
  whiteSpace: "nowrap",
};

const textCellStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  textAlign: "left",
  borderBottom: `0.5px solid ${ROW_BORDER}`,
  whiteSpace: "nowrap",
};

const headerCellStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: HEADER_COLOR,
  background: HEADER_BG,
  borderBottom: `0.5px solid ${GROUP_BORDER}`,
  fontWeight: 600,
  position: "sticky",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const groupLabelStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: GROUP_LABEL_COLOR,
  background: HEADER_BG,
  borderBottom: `0.5px solid ${GROUP_BORDER}`,
  fontWeight: 600,
  position: "sticky",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const blockDivider = `2px solid ${GROUP_BORDER}`;

// Sticky left columns (identity, 4 cols).
const STICKY_WIDTHS = [70, 220, 130, 120];
const STICKY_OFFSETS = STICKY_WIDTHS.reduce<number[]>((acc, w, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + STICKY_WIDTHS[i - 1]);
  return acc;
}, []);
const IDENTITY_TOTAL_WIDTH = STICKY_WIDTHS.reduce((a, b) => a + b, 0);

function stickyCellStyle(idx: number, isHeader: boolean, bg: string, top?: number): React.CSSProperties {
  return {
    position: "sticky",
    left: STICKY_OFFSETS[idx],
    width: STICKY_WIDTHS[idx],
    minWidth: STICKY_WIDTHS[idx],
    maxWidth: STICKY_WIDTHS[idx],
    background: bg,
    top: isHeader ? top : undefined,
    zIndex: isHeader ? 4 : 1,
  };
}

export function CalculationsPage() {
  const navigate = useNavigate();
  const { products, error } = useCalculationRows();
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

  // Group label row: spans columns. Identity = sticky across 4 cols (single th colSpan=4 sticky left:0 width=sum).
  // For simplicity, use two rows of headers: top row = group labels, bottom row = column headers. Both sticky.
  const GROUP_LABEL_HEIGHT = 26;
  const COL_HEADER_TOP = GROUP_LABEL_HEIGHT;

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
          Block 1 of N — Identity + Product Cost. No landed cost yet.
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
              {/* Group label row */}
              <tr style={{ height: GROUP_LABEL_HEIGHT }}>
                <th
                  colSpan={4}
                  style={{
                    ...groupLabelStyle,
                    position: "sticky",
                    top: 0,
                    left: 0,
                    width: IDENTITY_TOTAL_WIDTH,
                    minWidth: IDENTITY_TOTAL_WIDTH,
                    zIndex: 5,
                  }}
                >
                  Identity
                </th>
                <th
                  colSpan={5}
                  style={{
                    ...groupLabelStyle,
                    top: 0,
                    zIndex: 3,
                    borderLeft: blockDivider,
                  }}
                >
                  Product Cost
                </th>
              </tr>
              {/* Column header row */}
              <tr>
                <th style={{ ...headerCellStyle, ...stickyCellStyle(0, true, HEADER_BG, COL_HEADER_TOP) }}>Supplier</th>
                <th style={{ ...headerCellStyle, ...stickyCellStyle(1, true, HEADER_BG, COL_HEADER_TOP) }}>Item Name</th>
                <th style={{ ...headerCellStyle, ...stickyCellStyle(2, true, HEADER_BG, COL_HEADER_TOP) }}>Variant</th>
                <th style={{ ...headerCellStyle, ...stickyCellStyle(3, true, HEADER_BG, COL_HEADER_TOP) }}>Item #</th>
                <th style={{ ...headerCellStyle, top: COL_HEADER_TOP, zIndex: 2, borderLeft: blockDivider }}>Decoration</th>
                <th style={{ ...headerCellStyle, top: COL_HEADER_TOP, zIndex: 2, textAlign: "right" }}>Qty</th>
                <th style={{ ...headerCellStyle, top: COL_HEADER_TOP, zIndex: 2, textAlign: "right" }}>Price</th>
                <th style={{ ...headerCellStyle, top: COL_HEADER_TOP, zIndex: 2, textAlign: "right" }}>Setup</th>
                <th style={{ ...headerCellStyle, top: COL_HEADER_TOP, zIndex: 2, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bg = hoverKey === r.key ? HOVER_BG : "#fff";
                return (
                  <tr
                    key={r.key}
                    onMouseEnter={() => setHoverKey(r.key)}
                    onMouseLeave={() => setHoverKey(null)}
                    style={{ height: 32 }}
                  >
                    <td style={{ ...textCellStyle, ...stickyCellStyle(0, false, bg) }}>{r.supplierCode}</td>
                    <td
                      style={{ ...textCellStyle, ...stickyCellStyle(1, false, bg), overflow: "hidden", textOverflow: "ellipsis" }}
                      title={r.productName}
                    >
                      {r.productName}
                    </td>
                    <td
                      style={{ ...textCellStyle, ...stickyCellStyle(2, false, bg), overflow: "hidden", textOverflow: "ellipsis" }}
                      title={r.variantName ?? ""}
                    >
                      {r.variantName ?? EM}
                    </td>
                    <td style={{ ...textCellStyle, ...stickyCellStyle(3, false, bg) }}>{r.itemNumber ?? EM}</td>
                    <td
                      style={{ ...textCellStyle, borderLeft: blockDivider, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}
                      title={r.decorationLabel}
                    >
                      {r.decorationLabel}
                    </td>
                    <td style={{ ...numCellStyle }}>{r.qty.toLocaleString()}</td>
                    <td style={{ ...numCellStyle }}>{fmtMoney(r.unitCost)}</td>
                    <td style={{ ...numCellStyle }}>{fmtMoney(r.setupCost)}</td>
                    <td style={{ ...numCellStyle, fontWeight: 600 }}>{fmtMoney(r.total)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && products !== null && (
                <tr>
                  <td colSpan={9} style={{ padding: 24, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>
                    No rows.
                  </td>
                </tr>
              )}
              {products === null && (
                <tr>
                  <td colSpan={9} style={{ padding: 24, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>
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
