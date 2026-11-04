import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

type NavItem = { to: string; label: string };

/** Fluent 20px regular glyphs, inline so nothing new is installed. */
const ICONS: Record<string, string> = {
  "/member-profile":
    "M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM7 6a3 3 0 1 1 6 0 3 3 0 0 1-6 0Zm-2 5a2 2 0 0 0-2 2c0 1.7.83 2.97 2.13 3.8A9.14 9.14 0 0 0 10 18c1.85 0 3.58-.39 4.87-1.2A4.35 4.35 0 0 0 17 13a2 2 0 0 0-2-2H5Zm-1 2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1c0 1.3-.62 2.28-1.67 2.95A8.16 8.16 0 0 1 10 17a8.16 8.16 0 0 1-4.33-1.05A3.36 3.36 0 0 1 4 13Z",
  "/member-change-password":
    "M10 2a3 3 0 0 0-3 3v2H6a2 2 0 0 0-2 2v6c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V5a3 3 0 0 0-3-3Zm2 5H8V5a2 2 0 1 1 4 0v2ZM6 8h8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm4 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
};

const MENU =
  "M2 4.5c0-.28.22-.5.5-.5h15a.5.5 0 0 1 0 1h-15a.5.5 0 0 1-.5-.5Zm0 5c0-.28.22-.5.5-.5h15a.5.5 0 0 1 0 1h-15a.5.5 0 0 1-.5-.5Zm.5 4.5a.5.5 0 0 0 0 1h15a.5.5 0 0 0 0-1h-15Z";

function Glyph({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-5 w-5 shrink-0 fill-current ${className}`}>
      <path d={d} />
    </svg>
  );
}

/** The nine-dot app launcher mark that opens every Dynamics header. Decorative here. */
function Waffle() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-current">
      {[4, 10, 16].flatMap((y) =>
        [4, 10, 16].map((x) => <rect key={`${x}-${y}`} x={x - 1.25} y={y - 1.25} width="2.5" height="2.5" />)
      )}
    </svg>
  );
}

const focusRing =
  "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white";

/**
 * The signed-in member's frame, laid out like a Dynamics 365 model-driven app: a dark app
 * header, a collapsible site map on the left, and a light grey canvas for the record.
 *
 * Setting `theme-d365` here is what re-themes the shared Card, Input, Select and Button
 * inside the member's pages; other roles never render this shell, so they keep the
 * original look.
 */
export function MemberShell({
  nav,
  displayName,
  avatarUrl,
  onLogout
}: {
  nav: NavItem[];
  displayName: string;
  avatarUrl: string | null;
  onLogout: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U";

  return (
    <div className="theme-d365 flex h-full min-h-screen flex-col bg-surface">
      <header className="flex h-12 shrink-0 items-center bg-[#002050] text-white">
        <div className="flex h-12 w-12 items-center justify-center">
          <Waffle />
        </div>
        <div className="flex min-w-0 items-center gap-3 text-[15px]">
          <span className="font-semibold">ZSMS</span>
          <span className="hidden h-5 w-px bg-white/40 sm:block" aria-hidden="true" />
          <span className="hidden truncate sm:block">Member Portal</span>
        </div>

        <div className="ml-auto flex h-12 items-center">
          <div className="flex h-12 items-center gap-2 px-3">
            <span className="hidden text-sm sm:block">{displayName}</span>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${displayName} profile photograph`}
                className="h-8 w-8 rounded-full object-cover ring-1 ring-white/40"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ebf3fc] text-xs font-semibold text-[#0f6cbd]">
                {initials}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onLogout}
            className={`h-12 px-4 text-sm hover:bg-white/10 active:bg-white/20 ${focusRing}`}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`hidden shrink-0 flex-col border-r border-[#e0e0e0] bg-[#f0f0f0] transition-[width] duration-150 md:flex ${
            collapsed ? "w-12" : "w-56"
          }`}
        >
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            className="flex h-11 w-12 items-center justify-center text-[#242424] hover:bg-[#e0e0e0] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f6cbd]"
          >
            <Glyph d={MENU} />
          </button>

          {!collapsed ? (
            <div className="px-4 pb-1 pt-2 text-xs font-semibold text-[#616161]">My account</div>
          ) : null}

          <nav className="flex flex-col">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  [
                    "relative flex h-10 items-center gap-3 text-sm",
                    "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f6cbd]",
                    collapsed ? "justify-center" : "px-4",
                    isActive
                      ? "bg-white font-semibold text-[#242424] before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-[#0f6cbd]"
                      : "text-[#242424] hover:bg-[#e0e0e0]"
                  ].join(" ")
                }
              >
                <Glyph d={ICONS[item.to] ?? MENU} className="text-[#424242]" />
                {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="min-w-0 pb-20 md:pb-0">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 flex border-t border-[#e0e0e0] bg-white md:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
                isActive
                  ? "font-semibold text-[#0f6cbd] before:absolute before:inset-x-6 before:top-0 before:h-[3px] before:rounded-b before:bg-[#0f6cbd]"
                  : "text-[#616161]"
              ].join(" ")
            }
          >
            <Glyph d={ICONS[item.to] ?? MENU} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
