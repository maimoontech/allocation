import { Navigate, Outlet } from "react-router-dom";
import type { Role } from "../types";
import { useAppSelector } from "../hooks/storeHooks";

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const user = useAppSelector((s) => s.auth.user);
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return <Outlet />;
}

