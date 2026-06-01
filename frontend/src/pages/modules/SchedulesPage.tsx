import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useAppSelector } from "../../hooks/storeHooks";
import { useGetZonesQuery } from "../../features/zones/zonesApi";
import { useGetMiqaatsQuery } from "../../features/miqaats/miqaatsApi";
import { useGetPartiesQuery } from "../../features/parties/partiesApi";
import { useGetVenuesQuery } from "../../features/venues/venuesApi";
import { formatDateDdMmmYy } from "../../utils/formatDate";
import {
  useDeleteScheduleMutation,
  useGenerateScheduleMutation,
  useGetSchedulesQuery,
  useUpdateScheduleMutation,
  type ScheduleRow
} from "../../features/schedules/schedulesApi";

export function SchedulesPage() {
  const user = useAppSelector((s) => s.auth.user);
  const role = user?.role ?? "admin";

  const zonesQuery = useGetZonesQuery(undefined, { skip: role !== "admin" });
  const miqaatsQuery = useGetMiqaatsQuery();

  const [zoneId, setZoneId] = useState<string>("");
  const [miqaatId, setMiqaatId] = useState<string>("");

  const effectiveZoneId = role === "zonal_head" ? user?.zoneId : zoneId ? Number(zoneId) : undefined;
  const effectiveMiqaatId = miqaatId ? Number(miqaatId) : undefined;

  const schedulesQuery = useGetSchedulesQuery(
    effectiveMiqaatId || effectiveZoneId
      ? { miqaat_id: effectiveMiqaatId, zone_id: effectiveZoneId }
      : undefined
  );

  const partiesQuery = useGetPartiesQuery(effectiveZoneId ? { zone_id: effectiveZoneId } : undefined);
  const venuesQuery = useGetVenuesQuery(effectiveZoneId ? { zone_id: effectiveZoneId } : undefined);

  const [generateSchedule, generateState] = useGenerateScheduleMutation();
  const [updateSchedule, updateState] = useUpdateScheduleMutation();
  const [deleteSchedule, deleteState] = useDeleteScheduleMutation();

  const [overwrite, setOverwrite] = useState<string>("0");
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [editVenueId, setEditVenueId] = useState<string>("");
  const [editPartyId, setEditPartyId] = useState<string>("");

  const isBusy = generateState.isLoading || updateState.isLoading || deleteState.isLoading;

  const zoneOptions = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    const opts = zones
      .slice()
      .sort((a, b) => a.zone_name.localeCompare(b.zone_name))
      .map((z) => ({ value: String(z.id), label: z.zone_name }));
    return [{ value: "", label: "Select zone" }, ...opts];
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
    const opts = items
      .slice()
      .sort((a, b) => a.party_name.localeCompare(b.party_name))
      .map((p) => ({ value: String(p.id), label: `${p.party_name} (${p.category})` }));
    return [{ value: "", label: "Select party" }, ...opts];
  }, [partiesQuery.data]);

  const venueOptions = useMemo(() => {
    const items = venuesQuery.data ?? [];
    const opts = items
      .slice()
      .sort((a, b) => a.venue_name.localeCompare(b.venue_name))
      .map((v) => ({ value: String(v.id), label: `${v.venue_name} (${v.mohallah_name})` }));
    return [{ value: "", label: "Select venue" }, ...opts];
  }, [venuesQuery.data]);

  const rows = useMemo(() => {
    const items = schedulesQuery.data ?? [];
    return [...items].sort((a, b) => {
      const d = b.english_date.localeCompare(a.english_date);
      if (d !== 0) return d;
      const z = a.zone_name.localeCompare(b.zone_name);
      if (z !== 0) return z;
      const m = a.mohallah_name.localeCompare(b.mohallah_name);
      if (m !== 0) return m;
      const v = a.venue_name.localeCompare(b.venue_name);
      if (v !== 0) return v;
      return a.party_name.localeCompare(b.party_name);
    });
  }, [schedulesQuery.data]);

  async function onGenerate() {
    const mId = Number(miqaatId);
    const zId = role === "zonal_head" ? user?.zoneId : Number(zoneId);
    if (!Number.isFinite(mId) || mId <= 0) return;
    if (!Number.isFinite(zId) || !zId) return;

    await generateSchedule({
      miqaat_id: mId,
      zone_id: role === "admin" ? zId : undefined,
      overwrite: overwrite === "1"
    }).unwrap();

    schedulesQuery.refetch();
  }

  async function onSaveEdit() {
    if (!editing) return;
    const vId = Number(editVenueId);
    const pId = Number(editPartyId);
    if (!Number.isFinite(vId) || !Number.isFinite(pId)) return;
    await updateSchedule({ id: editing.id, venue_id: vId, party_id: pId }).unwrap();
    setEditing(null);
    setEditVenueId("");
    setEditPartyId("");
    schedulesQuery.refetch();
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Schedules</div>

      <Card>
        <div className="mb-3 text-lg font-bold">Generate Schedule</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select label="Miqaat" value={miqaatId} onChange={(e) => setMiqaatId(e.target.value)} options={miqaatOptions} />
          {role === "admin" ? (
            <Select label="Zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} options={zoneOptions} />
          ) : (
            <Select label="Zone" value={String(user?.zoneId ?? "")} onChange={() => {}} options={[{ value: String(user?.zoneId ?? ""), label: "My Zone" }]} />
          )}
          <Select
            label="Overwrite Existing?"
            value={overwrite}
            onChange={(e) => setOverwrite(e.target.value)}
            options={[
              { value: "0", label: "No" },
              { value: "1", label: "Yes" }
            ]}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={onGenerate} disabled={isBusy}>
            {generateState.isLoading ? "Generating..." : "Generate"}
          </Button>
          <Button variant="ghost" onClick={() => schedulesQuery.refetch()} disabled={isBusy}>
            Refresh
          </Button>
        </div>
        {generateState.isError ? <div className="mt-2 text-sm text-danger">Failed to generate schedule</div> : null}
      </Card>

      {editing ? (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-lg font-bold">Manual Edit</div>
            <Button
              variant="ghost"
              disabled={isBusy}
              onClick={() => {
                setEditing(null);
                setEditVenueId("");
                setEditPartyId("");
              }}
            >
              Cancel
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select label="Venue" value={editVenueId} onChange={(e) => setEditVenueId(e.target.value)} options={venueOptions} />
            <Select label="Party" value={editPartyId} onChange={(e) => setEditPartyId(e.target.value)} options={partyOptions} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={onSaveEdit} disabled={isBusy}>
              Save
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold">Schedule List</div>
          <div className="text-sm text-textMuted">{rows.length} rows</div>
        </div>

        {schedulesQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : schedulesQuery.isError ? (
          <div className="text-sm text-danger">Failed to load schedules</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Miqaat</th>
                  <th className="py-2 pr-3">Zone</th>
                  <th className="py-2 pr-3">Mohallah</th>
                  <th className="py-2 pr-3">Venue</th>
                  <th className="py-2 pr-3">Party</th>
                  <th className="py-2 pr-3">Manual</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">
                      {formatDateDdMmmYy(r.english_date)} - {r.miqaat_name}
                    </td>
                    <td className="py-2 pr-3">{r.zone_name}</td>
                    <td className="py-2 pr-3">{r.mohallah_name}</td>
                    <td className="py-2 pr-3">{r.venue_name}</td>
                    <td className="py-2 pr-3 font-semibold">
                      {r.party_name} ({r.category})
                    </td>
                    <td className="py-2 pr-3">{r.is_manual ? "Yes" : "No"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            setEditing(r);
                            setEditVenueId(String(r.venue_id));
                            setEditPartyId(String(r.party_id));
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          disabled={isBusy}
                          onClick={async () => {
                            await deleteSchedule({ id: r.id }).unwrap();
                            schedulesQuery.refetch();
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
