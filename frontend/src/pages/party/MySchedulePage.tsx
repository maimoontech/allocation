import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useGetMiqaatsQuery } from "../../features/miqaats/miqaatsApi";
import { useGetSchedulesQuery } from "../../features/schedules/schedulesApi";
import { formatDateDdMmmYy } from "../../utils/formatDate";

export function MySchedulePage() {
  const miqaatsQuery = useGetMiqaatsQuery();
  const [miqaatId, setMiqaatId] = useState<string>("all");

  const schedulesQuery = useGetSchedulesQuery(
    miqaatId === "all" ? undefined : { miqaat_id: Number(miqaatId) }
  );

  const miqaatOptions = useMemo(() => {
    const items = miqaatsQuery.data ?? [];
    const opts = items
      .slice()
      .sort((a, b) => b.english_date.localeCompare(a.english_date))
      .map((m) => ({ value: String(m.id), label: `${formatDateDdMmmYy(m.english_date)} - ${m.miqaat_name}` }));
    return [{ value: "all", label: "All miqaats" }, ...opts];
  }, [miqaatsQuery.data]);

  const rows = useMemo(
    () =>
      [...(schedulesQuery.data ?? [])].sort((a, b) => {
        const byDate = b.english_date.localeCompare(a.english_date);
        if (byDate !== 0) return byDate;
        return a.venue_name.localeCompare(b.venue_name);
      }),
    [schedulesQuery.data]
  );

  function formatCoordinatorLine(name?: string | null, contact?: string | null) {
    const safeName = name?.trim();
    const safeContact = contact?.trim();
    if (safeName && safeContact) return `${safeName} - ${safeContact}`;
    if (safeName) return safeName;
    if (safeContact) return safeContact;
    return "—";
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">My Schedule</div>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select label="Filter by Miqaat" value={miqaatId} onChange={(e) => setMiqaatId(e.target.value)} options={miqaatOptions} />
          <div className="flex items-end gap-2">
            <Button variant="ghost" onClick={() => schedulesQuery.refetch()}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {schedulesQuery.isLoading ? (
        <Card>
          <div className="text-sm text-textMuted">Loading...</div>
        </Card>
      ) : schedulesQuery.isError ? (
        <Card>
          <div className="text-sm text-danger">Failed to load schedule</div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <div className="text-sm text-textMuted">
            No schedule assigned yet. Ask Zonal Head/Admin to generate schedule for the selected Miqaat.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">Miqaat Name</div>
                  <div className="mt-1 font-semibold">{row.miqaat_name}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">English Date</div>
                  <div className="mt-1">{formatDateDdMmmYy(row.english_date)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">Hijri Date</div>
                  <div className="mt-1">{row.hijri_date || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">Venue Name</div>
                  <div className="mt-1">{row.venue_name}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">
                    Venue Coordinator Name & Contact Number
                  </div>
                  <div className="mt-1">
                    {formatCoordinatorLine(row.venue_coordinator_name, row.venue_contact_number)}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
