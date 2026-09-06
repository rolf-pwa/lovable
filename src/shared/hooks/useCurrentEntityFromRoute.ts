import { useLocation, matchPath } from "react-router-dom";

export type CurrentEntityType = "contact" | "household" | "family";

export interface CurrentEntity {
  type: CurrentEntityType;
  id: string;
}

// Manual list — add a pattern here if a new detail-page route is introduced.
// No automated staleness detection (deliberate — see feedback memory
// feedback_sovereignty_assistant_sync.md).
const ROUTE_PATTERNS: { type: CurrentEntityType; pattern: string }[] = [
  { type: "contact", pattern: "/contacts/:id" },
  { type: "contact", pattern: "/contacts/:id/edit" },
  { type: "household", pattern: "/households/:id" },
  { type: "family", pattern: "/families/:id" },
];

export function useCurrentEntityFromRoute(): CurrentEntity | null {
  const location = useLocation();
  for (const { type, pattern } of ROUTE_PATTERNS) {
    const match = matchPath(pattern, location.pathname);
    if (match?.params.id) return { type, id: match.params.id };
  }
  return null;
}
