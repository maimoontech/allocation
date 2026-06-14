import { useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useAppSelector } from "../../hooks/storeHooks";
import { useGetMiqaatsQuery } from "../../features/miqaats/miqaatsApi";
import { useGetSchedulesQuery } from "../../features/schedules/schedulesApi";
import { formatDateDdMmmYy } from "../../utils/formatDate";

export function MySchedulePage() {
  const user = useAppSelector((state) => state.auth.user);
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

  const rows = useMemo(
    () =>
      [...(schedulesQuery.data ?? [])]
        .filter((row) => !user?.partyId || row.party_id === user.partyId)
        .sort((a, b) => {
        const byDate = b.english_date.localeCompare(a.english_date);
        if (byDate !== 0) return byDate;
        return a.venue_name.localeCompare(b.venue_name);
        }),
    [schedulesQuery.data, user?.partyId]
  );

  function formatCoordinatorLine(name?: string | null, contact?: string | null) {
    const safeName = name?.trim();
    const safeContact = contact?.trim();
    if (safeName && safeContact) return `${safeName} - ${safeContact}`;
    if (safeName) return safeName;
    if (safeContact) return safeContact;
    return "—";
  }

  function downloadPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const partyName = user?.displayName ?? "—";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Anjuman-e-Zakereen Hussain AS. Karachi", pageWidth / 2, 34, { align: "center" });
    doc.setFontSize(16);
    doc.text(partyName, 40, 58);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      startY: 76,
      head: [[
        "Miqaat Name",
        "English Date",
        "Hijri Date",
        "Venue Name",
        "Venue Coordinator Name & Contact Number"
      ]],
      body: rows.map((row) => [
        row.miqaat_name,
        formatDateDdMmmYy(row.english_date),
        row.hijri_date || "—",
        row.venue_name,
        formatCoordinatorLine(row.venue_coordinator_name, row.venue_contact_number)
      ]),
      styles: { fontSize: 9, cellPadding: 6, valign: "middle" },
      headStyles: { fillColor: [31, 64, 104] },
      columnStyles: {
        0: { cellWidth: 170 },
        1: { cellWidth: 80 },
        2: { cellWidth: 80 },
        3: { cellWidth: 130 },
        4: { cellWidth: 220 }
      },
      margin: { left: 40, right: 40, bottom: 40 }
    });

    const suffix = miqaatId === "all" ? "all" : miqaatId;
    doc.save(`my_schedule_${suffix}.pdf`);
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">My Schedule</div>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select label="Filter by Miqaat" value={miqaatId} onChange={(e) => setMiqaatId(e.target.value)} options={miqaatOptions} />
          <div className="flex items-end gap-2">
            <Button variant="ghost" onClick={downloadPdf} disabled={rows.length === 0 || schedulesQuery.isLoading}>
              Download PDF
            </Button>
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
          <div className="text-sm text-danger">Failed to load schedule</div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <div className="text-sm text-textMuted">
            No schedule assigned yet. Ask Zonal Head/Admin to generate schedule for the selected Miqaat.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">Miqaat Name</div>
                  <div className="mt-1 font-semibold">{row.miqaat_name}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">English Date</div>
                  <div className="mt-1">{formatDateDdMmmYy(row.english_date)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">Hijri Date</div>
                  <div className="mt-1">{row.hijri_date || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">Venue Name</div>
                  <div className="mt-1">{row.venue_name}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">
                    Venue Coordinator Name & Contact Number
                  </div>
                  <div className="mt-1">
                    {formatCoordinatorLine(row.venue_coordinator_name, row.venue_contact_number)}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
