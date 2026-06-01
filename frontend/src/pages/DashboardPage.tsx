import { Card } from "../components/ui/Card";
import { useAppSelector } from "../hooks/storeHooks";
import { formatDateDdMmmYy } from "../utils/formatDate";

export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);

  return (
    <div className="space-y-4">
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
    </div>
  );
}
