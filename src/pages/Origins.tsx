import { SimpleMasterPage, type SimpleColumn } from "@/components/leads/SimpleMasterPage";

interface Origin { id: string; code: string; name: string; notes: string | null }

const cols: SimpleColumn<Origin>[] = [
  { key: "code", label: "Code", uppercase: true, nullable: false, width: "20%" },
  { key: "name", label: "Name", nullable: false, width: "40%" },
  { key: "notes", label: "Notes" },
];

export default function OriginsPage() {
  return (
    <SimpleMasterPage<Origin>
      table="origins"
      title="Origins"
      columns={cols}
      rowLabel={(r) => r.name || r.code}
      newRowDefaults={{ code: "NEW", name: "New origin" }}
    />
  );
}
