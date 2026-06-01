import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useGetMiqaatsQuery } from "../../features/miqaats/miqaatsApi";
import { useGetSchedulesQuery } from "../../features/schedules/schedulesApi";
import { formatDateDdMmmYy } from "../../utils/formatDate";

export function AssignedPartiesPage() {
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

  const cards = useMemo(() => {
    const rows = schedulesQuery.data ?? [];
    const byMiqaat = new Map<number, typeof rows>();
    for (const r of rows) {
      const list = byMiqaat.get(r.miqaat_id) ?? [];
      list.push(r);
      byMiqaat.set(r.miqaat_id, list);
    }
    return Array.from(byMiqaat.entries())
      .map(([id, list]) => ({
        miqaatId: id,
        miqaatName: list[0]?.miqaat_name ?? "",
        englishDate: list[0]?.english_date ?? "",
        assignments: list
      }))
      .sort((a, b) => b.englishDate.localeCompare(a.englishDate));
  }, [schedulesQuery.data]);

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Assigned Parties View</div>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label="Filter by Miqaat"
            value={miqaatId}
            onChange={(e) => setMiqaatId(e.target.value)}
            options={miqaatOptions}
          />
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
          <div className="text-sm text-danger">Failed to load assigned parties</div>
        </Card>
      ) : cards.length === 0 ? (
        <Card>
          <div className="text-sm text-textMuted">
            No assigned parties yet. Ask Admin/Zonal Head to generate schedule for your zone.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <Card key={c.miqaatId}>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-bold">{c.miqaatName}</div>
                  <div className="text-sm text-textMuted">{formatDateDdMmmYy(c.englishDate)}</div>
                </div>
                <div className="text-sm text-textMuted">{c.assignments.length} assignment(s)</div>
              </div>

              <div className="mt-3 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3">Venue</th>
                      <th className="py-2 pr-3">Party</th>
                      <th className="py-2 pr-3">Zone</th>
                      <th className="py-2 pr-3">Manual</th>
                      <th className="py-2 pr-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.assignments
                      .slice()
                      .sort((a, b) => a.venue_name.localeCompare(b.venue_name))
                      .map((a) => (
                        <tr key={a.id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-semibold">{a.venue_name}</td>
                          <td className="py-2 pr-3">
                            {a.party_name} <span className="text-textMuted">({a.category})</span>
                          </td>
                          <td className="py-2 pr-3">{a.zone_name}</td>
                          <td className="py-2 pr-3">{a.is_manual ? "Yes" : "No"}</td>
                          <td className="py-2 pr-3">
                            <Link
                              className="text-secondary underline"
                              to={`/attendance-rating?miqaat_id=${a.miqaat_id}`}
                            >
                              Mark Attendance
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
