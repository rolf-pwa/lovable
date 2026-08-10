import { Link } from "react-router-dom";
import { Badge } from "@/shared/components/ui/badge";
import { BrainCitation } from "@/shared/lib/brain";

export function CitationList({ citations }: { citations: BrainCitation[] }) {
  if (!citations.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {citations.map((c) => (
        <Link key={c.chunkId} to={`/brain/${c.documentId}`}>
          <Badge variant="outline" className="gap-1 text-xs hover:bg-muted">
            [{c.n}] {c.title}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
