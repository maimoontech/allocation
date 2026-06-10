import { useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useAppSelector } from "../../hooks/storeHooks";
import { resolveApiUrl } from "../../features/api/api";
import { useGetZonesQuery } from "../../features/zones/zonesApi";
import { useGetMiqaatsQuery } from "../../features/miqaats/miqaatsApi";
import { useGetPartiesQuery } from "../../features/parties/partiesApi";
import { formatDateDdMmmYy } from "../../utils/formatDate";
import {
  useGetAttendanceReportQuery,
  useGetManuallyEditedQuery,
  useGetMiqaatScheduleQuery,
  useGetPartyHistoryQuery,
  useGetPerformanceSummaryQuery,
  useGetPerformanceTrendQuery,
  useGetQuarterlyReviewQuery,
  useGetStatusSummaryQuery,
  useGetZoneScheduleSummaryQuery
} from "../../features/reports/reportsApi";

function safeRefetch(query: any) {
  if (!query) return;
  if (query.isUninitialized) return;
  if (typeof query.refetch !== "function") return;
  query.refetch();
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timestampForFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function normalizeFilenamePart(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildExportHtmlDocument(args: {
  title: string;
  metaLines: string[];
  bodyHtml: string;
  hintLine?: string;
}) {
  const { title, metaLines, bodyHtml, hintLine } = args;
  const safeTitle = escapeHtml(title);
  const safeMeta = metaLines.filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  const safeHint = hintLine ? `<div style="margin-top:6px;color:#555;">${escapeHtml(hintLine)}</div>` : "";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 16px; color: #111; }
      h2 { margin: 0 0 6px 0; font-size: 18px; }
      .meta { font-size: 12px; margin-bottom: 12px; color: #333; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #cfcfcf; padding: 6px 8px; font-size: 12px; vertical-align: top; }
      th { background: #f3f3f3; text-align: left; }
    </style>
  </head>
  <body>
    <h2>${safeTitle}</h2>
    <div class="meta">
      ${safeMeta}
      ${safeHint}
    </div>
    ${bodyHtml}
  </body>
</html>`;
}

function openPrintWindow(args: {
  title: string;
  metaLines: string[];
  bodyHtml: string;
  hintLine?: string;
  autoPrint: boolean;
}) {
  const html = buildExportHtmlDocument(args);
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) throw new Error("Popup blocked. Please allow popups and try again.");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  if (args.autoPrint) {
    window.setTimeout(() => {
      try {
        w.print();
      } catch {
      }
    }, 250);
  }
}

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

function downloadExcelFromElement(args: { title: string; metaLines: string[]; filenameBase: string; element: HTMLElement }) {
  const html = buildExportHtmlDocument({
    title: args.title,
    metaLines: args.metaLines,
    bodyHtml: args.element.innerHTML
  });
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const filename = `${normalizeFilenamePart(args.filenameBase || args.title)}_${timestampForFilename()}.xls`;
  downloadBlobFile(filename, blob);
}

function venueColumnKey(r: { zone_name: string; mohallah_name: string; venue_name: string }) {
  return `${r.zone_name}||${r.mohallah_name}||${r.venue_name}`;
}

function miqaatTitleLabel(miqaat: { miqaat_name: string; english_date: string } | undefined, fallbackId: string) {
  return miqaat ? `${formatDateDdMmmYy(miqaat.english_date)} - ${miqaat.miqaat_name}` : `Miqaat #${fallbackId}`;
}

type MiqaatScheduleExportRow = {
  zone_name: string;
  mohallah_name: string;
  venue_name: string;
  party_name: string;
  category: string;
  is_manual: 0 | 1;
};

function normalizeExportRows(rows: MiqaatScheduleExportRow[]) {
  const seen = new Set<string>();
  const deduped: MiqaatScheduleExportRow[] = [];
  for (const row of rows) {
    const key = [
      row.zone_name,
      row.mohallah_name,
      row.venue_name,
      row.party_name,
      row.category
    ].join("||");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped.sort((a, b) => {
    const byZone = a.zone_name.localeCompare(b.zone_name);
    if (byZone !== 0) return byZone;
    const byMohallah = a.mohallah_name.localeCompare(b.mohallah_name);
    if (byMohallah !== 0) return byMohallah;
    const byVenue = a.venue_name.localeCompare(b.venue_name);
    if (byVenue !== 0) return byVenue;
    return a.party_name.localeCompare(b.party_name);
  });
}

function buildVenueDisplayLabels(rows: MiqaatScheduleExportRow[]) {
  const metaByKey = new Map<string, { zone: string; mohallah: string; venue: string }>();
  for (const r of rows) {
    const key = venueColumnKey(r);
    if (!metaByKey.has(key)) metaByKey.set(key, { zone: r.zone_name, mohallah: r.mohallah_name, venue: r.venue_name });
  }

  const venueNameCounts = new Map<string, number>();
  for (const m of metaByKey.values()) {
    venueNameCounts.set(m.venue, (venueNameCounts.get(m.venue) ?? 0) + 1);
  }

  const baseLabelByKey = new Map<string, string>();
  for (const [key, m] of metaByKey.entries()) {
    const count = venueNameCounts.get(m.venue) ?? 0;
    baseLabelByKey.set(key, count > 1 ? `${m.venue} (${m.mohallah})` : m.venue);
  }

  const baseLabelCounts = new Map<string, number>();
  for (const label of baseLabelByKey.values()) {
    baseLabelCounts.set(label, (baseLabelCounts.get(label) ?? 0) + 1);
  }

  const finalLabelByKey = new Map<string, string>();
  for (const [key, m] of metaByKey.entries()) {
    const base = baseLabelByKey.get(key) ?? m.venue;
    const count = baseLabelCounts.get(base) ?? 0;
    finalLabelByKey.set(key, count > 1 ? `${m.venue} (${m.mohallah}, ${m.zone})` : base);
  }

  return { metaByKey, labelByKey: finalLabelByKey };
}

function buildBulkMiqaatVenuePartyGridHtml(args: {
  miqaatTitles: Record<string, string>;
  rowsByMiqaatId: Record<string, MiqaatScheduleExportRow[]>;
}) {
  const allRows = Object.values(args.rowsByMiqaatId).flat();
  const { labelByKey } = buildVenueDisplayLabels(allRows);
  const venueKeys = Array.from(labelByKey.keys()).sort((a, b) => a.localeCompare(b));

  const thead = `<thead>
    <tr>
      <th style="min-width: 180px;">Miqaat</th>
      ${venueKeys.map((k) => `<th style="min-width: 180px;">${escapeHtml(labelByKey.get(k) ?? "")}</th>`).join("")}
    </tr>
  </thead>`;

  const tbodyLines: string[] = [];
  const miqaatIds = Object.keys(args.rowsByMiqaatId);

  for (const miqaatId of miqaatIds) {
    const title = args.miqaatTitles[miqaatId] ?? `Miqaat #${miqaatId}`;
    const rows = args.rowsByMiqaatId[miqaatId] ?? [];

    const partiesByVenue = new Map<string, string[]>();
    for (const r of rows) {
      const vKey = venueColumnKey(r);
      const list = partiesByVenue.get(vKey) ?? [];
      list.push(`${r.party_name} (${r.category})`);
      partiesByVenue.set(vKey, list);
    }

    const blockRows = Math.max(1, ...venueKeys.map((k) => (partiesByVenue.get(k)?.length ?? 0)));

    for (let i = 0; i < blockRows; i += 1) {
      const cells = venueKeys
        .map((k) => {
          const value = partiesByVenue.get(k)?.[i] ?? "";
          return `<td>${escapeHtml(value)}</td>`;
        })
        .join("");

      if (i === 0) {
        tbodyLines.push(`<tr>
          <td rowspan="${blockRows}" style="background:#e7e7e7;font-weight:bold;vertical-align:middle;">${escapeHtml(title)}</td>
          ${cells}
        </tr>`);
      } else {
        tbodyLines.push(`<tr>${cells}</tr>`);
      }
    }
  }

  return `<table>${thead}<tbody>${tbodyLines.join("")}</tbody></table>`;
}

function buildBulkMiqaatVenuePartyGridModel(args: {
  miqaatTitles: Record<string, string>;
  rowsByMiqaatId: Record<string, MiqaatScheduleExportRow[]>;
}) {
  const allRows = Object.values(args.rowsByMiqaatId).flat();
  const { labelByKey } = buildVenueDisplayLabels(allRows);
  const venueKeys = Array.from(labelByKey.keys()).sort((a, b) => a.localeCompare(b));
  const venueLabels = venueKeys.map((k) => labelByKey.get(k) ?? "");

  const miqaatIds = Object.keys(args.rowsByMiqaatId);
  const groups = miqaatIds.map((miqaatId) => {
    const title = args.miqaatTitles[miqaatId] ?? `Miqaat #${miqaatId}`;
    const rows = args.rowsByMiqaatId[miqaatId] ?? [];

    const partiesByVenue = new Map<string, string[]>();
    for (const r of rows) {
      const vKey = venueColumnKey(r);
      const list = partiesByVenue.get(vKey) ?? [];
      list.push(`${r.party_name} (${r.category})`);
      partiesByVenue.set(vKey, list);
    }

    const blockRows = Math.max(1, ...venueKeys.map((k) => (partiesByVenue.get(k)?.length ?? 0)));
    const grid = Array.from({ length: blockRows }, (_, idx) => venueKeys.map((k) => partiesByVenue.get(k)?.[idx] ?? ""));
    return { miqaatId, title, blockRows, grid };
  });

  return { venueKeys, venueLabels, groups };
}

function IconExcel({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 12h10" />
      <path d="M8 16h10" />
      <path d="M11 10v10" />
    </svg>
  );
}

function IconPdf({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
      <path d="M16 13l2 2-2 2" />
    </svg>
  );
}

function IconPrint({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 8V3h10v5" />
      <path d="M6 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v7H7z" />
      <path d="M18 12h0" />
    </svg>
  );
}

function IconPlus({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconClear({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M7 6l1 14h8l1-14" />
    </svg>
  );
}

function ReportCard(props: {
  title: string;
  filenameBase: string;
  metaLines: string[];
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  const disabled = props.disabled ?? false;

  function getContentEl() {
    const el = contentRef.current;
    if (!el) throw new Error("Report content not available.");
    return el;
  }

  return (
    <Card>
      <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="text-lg font-bold">{props.title}</div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            className="px-3"
            disabled={disabled}
            aria-label="Download Excel"
            title="Download Excel"
            onClick={() => {
              try {
                const el = getContentEl();
                downloadExcelFromElement({
                  title: props.title,
                  metaLines: props.metaLines,
                  filenameBase: props.filenameBase,
                  element: el
                });
              } catch (e: any) {
                window.alert(String(e?.message ?? e));
              }
            }}
          >
            <IconExcel />
          </Button>
          <Button
            variant="ghost"
            className="px-3"
            disabled={disabled}
            aria-label="Download PDF"
            title="Download PDF"
            onClick={() => {
              try {
                const el = getContentEl();
                openPrintWindow({
                  title: props.title,
                  metaLines: props.metaLines,
                  bodyHtml: el.innerHTML,
                  hintLine: "Tip: choose “Save as PDF” in the print dialog.",
                  autoPrint: true
                });
              } catch (e: any) {
                window.alert(String(e?.message ?? e));
              }
            }}
          >
            <IconPdf />
          </Button>
          <Button
            variant="ghost"
            className="px-3"
            disabled={disabled}
            aria-label="Print"
            title="Print"
            onClick={() => {
              try {
                const el = getContentEl();
                openPrintWindow({
                  title: props.title,
                  metaLines: props.metaLines,
                  bodyHtml: el.innerHTML,
                  autoPrint: true
                });
              } catch (e: any) {
                window.alert(String(e?.message ?? e));
              }
            }}
          >
            <IconPrint />
          </Button>
        </div>
      </div>
      <div ref={contentRef}>{props.children}</div>
    </Card>
  );
}

export function ReportsPage() {
  const user = useAppSelector((s) => s.auth.user);
  const token = useAppSelector((s) => s.auth.token);
  const role = user?.role ?? "admin";

  const zonesQuery = useGetZonesQuery(undefined, { skip: role !== "admin" });
  const miqaatsQuery = useGetMiqaatsQuery();
  const partiesQuery = useGetPartiesQuery(undefined);

  const [zoneId, setZoneId] = useState<string>("all");
  const [miqaatId, setMiqaatId] = useState<string>("");
  const [partyId, setPartyId] = useState<string>("");
  const now = new Date();
  const initialYear = now.getFullYear();
  const initialQuarter = Math.floor(now.getMonth() / 3) + 1;
  const [year, setYear] = useState<string>(String(initialYear));
  const [quarter, setQuarter] = useState<string>(String(initialQuarter));

  const effectiveZoneId = role === "zonal_head" ? user?.zoneId : zoneId === "all" ? undefined : Number(zoneId);

  const statusQuery = useGetStatusSummaryQuery(effectiveZoneId ? { zone_id: effectiveZoneId } : undefined);
  const miqaatScheduleQuery = useGetMiqaatScheduleQuery(
    miqaatId ? { miqaat_id: Number(miqaatId), zone_id: effectiveZoneId } : (undefined as any),
    { skip: !miqaatId }
  );
  const zoneScheduleQuery = useGetZoneScheduleSummaryQuery(
    miqaatId ? { miqaat_id: Number(miqaatId), zone_id: effectiveZoneId } : (undefined as any),
    { skip: !miqaatId }
  );
  const attendanceQuery = useGetAttendanceReportQuery(
    miqaatId ? { miqaat_id: Number(miqaatId), zone_id: effectiveZoneId } : (undefined as any),
    { skip: !miqaatId }
  );
  const performanceSummaryQuery = useGetPerformanceSummaryQuery(
    effectiveZoneId ? { zone_id: effectiveZoneId } : undefined
  );
  const performanceTrendQuery = useGetPerformanceTrendQuery(
    partyId ? { party_id: Number(partyId) } : (undefined as any),
    { skip: !partyId }
  );
  const partyHistoryQuery = useGetPartyHistoryQuery(
    partyId ? { party_id: Number(partyId) } : (undefined as any),
    { skip: !partyId }
  );
  const quarterlyQuery = useGetQuarterlyReviewQuery(
    { year: Number(year), quarter: Number(quarter), zone_id: effectiveZoneId },
    { skip: !year || !quarter }
  );
  const manuallyEditedQuery = useGetManuallyEditedQuery(
    miqaatId || effectiveZoneId ? { miqaat_id: miqaatId ? Number(miqaatId) : undefined, zone_id: effectiveZoneId } : undefined
  );

  const zoneOptions = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    const opts = zones
      .slice()
      .sort((a, b) => a.zone_name.localeCompare(b.zone_name))
      .map((z) => ({ value: String(z.id), label: z.zone_name }));
    return [{ value: "all", label: "All zones" }, ...opts];
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
    const filtered = effectiveZoneId ? items.filter((p) => p.zone_id === effectiveZoneId) : items;
    const opts = filtered
      .slice()
      .sort((a, b) => a.party_name.localeCompare(b.party_name))
      .map((p) => ({ value: String(p.id), label: `${p.party_name} (${p.zone_name})` }));
    return [{ value: "", label: "Select party" }, ...opts];
  }, [partiesQuery.data, effectiveZoneId]);

  const exportMetaLines = useMemo(() => {
    const zoneLabel =
      role === "admin"
        ? (zoneOptions.find((z) => z.value === zoneId)?.label ?? zoneId)
        : role === "zonal_head"
          ? "My Zone"
          : "—";
    const miqaatLabel = miqaatOptions.find((m) => m.value === miqaatId)?.label ?? "—";
    const partyLabel = partyOptions.find((p) => p.value === partyId)?.label ?? "—";
    return [
      `Zone: ${zoneLabel}`,
      `Miqaat: ${miqaatLabel}`,
      `Party: ${partyLabel}`,
      `Year: ${year}`,
      `Quarter: Q${quarter}`
    ];
  }, [miqaatId, miqaatOptions, partyId, partyOptions, quarter, role, year, zoneId, zoneOptions]);

  const [bulkMiqaatIds, setBulkMiqaatIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const bulkMiqaatOptions = useMemo(() => {
    const items = miqaatsQuery.data ?? [];
    return items
      .slice()
      .sort((a, b) => b.english_date.localeCompare(a.english_date))
      .map((m) => ({ id: String(m.id), label: `${formatDateDdMmmYy(m.english_date)} - ${m.miqaat_name}` }));
  }, [miqaatsQuery.data]);

  async function fetchEnvelope<T>(path: string): Promise<ApiEnvelope<T>> {
    const res = await fetch(resolveApiUrl(path), {
      headers: token ? { authorization: `Bearer ${token}` } : undefined
    });
    const raw = await res.text();
    try {
      const json = JSON.parse(raw) as ApiEnvelope<T>;
      if (!res.ok || !json.success) throw new Error(json.message || "Request failed");
      return json;
    } catch {
      const head = raw.replace(/\s+/g, " ").trim().slice(0, 200);
      throw new Error(head || "Request failed");
    }
  }

  async function printMultipleMiqaatSchedules() {
    setBulkError(null);
    const ids = bulkMiqaatIds.slice().filter(Boolean);
    if (ids.length === 0) {
      setBulkError("Select at least one Miqaat to print.");
      return;
    }
    setBulkBusy(true);
    try {
      const zoneLabel =
        role === "admin"
          ? (zoneOptions.find((z) => z.value === zoneId)?.label ?? zoneId)
          : role === "zonal_head"
            ? "My Zone"
            : "—";

      const miqaatTitles: Record<string, string> = {};
      const rowsByMiqaatId: Record<string, any[]> = {};
      const miqaats = miqaatsQuery.data ?? [];

      for (const id of ids) {
        const miqaat = miqaats.find((m) => String(m.id) === id);
        miqaatTitles[id] = miqaatTitleLabel(miqaat, id);
        const params = new URLSearchParams();
        params.set("miqaat_id", id);
        if (effectiveZoneId) params.set("zone_id", String(effectiveZoneId));
        const env = await fetchEnvelope<any[]>(`/api/v1/reports/miqaat-schedule?${params.toString()}`);
        rowsByMiqaatId[id] = normalizeExportRows(env.data as MiqaatScheduleExportRow[]);
      }

      const table = buildBulkMiqaatVenuePartyGridHtml({ miqaatTitles, rowsByMiqaatId });
      openPrintWindow({
        title: "Miqaat Schedules",
        metaLines: [`Zone: ${zoneLabel}`, `Count: ${ids.length}`],
        bodyHtml: table,
        autoPrint: true
      });
    } catch (e: any) {
      setBulkError(String(e?.message ?? e));
    } finally {
      setBulkBusy(false);
    }
  }

  async function downloadMultipleMiqaatSchedulesExcel() {
    setBulkError(null);
    const ids = bulkMiqaatIds.slice().filter(Boolean);
    if (ids.length === 0) {
      setBulkError("Select at least one Miqaat to download.");
      return;
    }
    setBulkBusy(true);
    try {
      const zoneLabel =
        role === "admin"
          ? (zoneOptions.find((z) => z.value === zoneId)?.label ?? zoneId)
          : role === "zonal_head"
            ? "My Zone"
            : "—";

      const miqaatTitles: Record<string, string> = {};
      const rowsByMiqaatId: Record<string, any[]> = {};
      const miqaats = miqaatsQuery.data ?? [];

      for (const id of ids) {
        const miqaat = miqaats.find((m) => String(m.id) === id);
        miqaatTitles[id] = miqaatTitleLabel(miqaat, id);

        const params = new URLSearchParams();
        params.set("miqaat_id", id);
        if (effectiveZoneId) params.set("zone_id", String(effectiveZoneId));
        const env = await fetchEnvelope<any[]>(`/api/v1/reports/miqaat-schedule?${params.toString()}`);
        rowsByMiqaatId[id] = normalizeExportRows(env.data as MiqaatScheduleExportRow[]);
      }

      const table = buildBulkMiqaatVenuePartyGridHtml({ miqaatTitles, rowsByMiqaatId });

      const html = buildExportHtmlDocument({
        title: "Miqaat Schedules",
        metaLines: [`Zone: ${zoneLabel}`, `Count: ${ids.length}`],
        bodyHtml: table,
        hintLine: "Columns are venues. Rows list parties under each venue for every selected Miqaat."
      });
      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const filename = `miqaat_schedules_${timestampForFilename()}.xls`;
      downloadBlobFile(filename, blob);
    } catch (e: any) {
      setBulkError(String(e?.message ?? e));
    } finally {
      setBulkBusy(false);
    }
  }

  async function downloadMultipleMiqaatSchedulesPdf() {
    setBulkError(null);
    const ids = bulkMiqaatIds.slice().filter(Boolean);
    if (ids.length === 0) {
      setBulkError("Select at least one Miqaat to download.");
      return;
    }
    setBulkBusy(true);
    try {
      const zoneLabel =
        role === "admin"
          ? (zoneOptions.find((z) => z.value === zoneId)?.label ?? zoneId)
          : role === "zonal_head"
            ? "My Zone"
            : "—";

      const miqaatTitles: Record<string, string> = {};
      const rowsByMiqaatId: Record<string, any[]> = {};
      const miqaats = miqaatsQuery.data ?? [];

      for (const id of ids) {
        const miqaat = miqaats.find((m) => String(m.id) === id);
        miqaatTitles[id] = miqaatTitleLabel(miqaat, id);
        const params = new URLSearchParams();
        params.set("miqaat_id", id);
        if (effectiveZoneId) params.set("zone_id", String(effectiveZoneId));
        const env = await fetchEnvelope<any[]>(`/api/v1/reports/miqaat-schedule?${params.toString()}`);
        rowsByMiqaatId[id] = normalizeExportRows(env.data as MiqaatScheduleExportRow[]);
      }

      const matrix = buildBulkMiqaatVenuePartyGridModel({ miqaatTitles, rowsByMiqaatId });
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(16);
      doc.text("Miqaat Schedules", 40, 40);
      doc.setFontSize(10);
      const metaLines = [`Zone: ${zoneLabel}`, `Count: ${ids.length}`];
      metaLines.forEach((line, index) => {
        doc.text(line, 40, 60 + index * 14);
      });

      const head = [
        [
          "Miqaat",
          ...matrix.venueLabels
        ]
      ];

      const body: any[] = [];
      for (const g of matrix.groups) {
        const rowspan = Math.max(1, g.blockRows);
        for (let i = 0; i < rowspan; i += 1) {
          const rowCells = g.grid[i] ?? new Array(matrix.venueKeys.length).fill("");
          if (i === 0) body.push([{ content: g.title, rowSpan: rowspan }, ...rowCells]);
          else body.push(["", ...rowCells]);
        }
      }

      autoTable(doc, {
        startY: 115,
        head,
        body,
        styles: { fontSize: 7, cellPadding: 2, valign: "top", overflow: "linebreak" as any },
        headStyles: { fillColor: [243, 243, 243], textColor: [17, 17, 17] },
        columnStyles: { 0: { cellWidth: 130 } },
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: [0],
        margin: { left: 40, right: 40 }
      });

      const filename = `miqaat_schedules_${timestampForFilename()}.pdf`;
      doc.save(filename);
    } catch (e: any) {
      setBulkError(String(e?.message ?? e));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Reports</div>

      <Card>
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-bold">Filters</div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                safeRefetch(statusQuery);
                safeRefetch(miqaatScheduleQuery);
                safeRefetch(zoneScheduleQuery);
                safeRefetch(attendanceQuery);
                safeRefetch(performanceSummaryQuery);
                safeRefetch(performanceTrendQuery);
                safeRefetch(partyHistoryQuery);
                safeRefetch(quarterlyQuery);
                safeRefetch(manuallyEditedQuery);
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {role === "admin" ? (
            <Select label="Zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} options={zoneOptions} />
          ) : (
            <Select label="Zone" value={String(user?.zoneId ?? "")} onChange={() => {}} options={[{ value: String(user?.zoneId ?? ""), label: "My Zone" }]} />
          )}
          <Select label="Miqaat" value={miqaatId} onChange={(e) => setMiqaatId(e.target.value)} options={miqaatOptions} />
          <Select label="Party" value={partyId} onChange={(e) => setPartyId(e.target.value)} options={partyOptions} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select
            label="Year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            options={[
              { value: String(initialYear - 1), label: String(initialYear - 1) },
              { value: String(initialYear), label: String(initialYear) },
              { value: String(initialYear + 1), label: String(initialYear + 1) }
            ]}
          />
          <Select
            label="Quarter"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            options={[
              { value: "1", label: "Q1" },
              { value: "2", label: "Q2" },
              { value: "3", label: "Q3" },
              { value: "4", label: "Q4" }
            ]}
          />
          <div />
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-lg font-bold">Multi-Miqaat Schedule Report</div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={bulkBusy}
                className="px-3"
                aria-label="Clear"
                title="Clear"
                onClick={() => {
                  setBulkMiqaatIds([]);
                  setBulkError(null);
                }}
              >
                <IconClear />
              </Button>
              <Button
                variant="ghost"
                disabled={bulkBusy || !miqaatId}
                className="px-3"
                aria-label="Add Current Miqaat"
                title="Add Current Miqaat"
                onClick={() => {
                  if (!miqaatId) return;
                  setBulkError(null);
                  setBulkMiqaatIds((prev) => Array.from(new Set([...prev, miqaatId])));
                }}
              >
                <IconPlus />
              </Button>
              <Button
                disabled={bulkBusy || bulkMiqaatIds.length === 0}
                variant="ghost"
                className="px-3"
                aria-label="Download Excel"
                title="Download Excel"
                onClick={downloadMultipleMiqaatSchedulesExcel}
              >
                <IconExcel />
              </Button>
              <Button
                disabled={bulkBusy || bulkMiqaatIds.length === 0}
                variant="ghost"
                className="px-3"
                aria-label="Download PDF"
                title="Download PDF"
                onClick={downloadMultipleMiqaatSchedulesPdf}
              >
                <IconPdf />
              </Button>
              <Button
                disabled={bulkBusy || bulkMiqaatIds.length === 0}
                variant="ghost"
                className="px-3"
                aria-label="Print"
                title="Print"
                onClick={printMultipleMiqaatSchedules}
              >
                <IconPrint />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="mb-1 text-sm font-semibold">Miqaats</div>
              <div className="max-h-48 overflow-auto rounded-input border border-border bg-white p-2">
                {bulkMiqaatOptions.length === 0 ? (
                  <div className="text-sm text-textMuted">No miqaats available.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {bulkMiqaatOptions.map((m) => {
                      const checked = bulkMiqaatIds.includes(m.id);
                      return (
                        <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setBulkError(null);
                              setBulkMiqaatIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(m.id);
                                else next.delete(m.id);
                                return Array.from(next);
                              });
                            }}
                          />
                          <span>{m.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              {bulkError ? <div className="mt-2 text-sm text-danger">{bulkError}</div> : null}
              <div className="mt-1 text-xs text-textMuted">
                Tip: this report formats Miqaats as merged row blocks, with venues as columns.
              </div>
            </div>
            <div className="text-sm text-textMuted">
              Zone filter applies here too. Select multiple Miqaats, then export.
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ReportCard
          title="Status Summary"
          filenameBase="status_summary"
          metaLines={exportMetaLines}
          disabled={statusQuery.isLoading || statusQuery.isError}
        >
          {statusQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : statusQuery.isError ? (
            <div className="text-sm text-danger">Failed to load status summary</div>
          ) : (
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-textMuted">Parties</div>
                <div className="font-semibold">
                  Active: {statusQuery.data?.parties.active ?? 0} | Inactive: {statusQuery.data?.parties.inactive ?? 0}
                </div>
              </div>
              <div>
                <div className="text-textMuted">Venues</div>
                <div className="font-semibold">
                  Active: {statusQuery.data?.venues.active ?? 0} | Inactive: {statusQuery.data?.venues.inactive ?? 0}
                </div>
              </div>
            </div>
          )}
        </ReportCard>

        <ReportCard
          title="Miqaat Schedule"
          filenameBase="miqaat_schedule"
          metaLines={exportMetaLines}
          disabled={!miqaatId || miqaatScheduleQuery.isLoading || miqaatScheduleQuery.isError}
        >
          {!miqaatId ? (
            <div className="text-sm text-textMuted">Select a Miqaat to view schedule report.</div>
          ) : miqaatScheduleQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : miqaatScheduleQuery.isError ? (
            <div className="text-sm text-danger">Failed to load miqaat schedule</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3">Zone</th>
                    <th className="py-2 pr-3">Venue</th>
                    <th className="py-2 pr-3">Party</th>
                    <th className="py-2 pr-3">Manual</th>
                  </tr>
                </thead>
                <tbody>
                  {(miqaatScheduleQuery.data ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{r.zone_name}</td>
                      <td className="py-2 pr-3">
                        {r.venue_name} <span className="text-textMuted">({r.mohallah_name})</span>
                      </td>
                      <td className="py-2 pr-3 font-semibold">
                        {r.party_name} ({r.category})
                      </td>
                      <td className="py-2 pr-3">{r.is_manual ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportCard>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ReportCard
          title="Zone-wise Schedule Summary"
          filenameBase="zone_schedule_summary"
          metaLines={exportMetaLines}
          disabled={!miqaatId || zoneScheduleQuery.isLoading || zoneScheduleQuery.isError}
        >
          {!miqaatId ? (
            <div className="text-sm text-textMuted">Select a Miqaat to view zone-wise summary.</div>
          ) : zoneScheduleQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : zoneScheduleQuery.isError ? (
            <div className="text-sm text-danger">Failed to load zone schedule summary</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3">Zone</th>
                    <th className="py-2 pr-3">Venue</th>
                    <th className="py-2 pr-3">Total</th>
                    <th className="py-2 pr-3">A</th>
                    <th className="py-2 pr-3">B</th>
                    <th className="py-2 pr-3">C</th>
                    <th className="py-2 pr-3">Manual</th>
                  </tr>
                </thead>
                <tbody>
                  {(zoneScheduleQuery.data ?? []).map((r, idx) => (
                    <tr key={idx} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{r.zone_name}</td>
                      <td className="py-2 pr-3">
                        {r.venue_name} <span className="text-textMuted">({r.mohallah_name})</span>
                      </td>
                      <td className="py-2 pr-3 font-semibold">{r.total_parties}</td>
                      <td className="py-2 pr-3">{r.cat_a}</td>
                      <td className="py-2 pr-3">{r.cat_b}</td>
                      <td className="py-2 pr-3">{r.cat_c}</td>
                      <td className="py-2 pr-3">{r.manual_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportCard>

        <ReportCard
          title="Attendance Feedback Log"
          filenameBase="attendance_feedback_log"
          metaLines={exportMetaLines}
          disabled={!miqaatId || attendanceQuery.isLoading || attendanceQuery.isError}
        >
          {!miqaatId ? (
            <div className="text-sm text-textMuted">Select a Miqaat to view attendance report.</div>
          ) : attendanceQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : attendanceQuery.isError ? (
            <div className="text-sm text-danger">Failed to load attendance report</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3">Venue</th>
                    <th className="py-2 pr-3">Party</th>
                    <th className="py-2 pr-3">Attended</th>
                    <th className="py-2 pr-3">Overall</th>
                    <th className="py-2 pr-3">Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {(attendanceQuery.data ?? []).map((r) => (
                    <tr key={r.schedule_id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">
                        {r.venue_name} <span className="text-textMuted">({r.mohallah_name})</span>
                      </td>
                      <td className="py-2 pr-3 font-semibold">
                        {r.party_name} ({r.category})
                      </td>
                      <td className="py-2 pr-3">
                        {r.attended_properly === null ? "—" : r.attended_properly ? "Yes" : "No"}
                      </td>
                      <td className="py-2 pr-3">{r.overall_score ?? "—"}</td>
                      <td className="py-2 pr-3">{r.comments ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportCard>
      </div>

      <ReportCard
        title="Party Performance Ratings (Summary)"
        filenameBase="party_performance_ratings_summary"
        metaLines={exportMetaLines}
        disabled={performanceSummaryQuery.isLoading || performanceSummaryQuery.isError}
      >
        {performanceSummaryQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : performanceSummaryQuery.isError ? (
          <div className="text-sm text-danger">Failed to load performance summary</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Zone</th>
                  <th className="py-2 pr-3">Party</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Avg Overall</th>
                  <th className="py-2 pr-3">Count</th>
                </tr>
              </thead>
              <tbody>
                {(performanceSummaryQuery.data ?? []).map((r) => (
                  <tr key={r.party_id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{r.zone_name}</td>
                    <td className="py-2 pr-3 font-semibold">{r.party_name}</td>
                    <td className="py-2 pr-3">{r.category}</td>
                    <td className="py-2 pr-3">{r.avg_overall === null ? "—" : Number(r.avg_overall).toFixed(2)}</td>
                    <td className="py-2 pr-3">{r.ratings_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>

      <ReportCard
        title="Party Performance Trend"
        filenameBase="party_performance_trend"
        metaLines={exportMetaLines}
        disabled={!partyId || performanceTrendQuery.isLoading || performanceTrendQuery.isError}
      >
        {!partyId ? (
          <div className="text-sm text-textMuted">Select a Party to view performance trend.</div>
        ) : performanceTrendQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : performanceTrendQuery.isError ? (
          <div className="text-sm text-danger">Failed to load performance trend</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Miqaat</th>
                  <th className="py-2 pr-3">Avg Overall</th>
                  <th className="py-2 pr-3">Attendance (Yes)</th>
                  <th className="py-2 pr-3">Rated</th>
                </tr>
              </thead>
              <tbody>
                {(performanceTrendQuery.data?.performance_trend ?? []).map((r) => (
                  <tr key={r.miqaat_id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">
                      {formatDateDdMmmYy(r.english_date)} - {r.miqaat_name}
                    </td>
                    <td className="py-2 pr-3">{r.avg_overall === null ? "—" : Number(r.avg_overall).toFixed(2)}</td>
                    <td className="py-2 pr-3">{r.attended_count}</td>
                    <td className="py-2 pr-3">{r.rated_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>

      <ReportCard
        title="Party Assignment History"
        filenameBase="party_assignment_history"
        metaLines={exportMetaLines}
        disabled={!partyId || partyHistoryQuery.isLoading || partyHistoryQuery.isError}
      >
        {!partyId ? (
          <div className="text-sm text-textMuted">Select a Party to view venue history.</div>
        ) : partyHistoryQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : partyHistoryQuery.isError ? (
          <div className="text-sm text-danger">Failed to load party history</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Venue</th>
                  <th className="py-2 pr-3">Visits</th>
                  <th className="py-2 pr-3">First</th>
                  <th className="py-2 pr-3">Last</th>
                </tr>
              </thead>
              <tbody>
                {(partyHistoryQuery.data ?? []).map((r) => (
                  <tr key={r.venue_id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-semibold">{r.venue_name}</td>
                    <td className="py-2 pr-3">{r.visit_count}</td>
                    <td className="py-2 pr-3">{formatDateDdMmmYy(r.first_visited_at)}</td>
                    <td className="py-2 pr-3">{formatDateDdMmmYy(r.last_visited_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ReportCard
          title="Quarterly Review"
          filenameBase="quarterly_review"
          metaLines={exportMetaLines}
          disabled={quarterlyQuery.isLoading || quarterlyQuery.isError}
        >
          {quarterlyQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : quarterlyQuery.isError ? (
            <div className="text-sm text-danger">Failed to load quarterly review</div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-sm font-semibold">Best</div>
                <div className="overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3">Party</th>
                        <th className="py-2 pr-3">Zone</th>
                        <th className="py-2 pr-3">Avg</th>
                        <th className="py-2 pr-3">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(quarterlyQuery.data?.best ?? []).map((r) => (
                        <tr key={r.party_id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-semibold">
                            {r.party_name} <span className="text-textMuted">({r.category})</span>
                          </td>
                          <td className="py-2 pr-3">{r.zone_name}</td>
                          <td className="py-2 pr-3">{r.avg_overall === null ? "—" : Number(r.avg_overall).toFixed(2)}</td>
                          <td className="py-2 pr-3">{r.ratings_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm font-semibold">Worst</div>
                <div className="overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3">Party</th>
                        <th className="py-2 pr-3">Zone</th>
                        <th className="py-2 pr-3">Avg</th>
                        <th className="py-2 pr-3">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(quarterlyQuery.data?.worst ?? []).map((r) => (
                        <tr key={r.party_id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-semibold">
                            {r.party_name} <span className="text-textMuted">({r.category})</span>
                          </td>
                          <td className="py-2 pr-3">{r.zone_name}</td>
                          <td className="py-2 pr-3">{r.avg_overall === null ? "—" : Number(r.avg_overall).toFixed(2)}</td>
                          <td className="py-2 pr-3">{r.ratings_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </ReportCard>

        <ReportCard
          title="Manually Edited Schedule"
          filenameBase="manually_edited_schedule"
          metaLines={exportMetaLines}
          disabled={manuallyEditedQuery.isLoading || manuallyEditedQuery.isError}
        >
          {manuallyEditedQuery.isLoading ? (
            <div className="text-sm text-textMuted">Loading...</div>
          ) : manuallyEditedQuery.isError ? (
            <div className="text-sm text-danger">Failed to load manual edits</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Miqaat</th>
                    <th className="py-2 pr-3">Zone</th>
                    <th className="py-2 pr-3">Old</th>
                    <th className="py-2 pr-3">New</th>
                  </tr>
                </thead>
                <tbody>
                  {(manuallyEditedQuery.data ?? []).map((r) => (
                    <tr key={r.edit_id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{formatDateDdMmmYy(r.edited_at)}</td>
                      <td className="py-2 pr-3">
                        {formatDateDdMmmYy(r.english_date)} - {r.miqaat_name}
                      </td>
                      <td className="py-2 pr-3">{r.zone_name}</td>
                      <td className="py-2 pr-3">
                        {r.old_venue_name} / {r.old_party_name}
                      </td>
                      <td className="py-2 pr-3 font-semibold">
                        {r.new_venue_name} / {r.new_party_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportCard>
      </div>
    </div>
  );
}
