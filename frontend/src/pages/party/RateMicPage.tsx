import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { useGetMiqaatsQuery } from "../../features/miqaats/miqaatsApi";
import { useSubmitPartyMicRatingMutation } from "../../features/ratings/ratingsApi";
import { useGetSchedulesQuery } from "../../features/schedules/schedulesApi";
import { formatDateDdMmmYy } from "../../utils/formatDate";

type FormState = {
  score: number;
  comments: string;
};

function clampScore(n: number) {
  if (!Number.isFinite(n)) return 1;
  if (n < 1) return 1;
  if (n > 10) return 10;
  return n;
}

function ScoreRow({
  value,
  onChange
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <div className="font-semibold">Mic / Audio Score</div>
        <div className="text-textMuted">{value}</div>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(clampScore(Number(e.target.value)))}
        className="w-full"
      />
    </div>
  );
}

export function RateMicPage() {
  const miqaatsQuery = useGetMiqaatsQuery();
  const [submit, submitState] = useSubmitPartyMicRatingMutation();
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

  const rows = useMemo(() => {
    const list = schedulesQuery.data ?? [];
    return [...list].sort((a, b) => {
      const d = b.english_date.localeCompare(a.english_date);
      if (d !== 0) return d;
      const v = a.venue_name.localeCompare(b.venue_name);
      if (v !== 0) return v;
      return a.mohallah_name.localeCompare(b.mohallah_name);
    });
  }, [schedulesQuery.data]);

  const [forms, setForms] = useState<Record<number, FormState>>({});
  const [rowStatus, setRowStatus] = useState<Record<number, string | null>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  function getForm(scheduleId: number) {
    return forms[scheduleId] ?? { score: 5, comments: "" };
  }

  function setForm(scheduleId: number, next: FormState) {
    setForms((prev) => ({ ...prev, [scheduleId]: next }));
  }

  async function submitRow(scheduleId: number) {
    const f = getForm(scheduleId);
    setSubmittingId(scheduleId);
    setRowStatus((prev) => ({ ...prev, [scheduleId]: null }));
    try {
      await submit({
        schedule_id: scheduleId,
        score: f.score,
        comments: f.comments.trim() ? f.comments.trim() : null
      }).unwrap();
      setRowStatus((prev) => ({ ...prev, [scheduleId]: "Saved successfully." }));
    } catch (err: any) {
      const message =
        err?.data?.message ||
        err?.error ||
        (typeof err?.message === "string" ? err.message : null) ||
        "Failed to save rating.";
      setRowStatus((prev) => ({ ...prev, [scheduleId]: String(message) }));
    } finally {
      setSubmittingId((prev) => (prev === scheduleId ? null : prev));
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Rate Venue (Mic/Audio)</div>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label="Filter by Miqaat"
            value={miqaatId}
            onChange={(e) => setMiqaatId(e.target.value)}
            options={miqaatOptions}
          />
          <div className="flex items-end gap-2">
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
          <div className="text-sm text-textMuted">No venue assignments found for your party.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const f = getForm(r.id);
            const isBusy = submitState.isLoading || submittingId === r.id;
            const status = rowStatus[r.id] ?? null;
            const isSuccess = status === "Saved successfully.";
            return (
              <Card key={r.id}>
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-lg font-bold">{r.venue_name}</div>
                    <div className="text-sm text-textMuted">
                      {formatDateDdMmmYy(r.english_date)} - {r.miqaat_name} • {r.mohallah_name} ({r.zone_name})
                    </div>
                  </div>
                  <div className="text-sm text-textMuted">{r.is_manual ? "Manual Assignment" : "Auto Assignment"}</div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3">
                  <ScoreRow value={f.score} onChange={(v) => setForm(r.id, { ...f, score: v })} />
                  <Input
                    label="Comments (optional)"
                    value={f.comments}
                    onChange={(e) => setForm(r.id, { ...f, comments: e.target.value })}
                    disabled={isBusy}
                  />
                </div>

                <div className="mt-3 flex gap-2">
                  <Button disabled={isBusy} onClick={() => submitRow(r.id)}>
                    {isBusy ? "Saving..." : "Save Rating"}
                  </Button>
                </div>
                {status ? (
                  <div className={`mt-2 text-sm ${isSuccess ? "text-secondary" : "text-danger"}`}>{status}</div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
