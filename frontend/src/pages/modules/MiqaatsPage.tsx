import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { formatDateDdMmmYy } from "../../utils/formatDate";
import {
  useCreateMiqaatMutation,
  useDeleteMiqaatMutation,
  useGetMiqaatsQuery,
  useUpdateMiqaatMutation,
  type Miqaat
} from "../../features/miqaats/miqaatsApi";

const activeOptions = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" }
];

export function MiqaatsPage() {
  const miqaatsQuery = useGetMiqaatsQuery();
  const [createMiqaat, createState] = useCreateMiqaatMutation();
  const [updateMiqaat, updateState] = useUpdateMiqaatMutation();
  const [deleteMiqaat, deleteState] = useDeleteMiqaatMutation();

  const [editing, setEditing] = useState<Miqaat | null>(null);
  const [name, setName] = useState("");
  const [englishDate, setEnglishDate] = useState("");
  const [hijriDate, setHijriDate] = useState("");
  const [isActive, setIsActive] = useState<string>("1");

  const isBusy = createState.isLoading || updateState.isLoading || deleteState.isLoading;

  const sorted = useMemo(() => {
    const items = miqaatsQuery.data ?? [];
    return [...items].sort((a, b) => b.english_date.localeCompare(a.english_date));
  }, [miqaatsQuery.data]);

  function resetForm() {
    setEditing(null);
    setName("");
    setEnglishDate("");
    setHijriDate("");
    setIsActive("1");
  }

  async function onSubmit() {
    if (!name.trim() || !englishDate.trim()) return;
    const payload = {
      miqaat_name: name.trim(),
      english_date: englishDate,
      hijri_date: hijriDate.trim() || null,
      is_active: isActive === "1" ? (1 as const) : (0 as const)
    };

    if (!editing) {
      await createMiqaat(payload).unwrap();
      resetForm();
      return;
    }

    await updateMiqaat({ id: editing.id, ...payload }).unwrap();
    resetForm();
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Miqaat Manager</div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-lg font-bold">{editing ? "Edit Miqaat" : "Create Miqaat"}</div>
          {editing ? (
            <Button variant="ghost" onClick={resetForm} disabled={isBusy}>
              Cancel
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label="Miqaat Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="English Date" type="date" value={englishDate} onChange={(e) => setEnglishDate(e.target.value)} />
          <Input label="Hijri Date (optional)" value={hijriDate} onChange={(e) => setHijriDate(e.target.value)} />
          <Select label="Status" value={isActive} onChange={(e) => setIsActive(e.target.value)} options={activeOptions} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={onSubmit} disabled={isBusy}>
            {editing ? "Update" : "Create"}
          </Button>
          <Button variant="ghost" onClick={() => miqaatsQuery.refetch()} disabled={isBusy}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold">Miqaats</div>
          <div className="text-sm text-textMuted">{sorted.length} total</div>
        </div>
        {miqaatsQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : miqaatsQuery.isError ? (
          <div className="text-sm text-danger">Failed to load miqaats</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Miqaat</th>
                  <th className="py-2 pr-3">Hijri</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{formatDateDdMmmYy(m.english_date)}</td>
                    <td className="py-2 pr-3 font-semibold">{m.miqaat_name}</td>
                    <td className="py-2 pr-3">{m.hijri_date ?? "—"}</td>
                    <td className="py-2 pr-3">{m.is_active ? "Active" : "Inactive"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            setEditing(m);
                            setName(m.miqaat_name);
                            setEnglishDate(m.english_date);
                            setHijriDate(m.hijri_date ?? "");
                            setIsActive(m.is_active ? "1" : "0");
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          disabled={isBusy}
                          onClick={async () => {
                            await deleteMiqaat({ id: m.id }).unwrap();
                            if (editing?.id === m.id) resetForm();
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
