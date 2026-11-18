import { Card } from "../components/ui/Card";
import { MembersOverview } from "../components/dashboard/MembersOverview";
import { useAppSelector } from "../hooks/storeHooks";
import { formatDateDdMmmYy } from "../utils/formatDate";

/**
 * The landing page for an Administrator and a Zonal Head.
 *
 * The member figures (FR-112) are shown to an administrator only, and the reason is scope
 * rather than secrecy: they are organisation-wide. A Zonal Head is confined everywhere else
 * in this module to `member_profiles.zone_id`, and a member who has not reached Tab 3 has no
 * zone at all — which is exactly the member a completion figure is about. A zone-scoped
 * version would leave out the very people it was opened to find and report a healthier
 * number than the truth, so the server refuses the request and this page does not make it.
 */
export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="text-2xl font-bold">Dashboard</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card>
          <div className="text-sm text-textMuted">Role</div>
          <div className="text-lg font-bold">{user?.role}</div>
        </Card>
        <Card>
          <div className="text-sm text-textMuted">Zone</div>
          <div className="text-lg font-bold">{user?.zoneId ?? "—"}</div>
        </Card>
        <Card>
          <div className="text-sm text-textMuted">Party</div>
          <div className="text-lg font-bold">{user?.partyId ?? "—"}</div>
        </Card>
        <Card>
          <div className="text-sm text-textMuted">Last Login</div>
          <div className="text-lg font-bold">{formatDateDdMmmYy(user?.lastLoginAt ?? null)}</div>
        </Card>
      </div>

      {isAdmin ? <MembersOverview /> : null}
    </div>
  );
}
