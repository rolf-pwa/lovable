import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { ClipboardCheck } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface Props {
  contactId: string;
  className?: string;
}

export function QuarterlySystemReviewButton({ contactId, className }: Props) {
  const navigate = useNavigate();

  return (
    <Button
      variant="outline"
      className={cn(className)}
      onClick={() => navigate(`/quarterly-system-review/contact/${contactId}`)}
    >
      <ClipboardCheck className="mr-2 h-4 w-4" />
      Quarterly Review
    </Button>
  );
}
