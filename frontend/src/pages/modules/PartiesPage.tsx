import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useAppSelector } from "../../hooks/storeHooks";
import { useGetZonesQuery } from "../../features/zones/zonesApi";
import {
  useCreatePartyMutation,
  useDeletePartyMutation,
  useGetPartiesQuery,
  useUpdatePartyMutation,
  type Party
} from "../../features/parties/partiesApi";

const categoryOptions = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "H", label: "H" }
];

const statusOptions = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" }
];

export function PartiesPage() {
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

  const partiesQuery = useGetPartiesQuery(effectiveZoneId ? { zone_id: effectiveZoneId } : undefined);
  const [createParty, createState] = useCreatePartyMutation();
  const [updateParty, updateState] = useUpdatePartyMutation();
  const [deleteParty, deleteState] = useDeletePartyMutation();

  const [editing, setEditing] = useState<Party | null>(null);
  const [zoneId, setZoneId] = useState<string>("");
  const [itsNo, setItsNo] = useState("");
  const [leaderName, setLeaderName] = useState("");
  const [partyName, setPartyName] = useState("");
  const [category, setCategory] = useState<Party["category"]>("A");
  const [isActive, setIsActive] = useState<string>("1");
  const [password, setPassword] = useState("");

  const isBusy = createState.isLoading || updateState.isLoading || deleteState.isLoading;

  const zoneOptions = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    const opts = zones
      .slice()
      .sort((a, b) => a.zone_name.localeCompare(b.zone_name))
      .map((z) => ({ value: String(z.id), label: z.zone_name }));
    return [{ value: "", label: "Select zone" }, ...opts];
  }, [zonesQuery.data]);

  const filterOptions = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    const opts = zones
      .slice()
      .sort((a, b) => a.zone_name.localeCompare(b.zone_name))
      .map((z) => ({ value: String(z.id), label: z.zone_name }));
    return [{ value: "all", label: "All zones" }, ...opts];
  }, [zonesQuery.data]);

  const sorted = useMemo(() => {
    const items = partiesQuery.data ?? [];
    return [...items].sort((a, b) => {
      const z = a.zone_name.localeCompare(b.zone_name);
      if (z !== 0) return z;
      return a.party_name.localeCompare(b.party_name);
    });
  }, [partiesQuery.data]);

  function resetForm() {
    setEditing(null);
    setZoneId("");
    setItsNo("");
    setLeaderName("");
    setPartyName("");
    setCategory("A");
    setIsActive("1");
    setPassword("");
  }

  async function onSubmit() {
    const finalZoneId = role === "zonal_head" ? user?.zoneId : Number(zoneId);
    if (role !== "zonal_head" && (!Number.isFinite(finalZoneId) || !finalZoneId)) return;
    if (!itsNo.trim() || !leaderName.trim() || !partyName.trim()) return;
    if (!editing && !password.trim()) return;

    const base = {
      its_no: itsNo.trim(),
      leader_name: leaderName.trim(),
      party_name: partyName.trim(),
      category,
      is_active: isActive === "1" ? (1 as const) : (0 as const)
    };

    if (!editing) {
      await createParty({
        ...base,
        zone_id: role === "zonal_head" ? undefined : finalZoneId,
        password
      }).unwrap();
      resetForm();
      return;
    }

    await updateParty({
      id: editing.id,
      ...base,
      zone_id: role === "zonal_head" ? undefined : finalZoneId,
      password: password.trim() ? password : undefined
    }).unwrap();
    resetForm();
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Party Manager</div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-lg font-bold">{editing ? "Edit Party" : "Create Party"}</div>
          {editing ? (
            <Button variant="ghost" onClick={resetForm} disabled={isBusy}>
              Cancel
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {role === "admin" ? (
            <Select label="Zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} options={zoneOptions} />
          ) : null}
          <Input label="ITS No" value={itsNo} onChange={(e) => setItsNo(e.target.value)} />
          <Input label="Leader Name" value={leaderName} onChange={(e) => setLeaderName(e.target.value)} />
          <Input label="Party Name" value={partyName} onChange={(e) => setPartyName(e.target.value)} />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as Party["category"])} options={categoryOptions} />
          <Select label="Status" value={isActive} onChange={(e) => setIsActive(e.target.value)} options={statusOptions} />
          <Input
            label={editing ? "New Password (optional)" : "Password"}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={onSubmit} disabled={isBusy}>
            {editing ? "Update" : "Create"}
          </Button>
          <Button variant="ghost" onClick={() => partiesQuery.refetch()} disabled={isBusy}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-bold">Parties</div>
          <div className="flex items-center gap-2">
            {role === "admin" ? (
              <div className="w-64">
                <Select label="Filter" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} options={filterOptions} />
              </div>
            ) : null}
            <div className="text-sm text-textMuted">{sorted.length} total</div>
          </div>
        </div>

        {partiesQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : partiesQuery.isError ? (
          <div className="text-sm text-danger">Failed to load parties</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Zone</th>
                  <th className="py-2 pr-3">ITS No</th>
                  <th className="py-2 pr-3">Leader</th>
                  <th className="py-2 pr-3">Party</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{p.zone_name}</td>
                    <td className="py-2 pr-3">{p.its_no}</td>
                    <td className="py-2 pr-3">{p.leader_name}</td>
                    <td className="py-2 pr-3 font-semibold">{p.party_name}</td>
                    <td className="py-2 pr-3">{p.category}</td>
                    <td className="py-2 pr-3">{p.is_active ? "Active" : "Inactive"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            setEditing(p);
                            setZoneId(String(p.zone_id));
                            setItsNo(p.its_no);
                            setLeaderName(p.leader_name);
                            setPartyName(p.party_name);
                            setCategory(p.category);
                            setIsActive(p.is_active ? "1" : "0");
                            setPassword("");
                          }}
                        >
                          Edit
                        </Button>
                        {role === "admin" ? (
                          <Button
                            variant="danger"
                            disabled={isBusy}
                            onClick={async () => {
                              await deleteParty({ id: p.id }).unwrap();
                              if (editing?.id === p.id) resetForm();
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
