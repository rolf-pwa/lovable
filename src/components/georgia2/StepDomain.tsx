import { useGeorgia2 } from "./state";
import { Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackGeorgia2 } from "@/lib/georgia2/session-tracker";

export function StepDomain() {
  const { state, dispatch } = useGeorgia2();

  const choose = (d: "corporate" | "personal") => {
    dispatch({ type: "set_domain", domain: d });
    trackGeorgia2({ domain: d, final_phase: "chat" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl">Welcome. Which wealth event brings you here?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your answer routes the entire diagnostic. Everything else adapts from here.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DomainCard
          icon={<Building2 className="h-8 w-8" />}
          title="Corporate Wealth Event"
          description="Founder exits, restructures, venture liquidity — capital moving through a corporation."
          selected={state.domain === "corporate"}
          onClick={() => choose("corporate")}
        />
        <DomainCard
          icon={<User className="h-8 w-8" />}
          title="Personal Wealth Event"
          description="Inheritance, severance, divorce, settlements, or personal windfalls."
          selected={state.domain === "personal"}
          onClick={() => choose("personal")}
        />
      </div>
    </div>
  );
}

function DomainCard({
  icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start gap-3 rounded-xl border-2 bg-card p-6 text-left transition-all hover:border-accent hover:shadow-md",
        selected ? "border-accent shadow-md" : "border-border"
      )}
    >
      <div className={cn("text-muted-foreground transition-colors", selected && "text-accent")}>
        {icon}
      </div>
      <h3 className="text-lg leading-tight">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </button>
  );
}
