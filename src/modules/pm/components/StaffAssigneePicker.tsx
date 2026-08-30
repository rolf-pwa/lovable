import { useEffect, useState } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

interface StaffProfile {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface Props {
  value: string | null;
  onChange: (userId: string | null) => void;
}

export function StaffAssigneePicker({ value, onChange }: Props) {
  const [staff, setStaff] = useState<StaffProfile[]>([]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .order("full_name")
      .then(({ data }) => setStaff(data || []));
  }, []);

  return (
    <Select value={value ?? "unassigned"} onValueChange={(v) => onChange(v === "unassigned" ? null : v)}>
      <SelectTrigger className="h-8 w-[160px]">
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {staff.map((s) => (
          <SelectItem key={s.user_id} value={s.user_id}>
            {s.full_name || s.email || s.user_id.slice(0, 8)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
