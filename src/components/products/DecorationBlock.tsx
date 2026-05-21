import { formatPrice } from "./helpers/formatPrice";
import type { ProductDecoration } from "./helpers/buildProductsList";

interface DecorationBlockProps {
  decoration: ProductDecoration | null; // null → empty placeholder slot
}

function methodLabel(deco: ProductDecoration): string {
  const md = deco.method_detail;
  if (!md) return "Decoration";
  const methodName = md.method?.name ?? "";
  const detail = md.detail ?? "";
  return [methodName, detail].filter(Boolean).join(" — ") || "Decoration";
}

export function DecorationBlock({ decoration }: DecorationBlockProps) {
  if (!decoration) {
    return (
      <div
        style={{
          paddingLeft: 10,
          paddingTop: 2,
          borderLeft: "0.5px dashed #E5E7EB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>
          + Add decoration
        </span>
      </div>
    );
  }

  const bands = [...decoration.product_decoration_bands].sort((a, b) => a.qty - b.qty);

  return (
    <div
      style={{
        paddingLeft: 10,
        paddingTop: 2,
        borderLeft: "0.5px solid #F1F2F4",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "#0E2849",
          lineHeight: 1.3,
          minHeight: 32,
          marginBottom: 5,
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        {methodLabel(decoration)}
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <thead>
          <tr>
            <th style={headerCellStyle("left")}>Qty</th>
            <th style={headerCellStyle("right")}>Unit $</th>
            <th style={headerCellStyle("right")}>Setup $</th>
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => (
            <tr key={b.id}>
              <td style={{ ...bodyCellStyle("left"), fontWeight: 500 }}>{b.qty}</td>
              <td style={bodyCellStyle("right")}>{formatPrice(b.unit_cost)}</td>
              <td style={bodyCellStyle("right")}>{formatPrice(b.setup_cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function headerCellStyle(align: "left" | "right"): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 500,
    color: "#6B7280",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    padding: "2px 4px 5px",
    textAlign: align,
    borderBottom: "0.5px solid #E5E7EB",
  };
}

function bodyCellStyle(align: "left" | "right"): React.CSSProperties {
  return {
    padding: 4,
    textAlign: align,
    color: "#0E2849",
  };
}
