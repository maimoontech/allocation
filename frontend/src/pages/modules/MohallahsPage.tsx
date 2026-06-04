import { useMemo, useRef, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useGetZonesQuery } from "../../features/zones/zonesApi";
import {
  useCreateMohallahMutation,
  useDeleteMohallahMutation,
  useGetMohallahsQuery,
  useUpdateMohallahMutation,
  type Mohallah
} from "../../features/mohallahs/mohallahsApi";

function escapeHtml(text: string) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openPrintWindow(title: string, bodyHtml: string) {
  const safeTitle = escapeHtml(title);
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 16px; color: #111; }
      h2 { margin: 0 0 12px 0; font-size: 18px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #cfcfcf; padding: 6px 8px; font-size: 12px; vertical-align: top; }
      th { background: #f3f3f3; text-align: left; }
    </style>
  </head>
  <body>
    <h2>${safeTitle}</h2>
    ${bodyHtml}
  </body>
</html>`;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    window.alert("Popup blocked. Please allow popups and try again.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  window.setTimeout(() => {
    try {
      w.print();
    } catch {}
  }, 200);
}

export function MohallahsPage() {
  const zonesQuery = useGetZonesQuery();
  const [zoneFilter, setZoneFilter] = useState<string>("all");

  const mohallahsQuery = useGetMohallahsQuery(
    zoneFilter === "all" ? undefined : { zone_id: Number(zoneFilter) }
  );
  const [createMohallah, createState] = useCreateMohallahMutation();
  const [updateMohallah, updateState] = useUpdateMohallahMutation();
  const [deleteMohallah, deleteState] = useDeleteMohallahMutation();

  const [editing, setEditing] = useState<Mohallah | null>(null);
  const [zoneId, setZoneId] = useState<string>("");
  const [mohallahName, setMohallahName] = useState("");
  const [coordinatorName, setCoordinatorName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
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
    const items = mohallahsQuery.data ?? [];
    return [...items].sort((a, b) => {
      const z = a.zone_name.localeCompare(b.zone_name);
      if (z !== 0) return z;
      return a.mohallah_name.localeCompare(b.mohallah_name);
    });
  }, [mohallahsQuery.data]);

  const [sortKey, setSortKey] = useState<"zone" | "mohallah" | "coordinator" | "contact">("zone");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<string>("25");
  const [page, setPage] = useState<number>(1);
  const listRef = useRef<HTMLDivElement>(null);

  const sortedAndSorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const copy = [...sorted];
    copy.sort((a, b) => {
      const byString = (av: string | null | undefined, bv: string | null | undefined) =>
        String(av ?? "").localeCompare(String(bv ?? "")) * dir;
      if (sortKey === "zone") {
        const z = byString(a.zone_name, b.zone_name);
        if (z !== 0) return z;
        return byString(a.mohallah_name, b.mohallah_name);
      }
      if (sortKey === "mohallah") return byString(a.mohallah_name, b.mohallah_name);
      if (sortKey === "coordinator") return byString(a.coordinator_name, b.coordinator_name);
      return byString(a.contact_number, b.contact_number);
    });
    return copy;
  }, [sorted, sortDir, sortKey]);

  const pageSizeNumber = Math.max(1, Number(pageSize) || 25);
  const total = sortedAndSorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSizeNumber));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * pageSizeNumber;
  const endIndex = Math.min(startIndex + pageSizeNumber, total);
  const pageRows = useMemo(
    () => sortedAndSorted.slice(startIndex, endIndex),
    [endIndex, sortedAndSorted, startIndex]
  );

  function resetForm() {
    setEditing(null);
    setZoneId("");
    setMohallahName("");
    setCoordinatorName("");
    setContactNumber("");
    setWhatsappNumber("");
    setPassword("");
  }

  async function onSubmit() {
    const finalZoneId = Number(zoneId);
    if (!Number.isFinite(finalZoneId) || finalZoneId <= 0) return;
    if (!mohallahName.trim() || !coordinatorName.trim()) return;
    if (!editing && !password.trim()) return;

    if (!editing) {
      await createMohallah({
        zone_id: finalZoneId,
        mohallah_name: mohallahName.trim(),
        coordinator_name: coordinatorName.trim(),
        contact_number: contactNumber.trim() || null,
        whatsapp_number: whatsappNumber.trim() || null,
        password
      }).unwrap();
      resetForm();
      return;
    }

    await updateMohallah({
      id: editing.id,
      zone_id: finalZoneId,
      mohallah_name: mohallahName.trim(),
      coordinator_name: coordinatorName.trim(),
      contact_number: contactNumber.trim() || null,
      whatsapp_number: whatsappNumber.trim() || null,
      password: password.trim() ? password : undefined
    }).unwrap();
    resetForm();
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Mohallah Manager</div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-lg font-bold">{editing ? "Edit Mohallah" : "Create Mohallah"}</div>
          {editing ? (
            <Button variant="ghost" onClick={resetForm} disabled={isBusy}>
              Cancel
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select label="Zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} options={zoneOptions} />
          <Input label="Mohallah Name" value={mohallahName} onChange={(e) => setMohallahName(e.target.value)} />
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
          <Button variant="ghost" onClick={() => mohallahsQuery.refetch()} disabled={isBusy}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-bold">Mohallahs</div>
          <div className="flex items-center gap-2">
            <div className="w-64">
              <Select
                label="Filter"
                value={zoneFilter}
                onChange={(e) => {
                  setZoneFilter(e.target.value);
                  setPage(1);
                }}
                options={filterOptions}
              />
            </div>
            <div className="text-sm text-textMuted">{sorted.length} total</div>
            <Button
              variant="ghost"
              onClick={() => {
                const el = listRef.current;
                if (!el) return;
                openPrintWindow("Mohallahs", el.innerHTML);
              }}
            >
              Print
            </Button>
          </div>
        </div>

        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Select
              label="Sort By"
              value={sortKey}
              onChange={(e) => {
                setSortKey(e.target.value as any);
                setPage(1);
              }}
              options={[
                { value: "zone", label: "Zone" },
                { value: "mohallah", label: "Mohallah" },
                { value: "coordinator", label: "Coordinator" },
                { value: "contact", label: "Contact" }
              ]}
            />
            <Select
              label="Order"
              value={sortDir}
              onChange={(e) => {
                setSortDir(e.target.value as any);
                setPage(1);
              }}
              options={[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" }
              ]}
            />
            <Select
              label="Rows"
              value={pageSize}
              onChange={(e) => {
                setPageSize(e.target.value);
                setPage(1);
              }}
              options={[
                { value: "10", label: "10" },
                { value: "25", label: "25" },
                { value: "50", label: "50" },
                { value: "100", label: "100" }
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-textMuted">
              Showing {total === 0 ? 0 : startIndex + 1}-{endIndex} of {total}
            </div>
            <Button
              variant="ghost"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <div className="text-sm font-semibold">
              Page {currentPage} / {totalPages}
            </div>
            <Button
              variant="ghost"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>

        {mohallahsQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : mohallahsQuery.isError ? (
          <div className="text-sm text-danger">Failed to load mohallahs</div>
        ) : (
          <div ref={listRef} className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Zone</th>
                  <th className="py-2 pr-3">Mohallah</th>
                  <th className="py-2 pr-3">Coordinator</th>
                  <th className="py-2 pr-3">Contact</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{m.zone_name}</td>
                    <td className="py-2 pr-3 font-semibold">{m.mohallah_name}</td>
                    <td className="py-2 pr-3">{m.coordinator_name}</td>
                    <td className="py-2 pr-3">{m.contact_number ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            setEditing(m);
                            setZoneId(String(m.zone_id));
                            setMohallahName(m.mohallah_name);
                            setCoordinatorName(m.coordinator_name);
                            setContactNumber(m.contact_number ?? "");
                            setWhatsappNumber(m.whatsapp_number ?? "");
                            setPassword("");
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          disabled={isBusy}
                          onClick={async () => {
                            await deleteMohallah({ id: m.id }).unwrap();
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
