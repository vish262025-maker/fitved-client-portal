import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { homeForRole, type AppRole } from "@/lib/routes";

interface Props {
  children: React.ReactNode;
  /** Roles allowed to view this route. Omit to allow any signed-in user. */
  allow?: AppRole[];
}

export function ProtectedRoute({ children, allow }: Props) {
  const { user, role, loading, roleLoading, impersonating, exitImpersonation } = useAuth();
  const location = useLocation();

  // Wait for BOTH session and role before rendering anything —
  // prevents the flash of the wrong dashboard while the role loads.
  if (loading || (user && roleLoading)) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (allow && role && !allow.includes(role)) {
    // Browser-back from an impersonated admin dashboard to a super_admin route:
    // auto-restore the SA session so the navigation succeeds instead of looping.
    if (impersonating && allow.includes("super_admin")) {
      exitImpersonation();
      return null;
    }
    return <Navigate to={homeForRole(role)} replace />;
  }

  return <>{children}</>;
}
