import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useAppSelector } from "../../hooks/storeHooks";
import { useGetZonesQuery } from "../../features/zones/zonesApi";
import { useGetMiqaatsQuery } from "../../features/miqaats/miqaatsApi";
import { useGetPartiesQuery } from "../../features/parties/partiesApi";
import { formatDateDdMmmYy } from "../../utils/formatDate";
import {
  useGetAttendanceReportQuery,
  useGetManuallyEditedQuery,
  useGetMiqaatScheduleQuery,
  useGetPartyHistoryQuery,
  useGetPerformanceSummaryQuery,
  useGetPerformanceTrendQuery,
  useGetQuarterlyReviewQuery,
  useGetStatusSummaryQuery,
  useGetZoneScheduleSummaryQuery
} from "../../features/reports/reportsApi";

function safeRefetch(query: any) {
  if (!query) return;
  if (query.isUninitialized) return;
  if (typeof query.refetch !== "function") return;
  query.refetch();
}

export function ReportsPage() {
  const user = useAppSelector((s) => s.auth.user);
  const role = user?.role ?? "admin";

  const zonesQuery = useGetZonesQuery(undefined, { skip: role !== "admin" });
  const miqaatsQuery = useGetMiqaatsQuery();
  const partiesQuery = useGetPartiesQuery(undefined);

  const [zoneId, setZoneId] = useState<string>("all");
  const [miqaatId, setMiqaatId] = useState<string>("");
  const [partyId, setPartyId] = useState<string>("");
  const now = new Date();
  const initialYear = now.getFullYear();
  const initialQuarter = Math.floor(now.getMonth() / 3) + 1;
  const [year, setYear] = useState<string>(String(initialYear));
  const [quarter, setQuarter] = useState<string>(String(initialQuarter));

  const effectiveZoneId = role === "zonal_head" ? user?.zoneId : zoneId === "all" ? undefined : Number(zoneId);

  const statusQuery = useGetStatusSummaryQuery(effectiveZoneId ? { zone_id: effectiveZoneId } : undefined);
  const miqaatScheduleQuery = useGetMiqaatScheduleQuery(
    miqaatId ? { miqaat_id: Number(miqaatId), zone_id: effectiveZoneId } : (undefined as any),
    { skip: !miqaatId }
  );
  const zoneScheduleQuery = useGetZoneScheduleSummaryQuery(
    miqaatId ? { miqaat_id: Number(miqaatId), zone_id: effectiveZoneId } : (undefined as any),
    { skip: !miqaatId }
  );
  const attendanceQuery = useGetAttendanceReportQuery(
    miqaatId ? { miqaat_id: Number(miqaatId), zone_id: effectiveZoneId } : (undefined as any),
    { skip: !miqaatId }
  );
  const performanceSummaryQuery = useGetPerformanceSummaryQuery(
    effectiveZoneId ? { zone_id: effectiveZoneId } : undefined
  );
  const performanceTrendQuery = useGetPerformanceTrendQuery(
    partyId ? { party_id: Number(partyId) } : (undefined as any),
    { skip: !partyId }
  );
  const partyHistoryQuery = useGetPartyHistoryQuery(
    partyId ? { party_id: Number(partyId) } : (undefined as any),
    { skip: !partyId }
  );
  const quarterlyQuery = useGetQuarterlyReviewQuery(
    { year: Number(year), quarter: Number(quarter), zone_id: effectiveZoneId },
    { skip: !year || !quarter }
  );
  const manuallyEditedQuery = useGetManuallyEditedQuery(
    miqaatId || effectiveZoneId ? { miqaat_id: miqaatId ? Number(miqaatId) : undefined, zone_id: effectiveZoneId } : undefined
  );

  const zoneOptions = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    const opts = zones
      .slice()
      .sort((a, b) => a.zone_name.localeCompare(b.zone_name))
      .map((z) => ({ value: String(z.id), label: z.zone_name }));
    return [{ value: "all", label: "All zones" }, ...opts];
  }, [zonesQuery.data]);

  const miqaatOptions = useMemo(() => {
    const items = miqaatsQuery.data ?? [];
    const opts = items
      .slice()
      .sort((a, b) => b.english_date.localeCompare(a.english_date))
      .map((m) => ({ value: String(m.id), label: `${formatDateDdMmmYy(m.english_date)} - ${m.miqaat_name}` }));
    return [{ value: "", label: "Select miqaat" }, ...opts];
  }, [miqaatsQuery.data]);

  const partyOptions = useMemo(() => {
    const items = partiesQuery.data ?? [];
    const filtered = effectiveZoneId ? items.filter((p) => p.zone_id === effectiveZoneId) : items;
    const opts = filtered
      .slice()
      .sort((a, b) => a.party_name.localeCompare(b.party_name))
      .map((p) => ({ value: String(p.id), label: `${p.party_name} (${p.zone_name})` }));
    return [{ value: "", label: "Select party" }, ...opts];
  }, [partiesQuery.data, effectiveZoneId]);

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Reports</div>

      <Card>
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-bold">Filters</div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                safeRefetch(statusQuery);
                safeRefetch(miqaatScheduleQuery);
                safeRefetch(zoneScheduleQuery);
                safeRefetch(attendanceQuery);
                safeRefetch(performanceSummaryQuery);
                safeRefetch(performanceTrendQuery);
                safeRefetch(partyHistoryQuery);
                safeRefetch(quarterlyQuery);
                safeRefetch(manuallyEditedQuery);
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {role === "admin" ? (
            <Select label="Zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} options={zoneOptions} />
          ) : (
            <Select label="Zone" value={String(user?.zoneId ?? "")} onChange={() => {}} options={[{ value: String(user?.zoneId ?? ""), label: "My Zone" }]} />
          )}
          <Select label="Miqaat" value={miqaatId} onChange={(e) => setMiqaatId(e.target.value)} options={miqaatOptions} />
          <Select label="Party" value={partyId} onChange={(e) => setPartyId(e.target.value)} options={partyOptions} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select
            label="Year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            options={[
              { value: String(initialYear - 1), label: String(initialYear - 1) },
              { value: String(initialYear), label: String(initialYear) },
              { value: String(initialYear + 1), label: String(initialYear + 1) }
            ]}
          />
          <Select
            label="Quarter"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            options={[
              { value: "1", label: "Q1" },
              { value: "2", label: "Q2" },
              { value: "3", label: "Q3" },
              { value: "4", label: "Q4" }
            ]}
          />
          <div />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <div className="mb-2 text-lg font-bold">Status Summary</div>
          {statusQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : statusQuery.isError ? (
            <div className="text-sm text-danger">Failed to load status summary</div>
          ) : (
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-textMuted">Parties</div>
                <div className="font-semibold">
                  Active: {statusQuery.data?.parties.active ?? 0} | Inactive: {statusQuery.data?.parties.inactive ?? 0}
                </div>
              </div>
              <div>
                <div className="text-textMuted">Venues</div>
                <div className="font-semibold">
                  Active: {statusQuery.data?.venues.active ?? 0} | Inactive: {statusQuery.data?.venues.inactive ?? 0}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-2 text-lg font-bold">Miqaat Schedule</div>
          {!miqaatId ? (
            <div className="text-sm text-textMuted">Select a Miqaat to view schedule report.</div>
          ) : miqaatScheduleQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : miqaatScheduleQuery.isError ? (
            <div className="text-sm text-danger">Failed to load miqaat schedule</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3">Zone</th>
                    <th className="py-2 pr-3">Venue</th>
                    <th className="py-2 pr-3">Party</th>
                    <th className="py-2 pr-3">Manual</th>
                  </tr>
                </thead>
                <tbody>
                  {(miqaatScheduleQuery.data ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{r.zone_name}</td>
                      <td className="py-2 pr-3">
                        {r.venue_name} <span className="text-textMuted">({r.mohallah_name})</span>
                      </td>
                      <td className="py-2 pr-3 font-semibold">
                        {r.party_name} ({r.category})
                      </td>
                      <td className="py-2 pr-3">{r.is_manual ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <div className="mb-2 text-lg font-bold">Zone-wise Schedule Summary</div>
          {!miqaatId ? (
            <div className="text-sm text-textMuted">Select a Miqaat to view zone-wise summary.</div>
          ) : zoneScheduleQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : zoneScheduleQuery.isError ? (
            <div className="text-sm text-danger">Failed to load zone schedule summary</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3">Zone</th>
                    <th className="py-2 pr-3">Venue</th>
                    <th className="py-2 pr-3">Total</th>
                    <th className="py-2 pr-3">A</th>
                    <th className="py-2 pr-3">B</th>
                    <th className="py-2 pr-3">C</th>
                    <th className="py-2 pr-3">Manual</th>
                  </tr>
                </thead>
                <tbody>
                  {(zoneScheduleQuery.data ?? []).map((r, idx) => (
                    <tr key={idx} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{r.zone_name}</td>
                      <td className="py-2 pr-3">
                        {r.venue_name} <span className="text-textMuted">({r.mohallah_name})</span>
                      </td>
                      <td className="py-2 pr-3 font-semibold">{r.total_parties}</td>
                      <td className="py-2 pr-3">{r.cat_a}</td>
                      <td className="py-2 pr-3">{r.cat_b}</td>
                      <td className="py-2 pr-3">{r.cat_c}</td>
                      <td className="py-2 pr-3">{r.manual_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-2 text-lg font-bold">Attendance Feedback Log</div>
          {!miqaatId ? (
            <div className="text-sm text-textMuted">Select a Miqaat to view attendance report.</div>
          ) : attendanceQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : attendanceQuery.isError ? (
            <div className="text-sm text-danger">Failed to load attendance report</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3">Venue</th>
                    <th className="py-2 pr-3">Party</th>
                    <th className="py-2 pr-3">Attended</th>
                    <th className="py-2 pr-3">Overall</th>
                    <th className="py-2 pr-3">Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {(attendanceQuery.data ?? []).map((r) => (
                    <tr key={r.schedule_id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">
                        {r.venue_name} <span className="text-textMuted">({r.mohallah_name})</span>
                      </td>
                      <td className="py-2 pr-3 font-semibold">
                        {r.party_name} ({r.category})
                      </td>
                      <td className="py-2 pr-3">
                        {r.attended_properly === null ? "—" : r.attended_properly ? "Yes" : "No"}
                      </td>
                      <td className="py-2 pr-3">{r.overall_score ?? "—"}</td>
                      <td className="py-2 pr-3">{r.comments ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-2 text-lg font-bold">Party Performance Ratings (Summary)</div>
        {performanceSummaryQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : performanceSummaryQuery.isError ? (
          <div className="text-sm text-danger">Failed to load performance summary</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Zone</th>
                  <th className="py-2 pr-3">Party</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Avg Overall</th>
                  <th className="py-2 pr-3">Count</th>
                </tr>
              </thead>
              <tbody>
                {(performanceSummaryQuery.data ?? []).map((r) => (
                  <tr key={r.party_id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{r.zone_name}</td>
                    <td className="py-2 pr-3 font-semibold">{r.party_name}</td>
                    <td className="py-2 pr-3">{r.category}</td>
                    <td className="py-2 pr-3">{r.avg_overall === null ? "—" : Number(r.avg_overall).toFixed(2)}</td>
                    <td className="py-2 pr-3">{r.ratings_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-2 text-lg font-bold">Party Performance Trend</div>
        {!partyId ? (
          <div className="text-sm text-textMuted">Select a Party to view performance trend.</div>
        ) : performanceTrendQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : performanceTrendQuery.isError ? (
          <div className="text-sm text-danger">Failed to load performance trend</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Miqaat</th>
                  <th className="py-2 pr-3">Avg Overall</th>
                  <th className="py-2 pr-3">Attendance (Yes)</th>
                  <th className="py-2 pr-3">Rated</th>
                </tr>
              </thead>
              <tbody>
                {(performanceTrendQuery.data?.performance_trend ?? []).map((r) => (
                  <tr key={r.miqaat_id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">
                      {formatDateDdMmmYy(r.english_date)} - {r.miqaat_name}
                    </td>
                    <td className="py-2 pr-3">{r.avg_overall === null ? "—" : Number(r.avg_overall).toFixed(2)}</td>
                    <td className="py-2 pr-3">{r.attended_count}</td>
                    <td className="py-2 pr-3">{r.rated_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-2 text-lg font-bold">Party Assignment History</div>
        {!partyId ? (
          <div className="text-sm text-textMuted">Select a Party to view venue history.</div>
        ) : partyHistoryQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : partyHistoryQuery.isError ? (
          <div className="text-sm text-danger">Failed to load party history</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Venue</th>
                  <th className="py-2 pr-3">Visits</th>
                  <th className="py-2 pr-3">First</th>
                  <th className="py-2 pr-3">Last</th>
                </tr>
              </thead>
              <tbody>
                {(partyHistoryQuery.data ?? []).map((r) => (
                  <tr key={r.venue_id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-semibold">{r.venue_name}</td>
                    <td className="py-2 pr-3">{r.visit_count}</td>
                    <td className="py-2 pr-3">{formatDateDdMmmYy(r.first_visited_at)}</td>
                    <td className="py-2 pr-3">{formatDateDdMmmYy(r.last_visited_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <div className="mb-2 text-lg font-bold">Quarterly Review</div>
          {quarterlyQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : quarterlyQuery.isError ? (
            <div className="text-sm text-danger">Failed to load quarterly review</div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-sm font-semibold">Best</div>
                <div className="overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3">Party</th>
                        <th className="py-2 pr-3">Zone</th>
                        <th className="py-2 pr-3">Avg</th>
                        <th className="py-2 pr-3">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(quarterlyQuery.data?.best ?? []).map((r) => (
                        <tr key={r.party_id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-semibold">
                            {r.party_name} <span className="text-textMuted">({r.category})</span>
                          </td>
                          <td className="py-2 pr-3">{r.zone_name}</td>
                          <td className="py-2 pr-3">{r.avg_overall === null ? "—" : Number(r.avg_overall).toFixed(2)}</td>
                          <td className="py-2 pr-3">{r.ratings_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm font-semibold">Worst</div>
                <div className="overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3">Party</th>
                        <th className="py-2 pr-3">Zone</th>
                        <th className="py-2 pr-3">Avg</th>
                        <th className="py-2 pr-3">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(quarterlyQuery.data?.worst ?? []).map((r) => (
                        <tr key={r.party_id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-semibold">
                            {r.party_name} <span className="text-textMuted">({r.category})</span>
                          </td>
                          <td className="py-2 pr-3">{r.zone_name}</td>
                          <td className="py-2 pr-3">{r.avg_overall === null ? "—" : Number(r.avg_overall).toFixed(2)}</td>
                          <td className="py-2 pr-3">{r.ratings_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-2 text-lg font-bold">Manually Edited Schedule</div>
          {manuallyEditedQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : manuallyEditedQuery.isError ? (
            <div className="text-sm text-danger">Failed to load manual edits</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Miqaat</th>
                    <th className="py-2 pr-3">Zone</th>
                    <th className="py-2 pr-3">Old</th>
                    <th className="py-2 pr-3">New</th>
                  </tr>
                </thead>
                <tbody>
                  {(manuallyEditedQuery.data ?? []).map((r) => (
                    <tr key={r.edit_id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{formatDateDdMmmYy(r.edited_at)}</td>
                      <td className="py-2 pr-3">
                        {formatDateDdMmmYy(r.english_date)} - {r.miqaat_name}
                      </td>
                      <td className="py-2 pr-3">{r.zone_name}</td>
                      <td className="py-2 pr-3">
                        {r.old_venue_name} / {r.old_party_name}
                      </td>
                      <td className="py-2 pr-3 font-semibold">
                        {r.new_venue_name} / {r.new_party_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
