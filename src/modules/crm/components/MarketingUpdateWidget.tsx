import { useState, useEffect } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Megaphone, Plus, Loader2, Trash2, ExternalLink, X, Clock, CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Calendar } from "@/shared/components/ui/calendar";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/shared/lib/utils";

interface MarketingUpdate {
  id: string;
  title: string;
  url: string;
  target_governance_status: string;
  target_contact_ids: string[];
  target_household_ids: string[];
  created_at: string;
  scheduled_at: string | null;
  sent: boolean;
}

interface ContactOption {
  id: string;
  full_name: string;
  household_id: string | null;
}

interface HouseholdOption {
  id: string;
  label: string;
  family_name: string;
}

export function MarketingUpdateWidget() {
  const [updates, setUpdates] = useState<MarketingUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("all");
  const [publishing, setPublishing] = useState(false);

  // Scheduling
  const [sendMode, setSendMode] = useState<"now" | "scheduled">("now");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [scheduledTime, setScheduledTime] = useState("09:00");

  // For specific targeting
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedHouseholdIds, setSelectedHouseholdIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [householdSearch, setHouseholdSearch] = useState("");

  const fetchUpdates = async () => {
    const { data } = await supabase
      .from("marketing_updates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setUpdates(((data as any[]) || []).map((u) => ({
      ...u,
      target_contact_ids: u.target_contact_ids || [],
      target_household_ids: u.target_household_ids || [],
      scheduled_at: u.scheduled_at || null,
      sent: u.sent ?? true,
    })));
    setLoading(false);
  };

  const fetchOptions = async () => {
    const [contactsRes, householdsRes] = await Promise.all([
      supabase.from("contacts").select("id, full_name, household_id").order("full_name"),
      supabase.from("households").select("id, label, family_id").order("label"),
    ]);

    setContacts((contactsRes.data as any[]) || []);

    if (householdsRes.data && householdsRes.data.length > 0) {
      const familyIds = [...new Set((householdsRes.data as any[]).map((h) => h.family_id))];
      const { data: families } = await supabase.from("families").select("id, name").in("id", familyIds);
      const familyMap = new Map((families || []).map((f) => [f.id, f.name]));
      setHouseholds(
        (householdsRes.data as any[]).map((h) => ({
          id: h.id,
          label: h.label,
          family_name: familyMap.get(h.family_id) || "",
        }))
      );
    }
  };

  useEffect(() => { fetchUpdates(); }, []);
  useEffect(() => {
    if (open) fetchOptions();
  }, [open]);

  const handlePublish = async () => {
    if (!title.trim() || !url.trim()) return;
    if (target === "specific_contacts" && selectedContactIds.length === 0) {
      toast.error("Select at least one contact");
      return;
    }
    if (target === "specific_households" && selectedHouseholdIds.length === 0) {
      toast.error("Select at least one household");
      return;
    }

    if (sendMode === "scheduled" && !scheduledDate) {
      toast.error("Please select a date for scheduling");
      return;
    }

    setPublishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let scheduled_at: string | null = null;
      let sent = true;

      if (sendMode === "scheduled" && scheduledDate) {
        const [hours, minutes] = scheduledTime.split(":").map(Number);
        const dt = new Date(scheduledDate);
        dt.setHours(hours, minutes, 0, 0);
        scheduled_at = dt.toISOString();
        sent = false;
      }

      const insertPayload: any = {
        title: title.trim(),
        url: url.trim(),
        target_governance_status: ["all", "sovereign", "core", "stabilization"].includes(target) ? target : "all",
        published_by: user.id,
        target_contact_ids: target === "specific_contacts" ? selectedContactIds : [],
        target_household_ids: target === "specific_households" ? selectedHouseholdIds : [],
        scheduled_at,
        sent,
      };

      const { error } = await supabase.from("marketing_updates").insert(insertPayload as any);
      if (error) throw error;

      // If sending now, trigger notifications immediately
      if (sendMode === "now") {
        await supabase.functions.invoke("notify-portal-request", {
          body: {
            notify_type: "marketing_update",
            title: title.trim(),
            url: url.trim(),
            target_governance_status: insertPayload.target_governance_status,
            target_contact_ids: insertPayload.target_contact_ids,
            target_household_ids: insertPayload.target_household_ids,
          },
        });
        toast.success("Update published & notifications sent");
      } else {
        toast.success(`Update scheduled for ${format(new Date(scheduled_at!), "MMM d, yyyy 'at' h:mm a")}`);
      }

      setTitle("");
      setUrl("");
      setTarget("all");
      setSendMode("now");
      setScheduledDate(undefined);
      setScheduledTime("09:00");
      setSelectedContactIds([]);
      setSelectedHouseholdIds([]);
      setOpen(false);
      fetchUpdates();
    } catch (e: any) {
      toast.error(e.message || "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("marketing_updates").delete().eq("id", id);
    fetchUpdates();
  };

  const TARGET_LABELS: Record<string, string> = {
    all: "All Contacts",
    sovereign: "Sovereign",
    core: "Core",
    stabilization: "Stabilization",
    specific_contacts: "Specific Contacts",
    specific_households: "Specific Households",
  };

  const getUpdateAudienceLabel = (u: MarketingUpdate) => {
    if (u.target_contact_ids?.length > 0) {
      return `${u.target_contact_ids.length} Contact${u.target_contact_ids.length > 1 ? "s" : ""}`;
    }
    if (u.target_household_ids?.length > 0) {
      return `${u.target_household_ids.length} Household${u.target_household_ids.length > 1 ? "s" : ""}`;
    }
    return TARGET_LABELS[u.target_governance_status] || u.target_governance_status;
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleHousehold = (id: string) => {
    setSelectedHouseholdIds((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  };

  const filteredContacts = contacts.filter((c) =>
    c.full_name.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const filteredHouseholds = households.filter((h) =>
    `${h.family_name} ${h.label}`.toLowerCase().includes(householdSearch.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4 text-sanctuary-bronze" />
          Updates
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Plus className="mr-1 h-3 w-3" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publish Update</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q1 Market Commentary" />
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select value={target} onValueChange={(v) => { setTarget(v); setSelectedContactIds([]); setSelectedHouseholdIds([]); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contacts</SelectItem>
                    <SelectItem value="sovereign">Sovereign Only</SelectItem>
                    <SelectItem value="core">Core Only</SelectItem>
                    <SelectItem value="stabilization">Stabilization Only</SelectItem>
                    <SelectItem value="specific_contacts">Specific Contacts</SelectItem>
                    <SelectItem value="specific_households">Specific Households</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {target === "specific_contacts" && (
                <div className="space-y-2">
                  <Label>Select Contacts</Label>
                  {selectedContactIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {selectedContactIds.map((id) => {
                        const c = contacts.find((x) => x.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="text-xs gap-1">
                            {c?.full_name || id}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => toggleContact(id)} />
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground">
                        {selectedContactIds.length > 0 ? `${selectedContactIds.length} selected` : "Choose contacts…"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-2" align="start">
                      <Input
                        placeholder="Search contacts…"
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        className="mb-2 h-8 text-sm"
                      />
                      <ScrollArea className="h-48">
                        {filteredContacts.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded cursor-pointer">
                            <Checkbox
                              checked={selectedContactIds.includes(c.id)}
                              onCheckedChange={() => toggleContact(c.id)}
                            />
                            {c.full_name}
                          </label>
                        ))}
                        {filteredContacts.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2 py-4 text-center">No contacts found</p>
                        )}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {target === "specific_households" && (
                <div className="space-y-2">
                  <Label>Select Households</Label>
                  {selectedHouseholdIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {selectedHouseholdIds.map((id) => {
                        const h = households.find((x) => x.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="text-xs gap-1">
                            {h ? `${h.family_name} – ${h.label}` : id}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => toggleHousehold(id)} />
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground">
                        {selectedHouseholdIds.length > 0 ? `${selectedHouseholdIds.length} selected` : "Choose households…"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-2" align="start">
                      <Input
                        placeholder="Search households…"
                        value={householdSearch}
                        onChange={(e) => setHouseholdSearch(e.target.value)}
                        className="mb-2 h-8 text-sm"
                      />
                      <ScrollArea className="h-48">
                        {filteredHouseholds.map((h) => (
                          <label key={h.id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded cursor-pointer">
                            <Checkbox
                              checked={selectedHouseholdIds.includes(h.id)}
                              onCheckedChange={() => toggleHousehold(h.id)}
                            />
                            <span>{h.family_name} – {h.label}</span>
                          </label>
                        ))}
                        {filteredHouseholds.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2 py-4 text-center">No households found</p>
                        )}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Schedule toggle */}
              <div className="space-y-2">
                <Label>When to Send</Label>
                <Select value={sendMode} onValueChange={(v) => setSendMode(v as "now" | "scheduled")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="now">Send Now</SelectItem>
                    <SelectItem value="scheduled">Schedule for Later</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {sendMode === "scheduled" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !scheduledDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={setScheduledDate}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <Button onClick={handlePublish} disabled={publishing || !title.trim() || !url.trim()} className="w-full">
                {publishing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : sendMode === "scheduled" ? (
                  <Clock className="mr-2 h-4 w-4" />
                ) : (
                  <Megaphone className="mr-2 h-4 w-4" />
                )}
                {sendMode === "scheduled" ? "Schedule Update" : "Publish & Notify"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates published yet.</p>
        ) : (
          <div className="space-y-2">
            {updates.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                <div className="min-w-0 flex-1">
                  <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline flex items-center gap-1">
                    {u.title}
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </a>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {u.scheduled_at && !u.sent ? (
                      <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300">
                        <Clock className="h-2.5 w-2.5" />
                        Scheduled {format(new Date(u.scheduled_at), "MMM d 'at' h:mm a")}
                      </Badge>
                    ) : (
                      <>
                        <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-100">
                          ✓ Sent
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {u.scheduled_at
                            ? format(new Date(u.scheduled_at), "MMM d, yyyy 'at' h:mm a")
                            : format(new Date(u.created_at), "MMM d, yyyy")}
                        </span>
                      </>
                    )}
                    <Badge variant="outline" className="text-[10px]">{getUpdateAudienceLabel(u)}</Badge>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDelete(u.id)}>
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
