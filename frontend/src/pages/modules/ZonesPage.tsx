import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import {
  useCreateZoneMutation,
  useDeleteZoneMutation,
  useGetZonesQuery,
  useUpdateZoneMutation,
  type Zone
} from "../../features/zones/zonesApi";

export function ZonesPage() {
  const zonesQuery = useGetZonesQuery();
  const [createZone, createState] = useCreateZoneMutation();
  const [updateZone, updateState] = useUpdateZoneMutation();
  const [deleteZone, deleteState] = useDeleteZoneMutation();

  const [editing, setEditing] = useState<Zone | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [coordinatorName, setCoordinatorName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [password, setPassword] = useState("");

  const isBusy = createState.isLoading || updateState.isLoading || deleteState.isLoading;

  const sortedZones = useMemo(() => {
    const z = zonesQuery.data ?? [];
    return [...z].sort((a, b) => a.zone_name.localeCompare(b.zone_name));
  }, [zonesQuery.data]);

  function resetForm() {
    setEditing(null);
    setZoneName("");
    setCoordinatorName("");
    setContactNumber("");
    setWhatsappNumber("");
    setPassword("");
  }

  async function onSubmit() {
    if (!zoneName.trim() || !coordinatorName.trim()) return;
    if (!editing && !password.trim()) return;

    if (!editing) {
      await createZone({
        zone_name: zoneName.trim(),
        coordinator_name: coordinatorName.trim(),
        contact_number: contactNumber.trim() || null,
        whatsapp_number: whatsappNumber.trim() || null,
        password: password
      }).unwrap();
      resetForm();
      return;
    }

    await updateZone({
      id: editing.id,
      zone_name: zoneName.trim(),
      coordinator_name: coordinatorName.trim(),
      contact_number: contactNumber.trim() || null,
      whatsapp_number: whatsappNumber.trim() || null,
      password: password.trim() ? password : undefined
    }).unwrap();
    resetForm();
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Zone Manager</div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-lg font-bold">{editing ? "Edit Zone" : "Create Zone"}</div>
          {editing ? (
            <Button variant="ghost" onClick={resetForm} disabled={isBusy}>
              Cancel
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label="Zone Name" value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
          <Input label="Coordinator Name" value={coordinatorName} onChange={(e) => setCoordinatorName(e.target.value)} />
          <Input label="Contact Number" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
          <Input label="WhatsApp Number" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} />
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
          <Button variant="ghost" onClick={() => zonesQuery.refetch()} disabled={isBusy}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold">Zones</div>
          <div className="text-sm text-textMuted">{sortedZones.length} total</div>
        </div>

        {zonesQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : zonesQuery.isError ? (
          <div className="text-sm text-danger">Failed to load zones</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Zone</th>
                  <th className="py-2 pr-3">Coordinator</th>
                  <th className="py-2 pr-3">Contact</th>
                  <th className="py-2 pr-3">WhatsApp</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedZones.map((z) => (
                  <tr key={z.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-semibold">{z.zone_name}</td>
                    <td className="py-2 pr-3">{z.coordinator_name}</td>
                    <td className="py-2 pr-3">{z.contact_number ?? "—"}</td>
                    <td className="py-2 pr-3">{z.whatsapp_number ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            setEditing(z);
                            setZoneName(z.zone_name);
                            setCoordinatorName(z.coordinator_name);
                            setContactNumber(z.contact_number ?? "");
                            setWhatsappNumber(z.whatsapp_number ?? "");
                            setPassword("");
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          disabled={isBusy}
                          onClick={async () => {
                            await deleteZone({ id: z.id }).unwrap();
                            if (editing?.id === z.id) resetForm();
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
