import { useMemo, useRef, useState } from "react";
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
  useDeleteSchedulesByScopeMutation,
  useGenerateScheduleMutation,
  useGetSchedulesQuery,
  useUpdateScheduleMutation,
  type ScheduleRow
} from "../../features/schedules/schedulesApi";

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
  const [deleteSchedulesByScope, deleteScopeState] = useDeleteSchedulesByScopeMutation();

  const [overwrite, setOverwrite] = useState<string>("0");
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [editVenueId, setEditVenueId] = useState<string>("");
  const [editPartyId, setEditPartyId] = useState<string>("");

  const isBusy = generateState.isLoading || updateState.isLoading || deleteState.isLoading || deleteScopeState.isLoading;

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

  const [sortKey, setSortKey] = useState<"miqaat" | "zone" | "mohallah" | "venue" | "party" | "manual">("miqaat");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState<string>("25");
  const [page, setPage] = useState<number>(1);
  const listRef = useRef<HTMLDivElement>(null);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      const byString = (av: string | null | undefined, bv: string | null | undefined) =>
        String(av ?? "").localeCompare(String(bv ?? "")) * dir;
      const byNumber = (av: number | null | undefined, bv: number | null | undefined) =>
        ((Number(av ?? 0) || 0) - (Number(bv ?? 0) || 0)) * dir;
      if (sortKey === "miqaat") return byString(a.english_date, b.english_date);
      if (sortKey === "zone") return byString(a.zone_name, b.zone_name);
      if (sortKey === "mohallah") return byString(a.mohallah_name, b.mohallah_name);
      if (sortKey === "venue") return byString(a.venue_name, b.venue_name);
      if (sortKey === "party") return byString(a.party_name, b.party_name);
      return byNumber(a.is_manual ? 1 : 0, b.is_manual ? 1 : 0);
    });
    return copy;
  }, [rows, sortDir, sortKey]);

  const pageSizeNumber = Math.max(1, Number(pageSize) || 25);
  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSizeNumber));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * pageSizeNumber;
  const endIndex = Math.min(startIndex + pageSizeNumber, total);
  const pageRows = useMemo(() => sortedRows.slice(startIndex, endIndex), [endIndex, sortedRows, startIndex]);

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

  async function onDeleteSelectedSchedule() {
    const mId = Number(miqaatId);
    const zId = role === "zonal_head" ? user?.zoneId : Number(zoneId);
    if (!Number.isFinite(mId) || mId <= 0) return;
    if (!Number.isFinite(zId) || !zId) return;

    const confirmed = window.confirm("Delete generated schedules for the selected Miqaat and selected Zone only?");
    if (!confirmed) return;

    await deleteSchedulesByScope({
      miqaat_id: mId,
      zone_id: role === "admin" ? zId : undefined
    }).unwrap();

    schedulesQuery.refetch();
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Schedules</div>

      <Card>
        <div className="mb-3 text-lg font-bold">Generate Schedule</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select
            label="Miqaat"
            value={miqaatId}
            onChange={(e) => {
              setMiqaatId(e.target.value);
              setPage(1);
            }}
            options={miqaatOptions}
          />
          {role === "admin" ? (
            <Select
              label="Zone"
              value={zoneId}
              onChange={(e) => {
                setZoneId(e.target.value);
                setPage(1);
              }}
              options={zoneOptions}
            />
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
          <Button
            variant="danger"
            onClick={onDeleteSelectedSchedule}
            disabled={isBusy || !effectiveMiqaatId || !effectiveZoneId}
          >
            {deleteScopeState.isLoading ? "Deleting..." : "Delete Selected"}
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
          <div className="flex items-center gap-2">
            <div className="text-sm text-textMuted">{rows.length} rows</div>
            <Button
              variant="ghost"
              onClick={() => {
                const el = listRef.current;
                if (!el) return;
                openPrintWindow("Schedule List", el.innerHTML);
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
                { value: "miqaat", label: "Miqaat" },
                { value: "zone", label: "Zone" },
                { value: "mohallah", label: "Mohallah" },
                { value: "venue", label: "Venue" },
                { value: "party", label: "Party" },
                { value: "manual", label: "Manual" }
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
            <Button variant="ghost" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
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

        {schedulesQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : schedulesQuery.isError ? (
          <div className="text-sm text-danger">Failed to load schedules</div>
        ) : (
          <div ref={listRef} className="overflow-auto">
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
                {pageRows.map((r) => (
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
