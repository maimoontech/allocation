import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useAppSelector } from "../../hooks/storeHooks";
import { useGetZonesQuery } from "../../features/zones/zonesApi";
import { useGetMohallahsQuery } from "../../features/mohallahs/mohallahsApi";
import {
  useCreateVenueMutation,
  useDeleteVenueMutation,
  useGetVenuesQuery,
  useUpdateVenueMutation,
  type Venue
} from "../../features/venues/venuesApi";

const statusOptions = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" }
];

export function VenuesPage() {
  const user = useAppSelector((s) => s.auth.user);
  const role = user?.role ?? "admin";

  const zonesQuery = useGetZonesQuery(undefined, { skip: role !== "admin" });
  const [zoneFilter, setZoneFilter] = useState<string>("all");

  const effectiveZoneId =
    role === "zonal_head"
      ? user?.zoneId
      : zoneFilter === "all"
        ? undefined
        : Number(zoneFilter);

  const venuesQuery = useGetVenuesQuery(effectiveZoneId ? { zone_id: effectiveZoneId } : undefined);

  const mohallahsQuery = useGetMohallahsQuery(
    effectiveZoneId ? { zone_id: effectiveZoneId } : undefined
  );

  const [createVenue, createState] = useCreateVenueMutation();
  const [updateVenue, updateState] = useUpdateVenueMutation();
  const [deleteVenue, deleteState] = useDeleteVenueMutation();

  const [editing, setEditing] = useState<Venue | null>(null);
  const [mohallahId, setMohallahId] = useState<string>("");
  const [venueName, setVenueName] = useState("");
  const [minParties, setMinParties] = useState<string>("1");
  const [maxParties, setMaxParties] = useState<string>("5");
  const [isActive, setIsActive] = useState<string>("1");

  const isBusy = createState.isLoading || updateState.isLoading || deleteState.isLoading;

  const filterOptions = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    const opts = zones
      .slice()
      .sort((a, b) => a.zone_name.localeCompare(b.zone_name))
      .map((z) => ({ value: String(z.id), label: z.zone_name }));
    return [{ value: "all", label: "All zones" }, ...opts];
  }, [zonesQuery.data]);

  const mohallahOptions = useMemo(() => {
    const list = mohallahsQuery.data ?? [];
    const opts = list
      .slice()
      .sort((a, b) => a.mohallah_name.localeCompare(b.mohallah_name))
      .map((m) => ({ value: String(m.id), label: `${m.mohallah_name} (${m.zone_name})` }));
    return [{ value: "", label: "Select mohallah" }, ...opts];
  }, [mohallahsQuery.data]);

  const sorted = useMemo(() => {
    const items = venuesQuery.data ?? [];
    return [...items].sort((a, b) => {
      const z = a.zone_name.localeCompare(b.zone_name);
      if (z !== 0) return z;
      const m = a.mohallah_name.localeCompare(b.mohallah_name);
      if (m !== 0) return m;
      return a.venue_name.localeCompare(b.venue_name);
    });
  }, [venuesQuery.data]);

  function resetForm() {
    setEditing(null);
    setMohallahId("");
    setVenueName("");
    setMinParties("1");
    setMaxParties("5");
    setIsActive("1");
  }

  async function onSubmit() {
    const finalMohallahId = Number(mohallahId);
    const min = Number(minParties);
    const max = Number(maxParties);
    if (!Number.isFinite(finalMohallahId) || finalMohallahId <= 0) return;
    if (!venueName.trim()) return;
    if (!Number.isFinite(min) || min <= 0) return;
    if (!Number.isFinite(max) || max <= 0) return;
    if (min > max) return;

    const base = {
      venue_name: venueName.trim(),
      mohallah_id: finalMohallahId,
      min_parties: min,
      max_parties: max,
      is_active: isActive === "1" ? (1 as const) : (0 as const)
    };

    if (!editing) {
      await createVenue(base).unwrap();
      resetForm();
      return;
    }

    await updateVenue({ id: editing.id, ...base }).unwrap();
    resetForm();
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Venue Manager</div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-lg font-bold">{editing ? "Edit Venue" : "Create Venue"}</div>
          {editing ? (
            <Button variant="ghost" onClick={resetForm} disabled={isBusy}>
              Cancel
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label="Mohallah"
            value={mohallahId}
            onChange={(e) => setMohallahId(e.target.value)}
            options={mohallahOptions}
          />
          <Input label="Venue Name" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
          <Input label="Min Parties" value={minParties} onChange={(e) => setMinParties(e.target.value)} />
          <Input label="Max Parties" value={maxParties} onChange={(e) => setMaxParties(e.target.value)} />
          <Select label="Status" value={isActive} onChange={(e) => setIsActive(e.target.value)} options={statusOptions} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={onSubmit} disabled={isBusy}>
            {editing ? "Update" : "Create"}
          </Button>
          <Button variant="ghost" onClick={() => venuesQuery.refetch()} disabled={isBusy}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-bold">Venues</div>
          <div className="flex items-center gap-2">
            {role === "admin" ? (
              <div className="w-64">
                <Select label="Filter" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} options={filterOptions} />
              </div>
            ) : null}
            <div className="text-sm text-textMuted">{sorted.length} total</div>
          </div>
        </div>

        {venuesQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : venuesQuery.isError ? (
          <div className="text-sm text-danger">Failed to load venues</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Zone</th>
                  <th className="py-2 pr-3">Mohallah</th>
                  <th className="py-2 pr-3">Venue</th>
                  <th className="py-2 pr-3">Capacity</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{v.zone_name}</td>
                    <td className="py-2 pr-3">{v.mohallah_name}</td>
                    <td className="py-2 pr-3 font-semibold">{v.venue_name}</td>
                    <td className="py-2 pr-3">
                      {v.min_parties}/{v.max_parties}
                    </td>
                    <td className="py-2 pr-3">{v.is_active ? "Active" : "Inactive"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            setEditing(v);
                            setMohallahId(String(v.mohallah_id));
                            setVenueName(v.venue_name);
                            setMinParties(String(v.min_parties));
                            setMaxParties(String(v.max_parties));
                            setIsActive(v.is_active ? "1" : "0");
                          }}
                        >
                          Edit
                        </Button>
                        {role === "admin" ? (
                          <Button
                            variant="danger"
                            disabled={isBusy}
                            onClick={async () => {
                              await deleteVenue({ id: v.id }).unwrap();
                              if (editing?.id === v.id) resetForm();
                            }}
                          >
                            Delete
                          </Button>
                        ) : null}
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
