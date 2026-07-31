import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { useAuth } from "@/shared/hooks/useAuth";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

interface ContactLinkerProps {
  contactId: string;
  excludeContactId?: string;
  onLinked: () => void;
  /** Which relationship table to use */
  type: "household" | "family";
  labelPlaceholder?: string;
}

export function ContactLinker({
  contactId,
  excludeContactId,
  onLinked,
  type,
  labelPlaceholder = "Relationship (e.g. Spouse)",
}: ContactLinkerProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [label, setLabel] = useState("");
  const [results, setResults] = useState<{ id: string; first_name: string; last_name: string | null }[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [saving, setSaving] = useState(false);

  const table = type === "household" ? "household_relationships" : "family_relationships";

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
        .neq("id", excludeContactId || contactId)
        .limit(5);
      setResults(data || []);
      setShowResults(true);
    },
    [contactId, excludeContactId]
  );

  useEffect(() => {
    const timer = setTimeout(() => searchContacts(search), 300);
    return () => clearTimeout(timer);
  }, [search, searchContacts]);

  async function linkExisting(target: { id: string; first_name: string; last_name: string | null }) {
    setSaving(true);
    const displayName = `${target.first_name} ${target.last_name || ""}`.trim();
    const { error } = await supabase.from(table).insert({
      contact_id: contactId,
      member_contact_id: target.id,
      relationship_label: label || null,
    });
    if (error) {
      toast.error("Failed to link contact.");
    } else {
      toast.success(`${displayName} linked.`);
      onLinked();
    }
    reset();
  }

  async function createAndLink(name: string) {
    if (!user) return;
    setSaving(true);
    const nameParts = name.split(" ");
    const { data, error: createErr } = await supabase
      .from("contacts")
      .insert({ full_name: name, first_name: nameParts[0] || "", last_name: nameParts.slice(1).join(" ") || "", created_by: user.id } as any)
      .select("id")
      .single();
    if (createErr || !data) {
      toast.error("Failed to create contact.");
      reset();
      return;
    }
    const { error } = await supabase.from(table).insert({
      contact_id: contactId,
      member_contact_id: data.id,
      relationship_label: label || null,
    });
    if (error) {
      toast.error("Failed to link contact.");
    } else {
      toast.success(`${name} created and linked.`);
      onLinked();
    }
    reset();
  }

  function reset() {
    setSearch("");
    setLabel("");
    setShowResults(false);
    setSaving(false);
    setOpen(false);
  }

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
                  onMouseDown={() => linkExisting(c)}
                >
                  {c.first_name} {c.last_name}
                </button>
              ))}
              {search.length >= 2 && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-t px-3 py-2 text-sm text-sanctuary-bronze hover:bg-muted"
                  onMouseDown={() => createAndLink(search)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create "{search}"
                </button>
              )}
            </div>
          )}
        </div>
        <Input
          placeholder={labelPlaceholder}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-32 h-8 text-sm"
          disabled={saving}
        />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={reset}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
