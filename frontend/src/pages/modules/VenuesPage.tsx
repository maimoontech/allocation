import { useMemo, useRef, useState } from "react";
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

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 3l18 18" />
        <path d="M10.6 10.6a2 2 0 1 0 2.8 2.8" />
        <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9.6 4 10.9 8-0.5 1.5-1.4 2.9-2.5 4" />
        <path d="M6.2 6.2C4.5 7.5 3.3 9.2 2.6 12c1.3 4 5.4 8 9.4 8 1.7 0 3.3-0.4 4.8-1.2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.6 12C3.9 8 8 4 12 4s8.1 4 9.4 8c-1.3 4-5.4 8-9.4 8S3.9 16 2.6 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

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
  const [coordinatorName, setCoordinatorName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [password, setPassword] = useState("");
  const [minParties, setMinParties] = useState<string>("1");
  const [maxParties, setMaxParties] = useState<string>("5");
  const [isActive, setIsActive] = useState<string>("1");
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const isBusy = createState.isLoading || updateState.isLoading || deleteState.isLoading;
  const canPreviewPassword = role === "admin" || role === "zonal_head";

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

  const [sortKey, setSortKey] = useState<"zone" | "mohallah" | "venue" | "capacity" | "status">("zone");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<string>("25");
  const [page, setPage] = useState<number>(1);
  const listRef = useRef<HTMLDivElement>(null);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const copy = [...sorted];
    copy.sort((a, b) => {
      const byString = (av: string | null | undefined, bv: string | null | undefined) =>
        String(av ?? "").localeCompare(String(bv ?? "")) * dir;
      const byNumber = (av: number | null | undefined, bv: number | null | undefined) =>
        ((Number(av ?? 0) || 0) - (Number(bv ?? 0) || 0)) * dir;
      if (sortKey === "zone") {
        const z = byString(a.zone_name, b.zone_name);
        if (z !== 0) return z;
        const m = byString(a.mohallah_name, b.mohallah_name);
        if (m !== 0) return m;
        return byString(a.venue_name, b.venue_name);
      }
      if (sortKey === "mohallah") return byString(a.mohallah_name, b.mohallah_name);
      if (sortKey === "venue") return byString(a.venue_name, b.venue_name);
      if (sortKey === "capacity") return byNumber(a.max_parties, b.max_parties);
      return byNumber(a.is_active ? 1 : 0, b.is_active ? 1 : 0);
    });
    return copy;
  }, [sorted, sortDir, sortKey]);

  const pageSizeNumber = Math.max(1, Number(pageSize) || 25);
  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSizeNumber));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * pageSizeNumber;
  const endIndex = Math.min(startIndex + pageSizeNumber, total);
  const pageRows = useMemo(() => sortedRows.slice(startIndex, endIndex), [endIndex, sortedRows, startIndex]);

  function resetForm() {
    setEditing(null);
    setMohallahId("");
    setVenueName("");
    setCoordinatorName("");
    setContactNumber("");
    setWhatsappNumber("");
    setPassword("");
    setMinParties("1");
    setMaxParties("5");
    setIsActive("1");
    setFormError(null);
    setShowPassword(false);
  }

  function getErrorMessage(error: unknown) {
    if (typeof error === "string") return error;
    if (!error || typeof error !== "object") return "Failed to save venue";
    const maybeError = error as { data?: { message?: string }; error?: string };
    return maybeError.data?.message || maybeError.error || "Failed to save venue";
  }

  async function onSubmit() {
    const finalMohallahId = Number(mohallahId);
    const min = Number(minParties);
    const max = Number(maxParties);
    if (!Number.isFinite(finalMohallahId) || finalMohallahId <= 0) return;
    if (!venueName.trim()) return;
    if (!editing && !password.trim()) return;
    if (!Number.isFinite(min) || min <= 0) return;
    if (!Number.isFinite(max) || max <= 0) return;
    if (min > max) return;
    setFormError(null);
    setFormMessage(null);

    try {
      if (!editing) {
        await createVenue({
          venue_name: venueName.trim(),
          mohallah_id: finalMohallahId,
          coordinator_name: coordinatorName.trim() || null,
          contact_number: contactNumber.trim() || null,
          whatsapp_number: whatsappNumber.trim() || null,
          password,
          min_parties: min,
          max_parties: max,
          is_active: isActive === "1" ? (1 as const) : (0 as const)
        }).unwrap();
        await venuesQuery.refetch();
        resetForm();
        setFormMessage("Venue created successfully.");
        return;
      }

      await updateVenue({
        id: editing.id,
        venue_name: venueName.trim(),
        mohallah_id: finalMohallahId,
        coordinator_name: coordinatorName.trim() || null,
        contact_number: contactNumber.trim() || null,
        whatsapp_number: whatsappNumber.trim() || null,
        password: password.trim() || undefined,
        min_parties: min,
        max_parties: max,
        is_active: isActive === "1" ? (1 as const) : (0 as const)
      }).unwrap();
      await venuesQuery.refetch();
      resetForm();
      setFormMessage("Venue updated successfully.");
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
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
          <Input label="Coordinator Name" value={coordinatorName} onChange={(e) => setCoordinatorName(e.target.value)} />
          <Input label="Mobile No." value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
          <Input label="WhatsApp No." value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} />
          <label className="block text-left">
            <div className="mb-1 text-sm font-semibold">{editing ? "New Password (optional)" : "Password"}</div>
            <div className="relative">
              <input
                type={canPreviewPassword && showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={[
                  "w-full rounded-input border border-border bg-white px-3 py-2 text-sm",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  canPreviewPassword ? "pr-11" : ""
                ].join(" ")}
              />
              {canPreviewPassword ? (
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-textMuted hover:text-text"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <EyeIcon open={showPassword} />
                </button>
              ) : null}
            </div>
          </label>
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
        {formMessage ? <div className="mt-2 text-sm text-secondary">{formMessage}</div> : null}
        {formError ? <div className="mt-2 text-sm text-danger">{formError}</div> : null}
      </Card>

      <Card>
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-bold">Venues</div>
          <div className="flex items-center gap-2">
            {role === "admin" ? (
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
            ) : null}
            <div className="text-sm text-textMuted">{sorted.length} total</div>
            <Button
              variant="ghost"
              onClick={() => {
                const el = listRef.current;
                if (!el) return;
                openPrintWindow("Venues", el.innerHTML);
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
                { value: "venue", label: "Venue" },
                { value: "capacity", label: "Capacity" },
                { value: "status", label: "Status" }
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

        {venuesQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : venuesQuery.isError ? (
          <div className="text-sm text-danger">Failed to load venues</div>
        ) : (
          <div ref={listRef} className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Zone</th>
                  <th className="py-2 pr-3">Mohallah</th>
                  <th className="py-2 pr-3">Venue</th>
                  <th className="py-2 pr-3">Coordinator</th>
                  <th className="py-2 pr-3">Mobile</th>
                  <th className="py-2 pr-3">WhatsApp</th>
                  <th className="py-2 pr-3">Capacity</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{v.zone_name}</td>
                    <td className="py-2 pr-3">{v.mohallah_name}</td>
                    <td className="py-2 pr-3 font-semibold">{v.venue_name}</td>
                    <td className="py-2 pr-3">{v.coordinator_name ?? "—"}</td>
                    <td className="py-2 pr-3">{v.contact_number ?? "—"}</td>
                    <td className="py-2 pr-3">{v.whatsapp_number ?? "—"}</td>
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
                            setCoordinatorName(v.coordinator_name ?? "");
                            setContactNumber(v.contact_number ?? "");
                            setWhatsappNumber(v.whatsapp_number ?? "");
                            setPassword("");
                            setMinParties(String(v.min_parties));
                            setMaxParties(String(v.max_parties));
                            setIsActive(v.is_active ? "1" : "0");
                            window.scrollTo({ top: 0, behavior: "smooth" });
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
