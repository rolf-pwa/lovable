import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { ScrollText } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface Props {
  householdId: string;
  className?: string;
}

/** Entry point for the Quarterly Governance Audit, matching StabilizationMapButton's placement convention on the household's AI Workbench card. */
export function GovernanceAuditButton({ householdId, className }: Props) {
  const navigate = useNavigate();

  return (
    <Button
      variant="outline"
      className={cn(className)}
      onClick={() => navigate(`/governance-audit/household/${householdId}`)}
    >
      <ScrollText className="mr-2 h-4 w-4" />
      Governance Audit
    </Button>
  );
}
