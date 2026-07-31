import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { ClipboardCheck } from "lucide-react";

interface Props {
  contactId: string;
}

export function QuarterlySystemReviewButton({ contactId }: Props) {
  const navigate = useNavigate();

  return (
    <Button
      variant="outline"
      onClick={() => navigate(`/quarterly-system-review/contact/${contactId}`)}
    >
      <ClipboardCheck className="mr-2 h-4 w-4" />
      Quarterly Review
    </Button>
  );
}
