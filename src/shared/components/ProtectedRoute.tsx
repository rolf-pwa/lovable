import { Navigate } from "react-router-dom";
import { useAuth } from "@/shared/hooks/useAuth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthorized } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isAuthorized) return <Navigate to="/access-denied" replace />;

  return <>{children}</>;
}
