import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/shared/hooks/useAuth";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Loader2, Plus } from "lucide-react";
import { captureBrainNote } from "@/shared/lib/brain";

export function QuickCapture({ onCaptured }: { onCaptured?: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const captureMutation = useMutation({
    mutationFn: async () => {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      return captureBrainNote({ title: title.trim(), body: body.trim(), tags, createdBy: user?.id });
    },
    onSuccess: () => {
      toast.success("Captured to the Second Brain");
      setTitle("");
      setBody("");
      setTagsInput("");
      queryClient.invalidateQueries({ queryKey: ["brain-documents"] });
      onCaptured?.();
    },
    onError: (e: any) => toast.error(e.message || "Could not capture note"),
  });

  const canSave = title.trim().length > 0 && body.trim().length > 0 && !captureMutation.isPending;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <Input
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />
      <Textarea
        placeholder="What do you want to remember?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
      />
      <div className="flex items-center gap-3">
        <Input
          placeholder="Tags (comma separated)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          className="flex-1"
        />
        <Button
          onClick={() => captureMutation.mutate()}
          disabled={!canSave}
        >
          {captureMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Capture
        </Button>
      </div>
    </div>
  );
}
