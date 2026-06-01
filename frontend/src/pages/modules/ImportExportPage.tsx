import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { useAppSelector } from "../../hooks/storeHooks";
import { resolveApiUrl } from "../../features/api/api";

type ImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

type EntityKey = "zones" | "mohallahs" | "parties" | "venues" | "miqaats";

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function extractFilename(contentDisposition: string | null, fallback: string) {
  const match = contentDisposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? fallback;
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

function parseEnvelope<T>(raw: string): ApiEnvelope<T> {
  try {
    return JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    throw new Error(raw || "Request failed");
  }
}

export function ImportExportPage() {
  const token = useAppSelector((s) => s.auth.token);
  const [entity, setEntity] = useState<EntityKey>("zones");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const entities = useMemo(
    () =>
      [
        { value: "zones", label: "Zones" },
        { value: "mohallahs", label: "Mohallahs" },
        { value: "parties", label: "Parties" },
        { value: "venues", label: "Venues" },
        { value: "miqaats", label: "Miqaats" }
      ] as Array<{ value: EntityKey; label: string }>,
    []
  );

  async function fetchCsv(path: string) {
    const res = await fetch(resolveApiUrl(path), {
      headers: token ? { authorization: `Bearer ${token}` } : undefined
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Request failed");
    }
    return await res.text();
  }

  async function readCsvFile(file: File) {
    try {
      return await file.text();
    } catch (e: any) {
      if (e?.name === "NotReadableError") {
        throw new Error("Could not read the selected CSV file. Close it in Excel or another app, select it again, and retry.");
      }
      throw e;
    }
  }

  async function downloadTemplate() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const csv = await fetchCsv(`/api/v1/import-export/${entity}/template`);
      downloadTextFile(`${entity}_template.csv`, csv, "text/csv;charset=utf-8");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function downloadExport() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const csv = await fetchCsv(`/api/v1/import-export/${entity}/export`);
      downloadTextFile(`${entity}.csv`, csv, "text/csv;charset=utf-8");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    setError(null);
    setResult(null);
    if (!file) {
      setError("Please select a CSV file first.");
      return;
    }
    setBusy(true);
    try {
      const csv = await readCsvFile(file);
      const res = await fetch(resolveApiUrl(`/api/v1/import-export/${entity}/import`), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ csv })
      });
      const raw = await res.text();
      const json = parseEnvelope<ImportResult>(raw);
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Import failed");
      }
      setResult(json.data);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function downloadDatabaseBackup() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch(resolveApiUrl("/api/v1/import-export/database-backup"), {
        headers: token ? { authorization: `Bearer ${token}` } : undefined
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Backup download failed");
      }
      const blob = await res.blob();
      const filename = extractFilename(res.headers.get("content-disposition"), "database_backup.sql");
      downloadBlobFile(filename, blob);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Import / Export</div>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end">
          <Select
            label="Data Type"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value as EntityKey);
              setFile(null);
              setResult(null);
              setError(null);
            }}
            options={entities.map((e) => ({ value: e.value, label: e.label }))}
          />

          <div className="flex gap-2">
            <Button disabled={busy} onClick={downloadTemplate}>
              Download Template
            </Button>
            <Button disabled={busy} variant="ghost" onClick={downloadExport}>
              Export Data
            </Button>
          </div>

          <div className="text-sm text-textMuted">
            For Zones / Mohallahs / Parties: password is required for new records; leave blank to keep existing password unchanged.
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-lg font-bold">Database Backup</div>
            <div className="text-sm text-textMuted">Download a full SQL backup of the current database to your local machine.</div>
          </div>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={downloadDatabaseBackup}>
              {busy ? "Preparing..." : "Download Backup"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-2 text-lg font-bold">Import CSV</div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <div className="text-sm font-semibold">CSV File</div>
            <input
              className="mt-1 block w-full rounded-input border border-border bg-white px-3 py-2 text-sm"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                setResult(null);
                setError(null);
                const f = e.target.files?.[0] ?? null;
                setFile(f);
              }}
            />
            <div className="mt-1 text-xs text-textMuted">{file ? file.name : "No file selected"}</div>
          </div>
          <div className="flex gap-2">
            <Button disabled={busy || !file} onClick={importCsv}>
              {busy ? "Working..." : "Import"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setFile(null);
                setResult(null);
                setError(null);
              }}
            >
              Clear
            </Button>
          </div>
        </div>

        {error ? <div className="mt-3 text-sm text-danger">{error}</div> : null}
        {result ? (
          <div className="mt-3 space-y-2 text-sm">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded-card bg-black/5 p-3">
                <div className="text-xs text-textMuted">Inserted</div>
                <div className="text-lg font-bold">{result.inserted}</div>
              </div>
              <div className="rounded-card bg-black/5 p-3">
                <div className="text-xs text-textMuted">Updated</div>
                <div className="text-lg font-bold">{result.updated}</div>
              </div>
              <div className="rounded-card bg-black/5 p-3">
                <div className="text-xs text-textMuted">Skipped</div>
                <div className="text-lg font-bold">{result.skipped}</div>
              </div>
            </div>
            {result.errors.length ? (
              <div className="overflow-auto rounded-card border border-border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 pl-3">Row</th>
                      <th className="py-2 pr-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, idx) => (
                      <tr key={idx} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3 pl-3 font-semibold">{e.row}</td>
                        <td className="py-2 pr-3">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-textMuted">No errors.</div>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
