import { SimpleMasterPage, type SimpleColumn } from "@/components/leads/SimpleMasterPage";

interface ShippingMethod { id: string; code: string; name: string; notes: string | null }

const cols: SimpleColumn<ShippingMethod>[] = [
  { key: "code", label: "Code", uppercase: true, nullable: false, width: "20%" },
  { key: "name", label: "Name", nullable: false, width: "40%" },
  { key: "notes", label: "Notes" },
];

export default function ShippingMethodsPage() {
  return (
    <SimpleMasterPage<ShippingMethod>
      table="shipping_methods"
      title="Shipping Methods"
      columns={cols}
      rowLabel={(r) => r.name || r.code}
      newRowDefaults={{ code: "NEW", name: "New shipping method" }}
    />
  );
}
