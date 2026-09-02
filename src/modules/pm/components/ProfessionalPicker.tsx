import { useEffect, useState } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

interface Professional {
  id: string;
  full_name: string;
  firm: string | null;
}

interface Props {
  excludeIds: string[];
  onSelect: (professionalId: string) => void;
}

export function ProfessionalPicker({ excludeIds, onSelect }: Props) {
  const [pros, setPros] = useState<Professional[]>([]);

  useEffect(() => {
    supabase
      .from("professionals")
      .select("id, full_name, firm")
      .order("full_name")
      .then(({ data }) => setPros(data || []));
  }, []);

  const options = pros.filter((p) => !excludeIds.includes(p.id));

  return (
    <Select value="" onValueChange={onSelect}>
      <SelectTrigger className="h-8 w-[220px]">
        <SelectValue placeholder="Tag a professional…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.full_name}
            {p.firm ? ` (${p.firm})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
