import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import { Loader2, Terminal, ArrowUp } from "lucide-react";
import { supabase } from "@/shared/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

interface CommandMessage {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLE_COMMANDS = [
  "Show all leads from this week",
  "Which families are in the Legacy Tier?",
  "List all contacts in stabilization",
  "Who has a Quiet Period ending soon?",
];

export function StaffCommandBar() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CommandMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [crmContext, setCrmContext] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch live CRM data on mount for AI context
  useEffect(() => {
    async function fetchCrmContext() {
      const [familiesRes, contactsRes, leadsRes, reviewRes] = await Promise.all([
        supabase.from("families").select("id, name, fee_tier, total_family_assets, annual_savings, fee_tier_discount_pct").limit(100),
        supabase.from("contacts").select("id, full_name, first_name, last_name, email, phone, family_id, household_id, governance_status, fiduciary_entity, family_role, quiet_period_start_date, asana_url").limit(200),
        supabase.from("discovery_leads").select("id, first_name, email, sovereignty_status, transition_type, anxiety_anchor, created_at, pipeda_consent").limit(100),
        supabase.from("review_queue").select("id, action_type, action_description, status, client_visible, created_at").eq("status", "pending").limit(50),
      ]);

      const families = familiesRes.data || [];
      const contacts = contactsRes.data || [];
      const leads = leadsRes.data || [];
      const pending = reviewRes.data || [];

      const ctx = [
        `## Live CRM Data (${new Date().toISOString().split("T")[0]})`,
        "",
        `### Families (${families.length})`,
        ...families.map(f => `- **${f.name}** | Tier: ${f.fee_tier} | Assets: $${Number(f.total_family_assets).toLocaleString()} | Savings: $${Number(f.annual_savings).toLocaleString()} | ID: ${f.id}`),
        "",
        `### Contacts (${contacts.length})`,
        ...contacts.map(c => {
          const qp = c.quiet_period_start_date ? ` | Quiet Period: ${c.quiet_period_start_date}` : "";
          return `- **${c.full_name}** | ${c.governance_status} | ${c.fiduciary_entity} | Role: ${c.family_role}${qp} | Family: ${c.family_id || "none"} | ID: ${c.id}`;
        }),
        "",
        `### Discovery Leads (${leads.length})`,
        ...leads.map(l => `- **${l.first_name}** | Status: ${l.sovereignty_status} | Type: ${l.transition_type || "N/A"} | Created: ${l.created_at?.split("T")[0]} | PIPEDA: ${l.pipeda_consent ? "Yes" : "No"}`),
        "",
        `### Pending Review Queue (${pending.length})`,
        ...pending.map(r => `- ${r.action_type}: ${r.action_description} | Visible: ${r.client_visible} | Created: ${r.created_at?.split("T")[0]}`),
      ].join("\n");

      setCrmContext(ctx);
    }
    fetchCrmContext();
  }, []);

  const sendCommand = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: CommandMessage = { role: "user", content: trimmed };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("vertex-ai", {
        body: {
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
          systemPrompt: `You are **Georgia**, the ProsperWise Sovereign Command Assistant. You have LIVE access to the CRM database and can answer questions with real data.

## Your Capabilities
- Query and filter contacts, families, households, and discovery leads using the live data below
- Summarize governance statuses, fee tiers, and family financials
- Identify Quiet Period deadlines (90 days from quiet_period_start_date)
- Report on pending Review Queue items
- Guide advisors on Asana project creation steps (navigate to the contact record → click the Asana link or use Lead Conversion)
- Provide clear, concise, data-backed responses

## Rules
- ALWAYS use the live data provided below to answer questions — do NOT make up data
- If a family or contact doesn't exist in the data, say so clearly
- Be confident, concise, and advisory in tone
- Keep responses under 200 words unless detailed data is requested
- Format financial figures with $ and commas
- For Asana project creation: explain that this is done through the Lead Conversion workflow or by linking an Asana project URL on the contact record

${crmContext}`,
        },
      });

      if (error) throw error;
      const reply = data?.text ?? data?.content ?? data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "I couldn't process that request.";
      setMessages([...updated, { role: "assistant", content: reply }]);
    } catch {
      setMessages([
        ...updated,
        { role: "assistant", content: "Command failed. Please try again or check your connection." },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCommand(input);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-foreground">Command Bar</span>
          <Badge variant="outline" className="text-[10px] ml-auto">AI</Badge>
        </div>

        {/* Message history */}
        {messages.length > 0 && (
          <div className="space-y-2 max-h-52 overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={`inline-block rounded-lg px-3 py-1.5 text-sm max-w-[90%] ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none text-foreground text-sm">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="text-left">
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Thinking…</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Example prompts (only shown when no history) */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_COMMANDS.map((cmd) => (
              <button
                key={cmd}
                onClick={() => sendCommand(cmd)}
                className="rounded-md border border-border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {cmd}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command… (Enter to send)"
            rows={1}
            className="resize-none text-sm min-h-[38px] max-h-24"
          />
          <Button
            size="icon"
            onClick={() => sendCommand(input)}
            disabled={!input.trim() || loading}
            className="shrink-0 h-9 w-9 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}