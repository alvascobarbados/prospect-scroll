import { SimpleMasterPage, type SimpleColumn } from "@/components/leads/SimpleMasterPage";

interface Destination { id: string; code: string; name: string; notes: string | null }

const cols: SimpleColumn<Destination>[] = [
  { key: "code", label: "Code", uppercase: true, nullable: false, width: "20%" },
  { key: "name", label: "Name", nullable: false, width: "40%" },
  { key: "notes", label: "Notes" },
];

export default function DestinationsPage() {
  return (
    <SimpleMasterPage<Destination>
      table="destinations"
      title="Destinations"
      columns={cols}
      rowLabel={(r) => r.name || r.code}
      newRowDefaults={{ code: "NEW", name: "New destination" }}
    />
  );
}
