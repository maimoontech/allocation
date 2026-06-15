import { useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useGetMiqaatsQuery } from "../../features/miqaats/miqaatsApi";
import { useGetSchedulesQuery } from "../../features/schedules/schedulesApi";
import { formatDateDdMmmYy } from "../../utils/formatDate";

function formatPartyContactLine(args: {
  partyName: string;
  category: string;
  leaderName?: string | null;
  itsNo?: string | null;
  contactNumber?: string | null;
  whatsappNumber?: string | null;
}) {
  const details = [];
  if (args.leaderName) details.push(`Leader: ${args.leaderName}`);
  if (args.itsNo) details.push(`ITS: ${args.itsNo}`);
  if (args.contactNumber) details.push(`Contact: ${args.contactNumber}`);
  if (args.whatsappNumber) details.push(`WhatsApp: ${args.whatsappNumber}`);
  const suffix = details.length ? `\n${details.join(" | ")}` : "";
  return `${args.partyName} (${args.category})${suffix}`;
}

export function AssignedPartiesPage() {
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

  const cards = useMemo(() => {
    const rows = schedulesQuery.data ?? [];
    const byMiqaat = new Map<number, typeof rows>();
    for (const r of rows) {
      const list = byMiqaat.get(r.miqaat_id) ?? [];
      list.push(r);
      byMiqaat.set(r.miqaat_id, list);
    }
    return Array.from(byMiqaat.entries())
      .map(([id, list]) => ({
        miqaatId: id,
        miqaatName: list[0]?.miqaat_name ?? "",
        englishDate: list[0]?.english_date ?? "",
        assignments: list
      }))
      .sort((a, b) => b.englishDate.localeCompare(a.englishDate));
  }, [schedulesQuery.data]);

  function downloadPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const venueName =
      cards.flatMap((card) => card.assignments).find((assignment) => assignment.venue_name)?.venue_name ?? "Venue";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Anjuman-e-Zakereen Hussain AS. Karachi.", pageWidth / 2, 34, { align: "center" });
    doc.text(venueName, 40, 58);

    autoTable(doc, {
      startY: 74,
      head: [["Miqaat Name", "English Date", "Hijri Date", "Party"]],
      body: cards.flatMap((card) =>
        card.assignments
          .slice()
          .sort((a, b) => a.venue_name.localeCompare(b.venue_name))
          .map((assignment) => [
            card.miqaatName,
            formatDateDdMmmYy(card.englishDate),
            assignment.hijri_date || "—",
            formatPartyContactLine({
              partyName: assignment.party_name,
              category: assignment.category,
              leaderName: assignment.party_leader_name,
              itsNo: assignment.party_its_no,
              contactNumber: assignment.party_contact_number,
              whatsappNumber: assignment.party_whatsapp_number
            })
          ])
      ),
      styles: { fontSize: 9, cellPadding: 6, valign: "middle" },
      headStyles: { fillColor: [31, 64, 104] },
      columnStyles: {
        0: { cellWidth: 240 },
        1: { cellWidth: 90 },
        2: { cellWidth: 90 },
        3: { cellWidth: 300 }
      },
      margin: { left: 40, right: 40, bottom: 40 }
    });

    const suffix = miqaatId === "all" ? "all" : miqaatId;
    doc.save(`assigned_parties_${suffix}.pdf`);
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Venue Assigned Parties</div>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label="Filter by Miqaat"
            value={miqaatId}
            onChange={(e) => setMiqaatId(e.target.value)}
            options={miqaatOptions}
          />
          <div className="flex items-end gap-2">
            <Button variant="ghost" onClick={downloadPdf} disabled={cards.length === 0 || schedulesQuery.isLoading}>
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
          <div className="text-sm text-danger">Failed to load assigned parties</div>
        </Card>
      ) : cards.length === 0 ? (
        <Card>
          <div className="text-sm text-textMuted">
            No assigned parties yet. Ask Admin/Zonal Head to generate schedule for your venue.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <Card key={c.miqaatId}>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-bold">{c.miqaatName}</div>
                  <div className="text-sm text-textMuted">{formatDateDdMmmYy(c.englishDate)}</div>
                </div>
                <div className="text-sm text-textMuted">{c.assignments.length} assignment(s)</div>
              </div>

              <div className="mt-3 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3">Venue</th>
                      <th className="py-2 pr-3">Party</th>
                      <th className="py-2 pr-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.assignments
                      .slice()
                      .sort((a, b) => a.venue_name.localeCompare(b.venue_name))
                      .map((a) => (
                        <tr key={a.id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-semibold">{a.venue_name}</td>
                          <td className="py-2 pr-3">
                            <div>{a.party_name} <span className="text-textMuted">({a.category})</span></div>
                            {a.party_leader_name || a.party_its_no || a.party_contact_number || a.party_whatsapp_number ? (
                              <div className="text-xs text-textMuted">
                                {[
                                  a.party_leader_name ? `Leader: ${a.party_leader_name}` : "",
                                  a.party_its_no ? `ITS: ${a.party_its_no}` : "",
                                  a.party_contact_number ? `Contact: ${a.party_contact_number}` : "",
                                  a.party_whatsapp_number ? `WhatsApp: ${a.party_whatsapp_number}` : ""
                                ]
                                  .filter(Boolean)
                                  .join(" | ")}
                              </div>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3">
                            <Link
                              className="text-secondary underline"
                              to={`/attendance-rating?miqaat_id=${a.miqaat_id}`}
                            >
                              Mark Attendance
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
