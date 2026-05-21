/**
 * Rotated supplier spine — 26px navy strip on the left of a card or
 * group body. Reads bottom-to-top in uppercase white Raleway.
 */
interface SupplierSpineProps {
  supplierName: string;
}

export function SupplierSpine({ supplierName }: SupplierSpineProps) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 26,
        background: "#0E2849",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
      }}
    >
      <span
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          fontSize: 11,
          color: "#FFFFFF",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {supplierName}
      </span>
    </div>
  );
}
