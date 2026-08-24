import { useNavigate } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

interface Props {
  contactId: string;
  className?: string;
}

export function SovereigntyCharterButton({ contactId, className }: Props) {
  const navigate = useNavigate();

  return (
    <Button
      variant="outline"
      className={cn(className)}
      onClick={() => navigate(`/sovereignty-charter/contact/${contactId}`)}
    >
      <ScrollText className="mr-2 h-4 w-4" />
      Sovereignty Charter
    </Button>
  );
}