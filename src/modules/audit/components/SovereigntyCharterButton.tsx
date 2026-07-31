import { useNavigate } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

interface Props {
  contactId: string;
}

export function SovereigntyCharterButton({ contactId }: Props) {
  const navigate = useNavigate();

  return (
    <Button variant="outline" onClick={() => navigate(`/sovereignty-charter/contact/${contactId}`)}>
      <ScrollText className="mr-2 h-4 w-4" />
      Sovereignty Charter
    </Button>
  );
}