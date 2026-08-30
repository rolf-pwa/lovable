import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { getTaskAgent } from "@/shared/lib/agents";

interface Props {
  projectId: string;
  onCreated: () => void;
}

export function AddTaskForm({ projectId, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await getTaskAgent().createTask({ title: title.trim(), project_id: projectId });
      setTitle("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add this task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task…"
        className="flex-1"
      />
      <Button type="submit" disabled={saving || !title.trim()}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </Button>
    </form>
  );
}
