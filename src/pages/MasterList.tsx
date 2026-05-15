import { useSearchParams } from "react-router-dom";
import { MasterListPage } from "@/components/leads/MasterListPage";
import { TeamListPage } from "@/components/leads/TeamListPage";
import { TeamMemberPage } from "@/components/leads/TeamMemberPage";
import { CustomerListPage } from "@/components/leads/CustomerListPage";
import { CustomerDetailPage } from "@/components/leads/CustomerDetailPage";
import { SupplierListPage } from "@/components/leads/SupplierListPage";
import type { EntityKind } from "@/hooks/useMasterData";

export const MasterList = ({ kind }: { kind: EntityKind }) => {
  const [params] = useSearchParams();
  if (kind === "team") {
    const memberId = params.get("team_member");
    if (memberId) return <TeamMemberPage memberId={memberId} />;
    return <TeamListPage />;
  }
  if (kind === "customer") {
    const customerId = params.get("customer");
    if (customerId) return <CustomerDetailPage customerId={customerId} />;
    return <CustomerListPage />;
  }
  if (kind === "supplier") return <SupplierListPage />;
  return <MasterListPage kind={kind} />;
};
export default MasterList;
