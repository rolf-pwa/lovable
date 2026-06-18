import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Send, Loader2, ShieldCheck, Lock, ArrowUpRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { attachExitBeacon, bindGeorgiaSession, trackSessionUpdate } from "@/lib/georgia-session-tracker";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SESSION_START_KEY = "georgia_discovery_started_v1";

function getOrCreateSessionKey(storageKey: string) {
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(storageKey, generated);
  return generated;
}

type Message = { role: "user" | "assistant"; content: string; cta?: { label: string; href: string } };

interface FunctionCall {
  name: string;
  args: Record<string, any>;
}

type Phase = "chat" | "lead_capture" | "complete";

const STORAGE_KEY = "georgia_discovery_state_v2";

function loadSavedState(): { messages: Message[]; phase: Phase; discoveryData?: Record<string, any> } | null {
  try {
    sessionStorage.removeItem("georgia_discovery_state");
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(messages: Message[], phase: Phase, discoveryData: Record<string, any>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, phase, discoveryData }));
  } catch {
    // ignore
  }
}

export default function Discovery() {
  const saved = loadSavedState();
  const welcomeMessage: Message = {
    role: "assistant",
    content: "Hi. I'm Georgia, the ProsperWise AI Transition Assistant.\n\nBefore you share anything: this conversation is completely private. Nothing you tell me is stored or shared unless you choose to take a next step with us. Your data stays in Canada.\n\nTo point you in the right direction — is what's bringing you here today a personal wealth transition (an inheritance, divorce, or sudden liquidity), or a business one (a sale, pre-exit, or founder capital)?"
  };
  const [messages, setMessages] = useState<Message[]>(saved?.messages?.length ? saved.messages : [welcomeMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>(saved?.phase || "chat");
  const [discoveryData, setDiscoveryData] = useState<Record<string, any>>(saved?.discoveryData || {});
  const [leadForm, setLeadForm] = useState({ first_name: "", phone: "", email: "" });
  const [pipedaConsent, setPipedaConsent] = useState(false);
  const [completionCta, setCompletionCta] = useState<{ label: string; href: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    saveState(messages, phase, discoveryData);
  }, [messages, phase, discoveryData]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Refs hold latest funnel state for the exit beacon.
  const messageCountRef = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  const reachedLeadCaptureRef = useRef(false);
  const leadCapturedRef = useRef(false);

  const sessionInsertedRef = useRef(false);
  const sessionKeyRef = useRef<string | null>(null);

  const ensureSessionStarted = async () => {
    if (sessionInsertedRef.current) return;
    sessionInsertedRef.current = true; // optimistic guard against concurrent calls

    const sessionKey = sessionKeyRef.current;
    if (!sessionKey) return;

    if (sessionStorage.getItem(`${SESSION_START_KEY}_inserted`) === "1") return;

    const { error } = await supabase.from("georgia_session_starts").insert({
      session_key: sessionKey,
      source: "discovery",
      landing_path: window.location.pathname,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent || null,
    });
    if (error) {
      console.error("Failed to track Georgia session start", error);
      sessionInsertedRef.current = false; // allow retry on next message
    } else {
      sessionStorage.setItem(`${SESSION_START_KEY}_inserted`, "1");
    }
  };

  useEffect(() => {
    const sessionKey = getOrCreateSessionKey(SESSION_START_KEY);
    sessionKeyRef.current = sessionKey;
    bindGeorgiaSession(sessionKey);

    // If a row already exists for this session (e.g. page refresh mid-chat), don't re-insert.
    if (sessionStorage.getItem(`${SESSION_START_KEY}_inserted`) === "1") {
      sessionInsertedRef.current = true;
    }

    const detach = attachExitBeacon(() => ({
      message_count: messageCountRef.current,
      reached_lead_capture: reachedLeadCaptureRef.current,
      lead_captured: leadCapturedRef.current,
      final_phase: phaseRef.current,
    }));
    return detach;
  }, []);

  // Keep funnel refs in sync and push debounced updates as the chat progresses.
  // Only emit updates after a session row has been inserted (i.e. user engaged).
  useEffect(() => {
    messageCountRef.current = messages.length;
    phaseRef.current = phase;
    if (phase === "lead_capture" || phase === "complete") {
      reachedLeadCaptureRef.current = true;
    }
    if (!sessionInsertedRef.current) return;
    trackSessionUpdate({
      message_count: messages.length,
      reached_lead_capture: reachedLeadCaptureRef.current,
      lead_captured: leadCapturedRef.current,
      final_phase: phase,
    });
  }, [messages.length, phase]);


  async function sendToGeorgia(msgs: Message[], isGreeting = false) {
    setIsLoading(true);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/discovery-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: msgs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect");

      if (data.fallback) {
        const assistantMsg: Message = { role: "assistant", content: data.text || "Georgia is briefly at capacity right now. Please wait a moment and try again." };
        setMessages((prev) => [...prev, assistantMsg]);
        return;
      }

      const assistantMsg: Message = { role: "assistant", content: data.text };
      if (isGreeting) {
        setMessages([assistantMsg]);
      } else {
        setMessages((prev) => [...prev, assistantMsg]);
      }

      if (data.functionCalls?.length > 0) {
        const leadCall = data.functionCalls.find((fc: FunctionCall) => fc.name === "register_discovery_lead");
        if (leadCall) {
          setDiscoveryData(leadCall.args);
          setPhase("lead_capture");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection error");
    } finally {
      setIsLoading(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    // First user message = real Georgia session start.
    await ensureSessionStarted();

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    await sendToGeorgia(newMessages);
  }

  async function submitLead() {
    if (!leadForm.first_name || !leadForm.email) {
      toast.error("Please provide your name and email.");
      return;
    }
    if (!pipedaConsent) {
      toast.error("Please accept the privacy consent to proceed.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/discovery-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "register_lead",
          leadData: {
            ...leadForm,
            ...discoveryData,
            pipeda_consent: true,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");

      const requestedGuide = Boolean(data.requestedGuide && data.guideUrl);
      setCompletionCta(requestedGuide ? { label: "Open complimentary guide", href: data.guideUrl } : null);
      setPhase("complete");
      leadCapturedRef.current = true;
      trackSessionUpdate({ lead_captured: true, reached_lead_capture: true, final_phase: "complete" });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: requestedGuide
            ? "Thank you. I have your details now. Your complimentary guide is ready below whenever you'd like to open it."
            : "Thank you. Your information has been received. Rolf Issler will be in touch within 1–2 business days to schedule your Sovereignty Audit. In the meantime, take a breath — you have taken an important first step toward sovereignty.",
          cta: requestedGuide ? { label: "Open complimentary guide", href: data.guideUrl } : undefined,
        },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#F8F6F2", color: "#3B3F3F" }}>
      {/* Header — Sanctuary tone */}
      <header
        className="flex items-center justify-between px-8 py-5 shrink-0"
        style={{ borderBottom: "1px solid #D3C5B7", backgroundColor: "#F8F6F2" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: "#2A4034", boxShadow: "0 0 0 1px rgba(42,64,52,0.3)" }}
          >
            <span className="font-serif text-lg" style={{ color: "#F8F6F2" }}>
              G
            </span>
          </div>
          <div>
            <h1 className="font-serif text-xl font-semibold" style={{ color: "#2A4034", letterSpacing: "-0.01em" }}>
              Georgia
            </h1>
            <p className="text-[11px] tracking-wide uppercase" style={{ color: "#A98C5A", letterSpacing: "0.08em" }}>
              Transition Assistant · ProsperWise
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-2 rounded-full px-4 py-1.5"
          style={{ border: "1px solid #D3C5B7", backgroundColor: "rgba(42,64,52,0.05)" }}
        >
          <Lock className="h-3 w-3" style={{ color: "#2A4034" }} />
          <span className="text-[11px] font-medium" style={{ color: "#2A4034" }}>
            Secure · PIPEDA · Canada
          </span>
        </div>
      </header>

      {/* Chat Area */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-5 px-6 py-8">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "#2A4034", boxShadow: "0 0 0 1px rgba(42,64,52,0.2)" }}
                  >
                    <span className="font-serif text-sm" style={{ color: "#F8F6F2" }}>
                      G
                    </span>
                  </div>
                )}
                <div
                  className="max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed"
                  style={
                    msg.role === "user"
                      ? {
                          backgroundColor: "#2A4034",
                          color: "#F8F6F2",
                          borderRadius: "18px 4px 18px 18px",
                        }
                      : {
                          backgroundColor: "#FFFFFF",
                          color: "#3B3F3F",
                          border: "1px solid #D3C5B7",
                          borderRadius: "4px 18px 18px 18px",
                          boxShadow: "0 1px 4px rgba(59,63,63,0.06)",
                        }
                  }
                >
                  {msg.role === "assistant" ? (
                    <div
                      className="prose prose-sm max-w-none"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        lineHeight: "1.75",
                        color: "#3B3F3F",
                      }}
                    >
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                      {msg.cta && (
                        <a
                          href={msg.cta.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="not-prose mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                          style={{ backgroundColor: "#2A4034", color: "#F8F6F2" }}
                        >
                          {msg.cta.label}
                          <ArrowUpRight className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3"
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "#2A4034" }}
              >
                <span className="font-serif text-sm" style={{ color: "#F8F6F2" }}>
                  G
                </span>
              </div>
              <div
                className="flex items-center gap-1.5 rounded-2xl px-4 py-3"
                style={{ backgroundColor: "#FFFFFF", border: "1px solid #D3C5B7" }}
              >
                <span
                  className="h-2 w-2 animate-bounce rounded-full [animation-delay:0ms]"
                  style={{ backgroundColor: "#A98C5A" }}
                />
                <span
                  className="h-2 w-2 animate-bounce rounded-full [animation-delay:150ms]"
                  style={{ backgroundColor: "#A98C5A" }}
                />
                <span
                  className="h-2 w-2 animate-bounce rounded-full [animation-delay:300ms]"
                  style={{ backgroundColor: "#A98C5A" }}
                />
              </div>
            </motion.div>
          )}

          {/* Lead Capture Form */}
          {phase === "lead_capture" && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <div
                className="rounded-2xl p-6"
                style={{
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #D3C5B7",
                  boxShadow: "0 2px 12px rgba(59,63,63,0.07)",
                }}
              >
                <div className="mb-1 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" style={{ color: "#2A4034" }} />
                  <h3 className="font-serif text-base font-semibold" style={{ color: "#2A4034" }}>
                    Connect with Rolf
                  </h3>
                </div>
                <p className="mb-5 text-sm" style={{ color: "#6B7070" }}>
                  Provide your details to schedule your Transition Session.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "#3B3F3F" }}>
                      First Name <span style={{ color: "#A98C5A" }}>*</span>
                    </label>
                    <Input
                      value={leadForm.first_name}
                      onChange={(e) => setLeadForm((f) => ({ ...f, first_name: e.target.value }))}
                      placeholder="Your first name"
                      maxLength={100}
                      style={{ borderColor: "#D3C5B7", backgroundColor: "#FDFCFA" }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "#3B3F3F" }}>
                      Phone Number
                    </label>
                    <Input
                      value={leadForm.phone}
                      onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="(555) 555-5555"
                      maxLength={20}
                      style={{ borderColor: "#D3C5B7", backgroundColor: "#FDFCFA" }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "#3B3F3F" }}>
                      Email <span style={{ color: "#A98C5A" }}>*</span>
                    </label>
                    <Input
                      type="email"
                      value={leadForm.email}
                      onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="you@example.com"
                      maxLength={255}
                      style={{ borderColor: "#D3C5B7", backgroundColor: "#FDFCFA" }}
                    />
                  </div>

                  <div
                    className="flex items-start gap-3 rounded-xl p-4"
                    style={{ backgroundColor: "rgba(42,64,52,0.04)", border: "1px solid rgba(42,64,52,0.15)" }}
                  >
                    <Checkbox
                      id="pipeda"
                      checked={pipedaConsent}
                      onCheckedChange={(v) => setPipedaConsent(v === true)}
                      className="mt-0.5 shrink-0"
                    />
                    <label
                      htmlFor="pipeda"
                      className="text-xs leading-relaxed cursor-pointer"
                      style={{ color: "#6B7070" }}
                    >
                      I consent to ProsperWise collecting and processing my personal information in accordance with the{" "}
                      <span className="font-medium" style={{ color: "#2A4034" }}>
                        Personal Information Protection and Electronic Documents Act (PIPEDA)
                      </span>
                      . My data will be processed in Canadian data centres only.
                    </label>
                  </div>

                  <Button
                    onClick={submitLead}
                    disabled={isSubmitting || !leadForm.first_name || !leadForm.email || !pipedaConsent}
                    className="w-full font-semibold tracking-wide"
                    style={{ backgroundColor: "#2A4034", color: "#F8F6F2", border: "none" }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Request Transition Session →"
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {phase === "complete" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
              <div
                className="rounded-2xl p-8 text-center"
                style={{
                  backgroundColor: "#FFFFFF",
                  border: "1px solid rgba(42,64,52,0.25)",
                  boxShadow: "0 2px 16px rgba(42,64,52,0.08)",
                }}
              >
                <div
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(42,64,52,0.08)", border: "1px solid rgba(42,64,52,0.2)" }}
                >
                  <ShieldCheck className="h-7 w-7" style={{ color: "#2A4034" }} />
                </div>
                <p className="font-serif text-lg font-semibold" style={{ color: "#2A4034" }}>
                  {completionCta ? "Complimentary Guide Ready" : "Transition Session Requested"}
                </p>
                <p className="mt-2 text-sm" style={{ color: "#6B7070" }}>
                  {completionCta ? "Your guide is ready below. You can review it now and return whenever you're ready for the next conversation." : "Rolf Issler will reach out within 1–2 business days."}
                </p>
                {completionCta && (
                  <a
                    href={completionCta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mx-auto mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#2A4034", color: "#F8F6F2" }}
                  >
                    {completionCta.label}
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
                {!completionCta && (
                  <a
                    href="https://www.prosperwise.ca/stabilization"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mx-auto mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#2A4034", color: "#F8F6F2" }}
                  >
                    Book Stabilisation Session — $249
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
                <div
                  className="mx-auto mt-4 inline-block rounded-full px-4 py-1"
                  style={{ backgroundColor: "rgba(169,140,90,0.12)", border: "1px solid rgba(169,140,90,0.3)" }}
                >
                  <span className="text-[11px] font-medium tracking-wide uppercase" style={{ color: "#A98C5A" }}>
                    Fee-Only · No Commission · Canada
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      {phase === "chat" && (
        <div className="shrink-0 px-6 py-4" style={{ borderTop: "1px solid #D3C5B7", backgroundColor: "#F8F6F2" }}>
          <div className="mx-auto flex max-w-3xl items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Share what's on your mind..."
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl px-4 py-3 text-sm focus-visible:outline-none"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #D3C5B7",
                color: "#3B3F3F",
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: "0 1px 4px rgba(59,63,63,0.05)",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: "#2A4034" }}
            >
              <Send className="h-4 w-4" style={{ color: "#F8F6F2" }} />
            </button>
          </div>

          <p className="mx-auto mt-3 max-w-3xl text-center text-[10px] tracking-wide" style={{ color: "#A98C5A" }}>
            Protected by PIPEDA · Data processed in Canada · Fee-Only advisory
          </p>
        </div>
      )}
    </div>
  );
}
