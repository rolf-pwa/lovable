import { useState, useEffect } from "react";
import { supabase } from "@/shared/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Loader2, UserCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { toast } from "sonner";

// ── Workspace Users Cache (singleton) ──
let _workspaceUsersCache: { gid: string; name: string }[] | null = null;
let _workspaceUsersFetching = false;
const _workspaceUsersListeners: ((users: { gid: string; name: string }[]) => void)[] = [];

async function fetchWorkspaceUsers(): Promise<{ gid: string; name: string }[]> {
  if (_workspaceUsersCache) return _workspaceUsersCache;
  if (_workspaceUsersFetching) {
    return new Promise((resolve) => {
      _workspaceUsersListeners.push(resolve);
    });
  }
  _workspaceUsersFetching = true;
  try {
    const res = await supabase.functions.invoke("asana-service", {
      body: { action: "getWorkspaceUsers" },
    });
    if (res.error) {
      console.error("[AssigneePicker] Edge function error:", res.error);
      return [];
    }
    const users = (res.data?.data || []).map((u: any) => ({ gid: u.gid, name: u.name }));
    _workspaceUsersCache = users;
    _workspaceUsersListeners.forEach((cb) => cb(users));
    _workspaceUsersListeners.length = 0;
    return users;
  } catch (e) {
    console.error("[AssigneePicker] Failed to fetch users:", e);
    return [];
  } finally {
    _workspaceUsersFetching = false;
  }
}

interface AssigneePickerProps {
  currentAssignee: { gid: string; name: string } | null | undefined;
  taskGid: string;
  onAssigneeChanged: (assignee: { gid: string; name: string } | null) => void;
}

export function AssigneePicker({ currentAssignee, taskGid, onAssigneeChanged }: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<{ gid: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (open && users.length === 0) {
      setLoading(true);
      fetchWorkspaceUsers()
        .then(setUsers)
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleSelect = async (user: { gid: string; name: string } | null) => {
    setUpdating(true);
    try {
      const res = await supabase.functions.invoke("asana-service", {
        body: {
          action: "updateTask",
          task_gid: taskGid,
          updates: { assignee: user?.gid || null },
        },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || "Failed");
      onAssigneeChanged(user);
      toast.success(user ? `Assigned to ${user.name}` : "Unassigned");
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update assignee");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border border-border hover:bg-muted/50 transition-colors"
          title="Change assignee"
        >
          <UserCircle className="h-3 w-3 text-muted-foreground" />
          <span className="truncate max-w-[80px]">
            {currentAssignee?.name?.split(" ")[0] || "Unassigned"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-48 p-1"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-[200px] overflow-y-auto space-y-0.5">
            <button
              onClick={() => handleSelect(null)}
              disabled={updating}
              className={cn(
                "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/50 transition-colors",
                !currentAssignee && "bg-muted/50 font-medium"
              )}
            >
              Unassigned
            </button>
            {users.map((user) => (
              <button
                key={user.gid}
                onClick={() => handleSelect(user)}
                disabled={updating}
                className={cn(
                  "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/50 transition-colors truncate",
                  currentAssignee?.gid === user.gid && "bg-muted/50 font-medium"
                )}
              >
                {user.name}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
