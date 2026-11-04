import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { Role } from "../types";
import { useAppSelector } from "../hooks/storeHooks";

/** Where a member with an outstanding forced password change is sent. */
const MEMBER_CHANGE_PASSWORD_PATH = "/member-change-password";

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const user = useAppSelector((s) => s.auth.user);
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;

  // FR-017 and FR-018: a member who has not yet replaced their issued password cannot reach
  // anything except the screen that replaces it. The server enforces this independently —
  // every member route answers 403 PASSWORD_CHANGE_REQUIRED — so this redirect is purely so
  // the member lands somewhere useful instead of on an error.
  if (
    user.role === "member" &&
    user.mustChangePassword &&
    location.pathname !== MEMBER_CHANGE_PASSWORD_PATH
  ) {
    return <Navigate to={MEMBER_CHANGE_PASSWORD_PATH} replace />;
  }

  return <Outlet />;
}
