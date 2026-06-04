import { useMemo, useRef, useState } from "react";
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

  const [sortKey, setSortKey] = useState<"date" | "name" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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
      if (sortKey === "date") return byString(a.english_date, b.english_date);
      if (sortKey === "name") return byString(a.miqaat_name, b.miqaat_name);
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
          <div className="flex items-center gap-2">
            <div className="text-sm text-textMuted">{sorted.length} total</div>
            <Button
              variant="ghost"
              onClick={() => {
                const el = listRef.current;
                if (!el) return;
                openPrintWindow("Miqaats", el.innerHTML);
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
                { value: "date", label: "Date" },
                { value: "name", label: "Miqaat" },
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
        {miqaatsQuery.isLoading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : miqaatsQuery.isError ? (
          <div className="text-sm text-danger">Failed to load miqaats</div>
        ) : (
          <div ref={listRef} className="overflow-auto">
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
                {pageRows.map((m) => (
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
                            window.scrollTo({ top: 0, behavior: "smooth" });
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
