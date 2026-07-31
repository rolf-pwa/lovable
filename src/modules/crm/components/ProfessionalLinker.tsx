import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Plus, Search, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/shared/hooks/useAuth";

const ROLES = [
  { value: "lawyer", label: "Lawyer", nameCol: "lawyer_name", firmCol: "lawyer_firm" },
  { value: "accountant", label: "Accountant", nameCol: "accountant_name", firmCol: "accountant_firm" },
  { value: "executor", label: "Executor", nameCol: "executor_name", firmCol: "executor_firm" },
  { value: "poa", label: "Power of Attorney", nameCol: "poa_name", firmCol: "poa_firm" },
];

interface ProfessionalLinkerProps {
  contactId: string;
  contact: any;
  onLinked: () => void;
}

export function ProfessionalLinker({ contactId, contact, onLinked }: ProfessionalLinkerProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [firm, setFirm] = useState("");
  const [results, setResults] = useState<{ id: string; first_name: string; last_name: string | null }[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filter out roles that already have a name assigned
  const availableRoles = ROLES.filter((r) => !contact[r.nameCol]);

  const searchContacts = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setResults([]);
        return;
      }
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .neq("id", contactId)
        .limit(5);
      setResults(data || []);
      setShowResults(true);
    },
    [contactId]
  );

  useEffect(() => {
    const timer = setTimeout(() => searchContacts(search), 300);
    return () => clearTimeout(timer);
  }, [search, searchContacts]);

  async function assignProfessional(name: string) {
    if (!role) {
      toast.error("Please select a role first.");
      return;
    }
    const selected = ROLES.find((r) => r.value === role);
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from("contacts")
      .update({
        [selected.nameCol]: name,
        [selected.firmCol]: firm || null,
      })
      .eq("id", contactId);
    if (error) {
      toast.error("Failed to assign professional.");
    } else {
      toast.success(`${selected.label} assigned.`);
      onLinked();
    }
    reset();
  }

  async function createAndAssign(name: string) {
    if (!user) return;
    if (!role) {
      toast.error("Please select a role first.");
      return;
    }
    // Create the contact first
    await supabase
      .from("contacts")
      .insert({ full_name: name, first_name: name.split(" ")[0] || "", last_name: name.split(" ").slice(1).join(" ") || "", created_by: user.id } as any);
    // Then assign
    await assignProfessional(name);
  }

  function reset() {
    setSearch("");
    setFirm("");
    setRole("");
    setShowResults(false);
    setSaving(false);
    setOpen(false);
  }

  if (availableRoles.length === 0 && !open) return null;

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-2 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3 w-3 mr-1" /> Add
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select role..." />
        </SelectTrigger>
        <SelectContent>
          {availableRoles.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => search.length >= 2 && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            className="pl-8 h-8 text-sm"
            disabled={saving}
            autoFocus
          />
          {showResults && (
            <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-muted"
                   onMouseDown={() => assignProfessional(`${c.first_name} ${c.last_name || ""}`.trim())}
                 >
                   {c.first_name} {c.last_name}
                </button>
              ))}
              {search.length >= 2 && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-t px-3 py-2 text-sm text-sanctuary-bronze hover:bg-muted"
                  onMouseDown={() => createAndAssign(search)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create "{search}"
                </button>
              )}
            </div>
          )}
        </div>
        <Input
          placeholder="Firm (optional)"
          value={firm}
          onChange={(e) => setFirm(e.target.value)}
          className="w-28 h-8 text-sm"
          disabled={saving}
        />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={reset}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
