import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";
import { askBrain, BrainCitation } from "@/shared/lib/brain";
import { CitationList } from "@/shared/components/CitationList";

interface Turn {
  question: string;
  answer: string;
  citations: BrainCitation[];
}

export function BrainAsk({ initialQuestion }: { initialQuestion?: string }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const autoAskedRef = useRef(false);

  const askMutation = useMutation({
    mutationFn: (q: string) => askBrain(q),
    onSuccess: (data, q) => {
      setTurns((prev) => [{ question: q, answer: data.text, citations: data.citations }, ...prev]);
      setQuestion("");
    },
    onError: (e: any) => toast.error(e.message || "Could not reach the brain"),
  });

  const submit = (raw?: string) => {
    const q = (raw ?? question).trim();
    if (!q || askMutation.isPending) return;
    askMutation.mutate(q);
  };

  useEffect(() => {
    if (initialQuestion && !autoAskedRef.current) {
      autoAskedRef.current = true;
      submit(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Ask the Second Brain…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <Button onClick={submit} disabled={!question.trim() || askMutation.isPending}>
          {askMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Ask
        </Button>
      </div>

      <div className="space-y-4">
        {turns.map((turn, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium text-foreground">{turn.question}</p>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{turn.answer}</p>
              <CitationList citations={turn.citations} />
            </CardContent>
          </Card>
        ))}
        {!turns.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Answers are grounded strictly in what's been captured — nothing invented, always cited.
          </p>
        )}
      </div>
    </div>
  );
}
