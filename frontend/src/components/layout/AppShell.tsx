import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../hooks/storeHooks";
import { clearAuth } from "../../features/auth/authSlice";
import { Button } from "../ui/Button";
import { RoleAvatar } from "./RoleAvatar";
import type { Role } from "../../types";

type NavItem = { to: string; label: string };

const navByRole: Record<Role, NavItem[]> = {
  admin: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/zones", label: "Zones" },
    { to: "/mohallahs", label: "Mohallahs" },
    { to: "/parties", label: "Parties" },
    { to: "/venues", label: "Venues" },
    { to: "/miqaats", label: "Miqaats" },
    { to: "/schedules", label: "Schedules" },
    { to: "/reports", label: "Reports" },
    { to: "/import-export", label: "Import/Export" }
  ],
  zonal_head: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/parties", label: "Parties" },
    { to: "/venues", label: "Venues" },
    { to: "/schedules", label: "Schedules" },
    { to: "/reports", label: "Reports" },
    { to: "/change-password", label: "Change Password" }
  ],
  party: [
    { to: "/my-schedule", label: "My Schedule" },
    { to: "/rate-mic", label: "Rate Mic" },
    { to: "/change-password", label: "Change Password" }
  ],
  coordinator: [
    { to: "/assigned-parties", label: "Assigned Parties" },
    { to: "/attendance-rating", label: "Attendance & Rating" },
    { to: "/change-password", label: "Change Password" }
  ]
};

export function AppShell() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);

  if (!user) return <Outlet />;

  const nav = navByRole[user.role];

  return (
    <div className="flex h-full min-h-screen bg-surface">
      <aside className="hidden w-64 flex-shrink-0 border-r border-border bg-white p-4 md:block">
        <div className="mb-4 text-left">
          <div className="text-lg font-bold text-primary">MPSS</div>
          <div className="text-xs text-textMuted">Masjid Party Scheduling</div>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "rounded-button px-3 py-2 text-sm font-semibold",
                  isActive ? "bg-primary text-white" : "text-textPrimary hover:bg-black/5"
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3">
          <RoleAvatar role={user.role} name={user.displayName} />
          <Button
            variant="ghost"
            onClick={() => {
              dispatch(clearAuth());
              navigate("/login", { replace: true });
            }}
          >
            Logout
          </Button>
        </header>

        <div className="min-w-0 flex-1 p-4 pb-24 md:pb-4">
          <Outlet />
        </div>

        <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-white px-2 py-2 md:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-around gap-2">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "flex-1 rounded-button px-3 py-2 text-center text-xs font-semibold",
                    isActive ? "bg-primary text-white" : "text-textPrimary hover:bg-black/5"
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </main>
    </div>
  );
}
