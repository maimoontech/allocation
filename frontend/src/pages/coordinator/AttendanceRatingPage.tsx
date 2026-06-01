import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { useGetMiqaatsQuery } from "../../features/miqaats/miqaatsApi";
import { useGetSchedulesQuery } from "../../features/schedules/schedulesApi";
import { useSubmitPerformanceRatingMutation } from "../../features/ratings/ratingsApi";
import { formatDateDdMmmYy } from "../../utils/formatDate";

type FormState = {
  attended: boolean;
  recitation: number;
  discipline: number;
  attendance: number;
  overall: number;
  comments: string;
};

function clampScore(n: number) {
  if (!Number.isFinite(n)) return 1;
  if (n < 1) return 1;
  if (n > 10) return 10;
  return n;
}

function defaultForm(): FormState {
  return { attended: false, recitation: 5, discipline: 5, attendance: 5, overall: 5, comments: "" };
}

function ScoreRow({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <div className="font-semibold">{label}</div>
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

export function AttendanceRatingPage() {
  const miqaatsQuery = useGetMiqaatsQuery();
  const [submit, submitState] = useSubmitPerformanceRatingMutation();
  const [searchParams] = useSearchParams();
  const initialMiqaat = searchParams.get("miqaat_id");

  const [miqaatId, setMiqaatId] = useState<string>(initialMiqaat ? String(initialMiqaat) : "all");
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
      return a.party_name.localeCompare(b.party_name);
    });
  }, [schedulesQuery.data]);

  const [forms, setForms] = useState<Record<number, FormState>>({});
  const [locked, setLocked] = useState<Record<number, boolean>>({});
  const [rowError, setRowError] = useState<Record<number, string | null>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  useEffect(() => {
    if (!rows.length) return;
    const nextLocked: Record<number, boolean> = {};
    const nextForms: Record<number, FormState> = {};

    for (const r of rows as any[]) {
      if (r.performance_submitted) {
        nextLocked[r.id] = true;
        nextForms[r.id] = {
          attended: Boolean(r.attended_properly),
          recitation: clampScore(Number(r.recitation_score ?? 5)),
          discipline: clampScore(Number(r.discipline_score ?? 5)),
          attendance: clampScore(Number(r.attendance_score ?? 5)),
          overall: clampScore(Number(r.overall_score ?? 5)),
          comments: String(r.performance_comments ?? "")
        };
      }
    }

    if (Object.keys(nextLocked).length) setLocked((prev) => ({ ...prev, ...nextLocked }));
    if (Object.keys(nextForms).length) setForms((prev) => ({ ...prev, ...nextForms }));
  }, [rows]);

  function getForm(scheduleId: number) {
    return forms[scheduleId] ?? defaultForm();
  }

  function setForm(scheduleId: number, next: FormState) {
    setForms((prev) => ({ ...prev, [scheduleId]: next }));
  }

  async function submitRow(scheduleId: number) {
    if (locked[scheduleId]) return;
    const confirmed = window.confirm("Are you sure? you can't change after submit");
    if (!confirmed) return;

    const f = getForm(scheduleId);
    setSubmittingId(scheduleId);
    setRowError((prev) => ({ ...prev, [scheduleId]: null }));
    try {
      await submit({
        schedule_id: scheduleId,
        attended_properly: f.attended,
        recitation: f.recitation,
        discipline: f.discipline,
        attendance: f.attendance,
        overall: f.overall,
        comments: f.comments.trim() ? f.comments.trim() : null
      }).unwrap();
      setLocked((prev) => ({ ...prev, [scheduleId]: true }));
    } catch (err: any) {
      const status = err?.status as number | undefined;
      if (status === 409) {
        setLocked((prev) => ({ ...prev, [scheduleId]: true }));
        setRowError((prev) => ({ ...prev, [scheduleId]: "Already submitted. Locked." }));
      } else {
        setRowError((prev) => ({ ...prev, [scheduleId]: "Failed to submit. Please try again." }));
      }
    } finally {
      setSubmittingId((prev) => (prev === scheduleId ? null : prev));
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-2xl font-bold">Attendance & Performance Rating</div>

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
          <div className="text-sm text-textMuted">No schedule rows found for your Mohallah.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const f = getForm(r.id);
            const isLocked = Boolean(locked[r.id]);
            const isBusy = submitState.isLoading || submittingId === r.id;
            const errMsg = rowError[r.id] ?? null;
            return (
              <Card key={r.id}>
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-lg font-bold">
                      {r.party_name} <span className="text-textMuted">({r.category})</span>
                    </div>
                    <div className="text-sm text-textMuted">
                      {formatDateDdMmmYy(r.english_date)} - {r.miqaat_name} • {r.venue_name} ({r.mohallah_name})
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={f.attended}
                      disabled={isBusy || isLocked}
                      onChange={(e) => setForm(r.id, { ...f, attended: e.target.checked })}
                    />
                    Attended Properly
                  </label>
                  <div />

                  <div className={isLocked ? "pointer-events-none opacity-60" : ""}>
                    <ScoreRow
                      label="Recitation"
                      value={f.recitation}
                      onChange={(v) => setForm(r.id, { ...f, recitation: v })}
                    />
                  </div>
                  <div className={isLocked ? "pointer-events-none opacity-60" : ""}>
                    <ScoreRow
                      label="Discipline"
                      value={f.discipline}
                      onChange={(v) => setForm(r.id, { ...f, discipline: v })}
                    />
                  </div>
                  <div className={isLocked ? "pointer-events-none opacity-60" : ""}>
                    <ScoreRow
                      label="Attendance"
                      value={f.attendance}
                      onChange={(v) => setForm(r.id, { ...f, attendance: v })}
                    />
                  </div>
                  <div className={isLocked ? "pointer-events-none opacity-60" : ""}>
                    <ScoreRow
                      label="Overall"
                      value={f.overall}
                      onChange={(v) => setForm(r.id, { ...f, overall: v })}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Input
                      label="Comments (optional)"
                      value={f.comments}
                      onChange={(e) => setForm(r.id, { ...f, comments: e.target.value })}
                      disabled={isBusy || isLocked}
                    />
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button disabled={isBusy || isLocked} onClick={() => submitRow(r.id)}>
                    {isLocked ? "Submitted" : isBusy ? "Saving..." : "Submit"}
                  </Button>
                  {isLocked ? <div className="self-center text-sm text-textMuted">Locked</div> : null}
                </div>
                {errMsg ? <div className="mt-2 text-sm text-danger">{errMsg}</div> : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
