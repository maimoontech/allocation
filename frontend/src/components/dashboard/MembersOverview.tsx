import { useMemo, useState } from "react";
import { Card } from "../ui/Card";
import { Select } from "../ui/Select";
import { apiErrorMessage } from "../../features/api/apiErrorMessage";
import { useGetMemberDashboardQuery } from "../../features/member/memberDashboardApi";
import type {
  MemberDashboardFilter,
  MemberFormTabStats
} from "../../features/member/memberDashboardApi";
import { useGetZonesQuery } from "../../features/zones/zonesApi";
import { useGetMohallahsQuery } from "../../features/mohallahs/mohallahsApi";

/**
 * The administrator's member dashboard (FR-112): who has got into their account, and how
 * much of the twelve-tab form they have filled in.
 *
 * TWO NUMBERS THAT LOOK LIKE ONE
 *   Signing in and choosing a password are reported separately because they come apart. Every
 *   account is issued a one-time password, so a member can sign in, meet the forced-change
 *   screen and stop. Collapsing the two would hide exactly that member - the one who tried,
 *   got stuck, and is waiting for somebody to notice. The gap between the two figures is
 *   called out in its own line whenever anyone is in it.
 *
 * SAYING WHAT THE PERCENTAGE MEANS
 *   The profile has no mandatory fields, so "complete" is a definition rather than a fact,
 *   and the definition is printed under the figure. A number whose meaning is not on the page
 *   is a number that gets quoted in a meeting and misunderstood.
 */

function Stat({
  label,
  value,
  note,
  tone = "plain"
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "plain" | "good" | "warn";
}) {
  const valueTone =
    tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : "text-textPrimary";
  return (
    <Card>
      <div className="text-sm text-textMuted">{label}</div>
      <div className={`text-3xl font-bold leading-tight ${valueTone}`}>{value}</div>
      {note ? <div className="mt-1 text-xs text-textMuted">{note}</div> : null}
    </Card>
  );
}

/** A plain proportion bar. `aria-hidden`, because the figure beside it already says this. */
function Bar({ percent, tone }: { percent: number; tone: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface" aria-hidden="true">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

/** Red below a third, amber below two thirds, green above. */
function toneFor(percent: number) {
  if (percent >= 67) return "bg-success";
  if (percent >= 34) return "bg-warning";
  return "bg-danger";
}

function TabRow({ tab }: { tab: MemberFormTabStats }) {
  return (
    <div
      role="listitem"
      className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 sm:grid-cols-[12rem_1fr_3.5rem]"
    >
      <div className="truncate text-sm">{tab.label}</div>
      <Bar percent={tab.percent} tone={toneFor(tab.percent)} />
      <div className="text-right text-sm font-semibold tabular-nums">{tab.percent}%</div>
    </div>
  );
}

const n = (value: number) => value.toLocaleString();

/** "all" means do not filter; "none" filters FOR the members who have not answered. */
const ALL = "all";
const NOT_CHOSEN = "none";

function toFilterValue(raw: string): number | "none" | undefined {
  if (raw === ALL) return undefined;
  if (raw === NOT_CHOSEN) return NOT_CHOSEN;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function MembersOverview() {
  const [zoneChoice, setZoneChoice] = useState<string>(ALL);
  const [mohallahChoice, setMohallahChoice] = useState<string>(ALL);

  const { data: zones } = useGetZonesQuery();
  // Every Mohallah, NOT only those of the chosen Zone. The two are different facts about a
  // member: Zone is their Hizb (Tab 3), Mohallah is where they live (Tab 1). A member may do
  // Zikr in one zone and live in a Mohallah belonging to another, so narrowing this list by
  // the chosen Zone would hide combinations that genuinely exist.
  const { data: mohallahs } = useGetMohallahsQuery();

  const filter: MemberDashboardFilter = useMemo(() => {
    const next: MemberDashboardFilter = {};
    const zone = toFilterValue(zoneChoice);
    const mohallah = toFilterValue(mohallahChoice);
    if (zone !== undefined) next.zone_id = zone;
    if (mohallah !== undefined) next.mohallah_id = mohallah;
    return next;
  }, [zoneChoice, mohallahChoice]);

  const zoneOptions = useMemo(
    () => [
      { value: ALL, label: "All zones" },
      { value: NOT_CHOSEN, label: "Zone not chosen yet" },
      ...(zones ?? [])
        .map((z) => ({ value: String(z.id), label: z.zone_name }))
        .sort((a, b) => a.label.localeCompare(b.label))
    ],
    [zones]
  );

  const mohallahOptions = useMemo(
    () => [
      { value: ALL, label: "All mohallahs" },
      { value: NOT_CHOSEN, label: "Mohallah not chosen yet" },
      ...(mohallahs ?? [])
        // The zone is in the label because two zones may hold a Mohallah of the same name,
        // and because it is the only way to tell them apart in a flat list.
        .map((m) => ({
          value: String(m.id),
          label: m.zone_name ? `${m.mohallah_name} (${m.zone_name})` : m.mohallah_name
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    ],
    [mohallahs]
  );

  const { data, isLoading, isError, error, refetch } = useGetMemberDashboardQuery(filter);

  const isFiltered = zoneChoice !== ALL || mohallahChoice !== ALL;
  const filterLabel = [
    zoneChoice === ALL
      ? null
      : zoneOptions.find((o) => o.value === zoneChoice)?.label ?? "a zone",
    mohallahChoice === ALL
      ? null
      : mohallahOptions.find((o) => o.value === mohallahChoice)?.label ?? "a mohallah"
  ]
    .filter(Boolean)
    .join(" · ");

  const filters = (
    <Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Zone"
          value={zoneChoice}
          onChange={(e) => setZoneChoice(e.target.value)}
          options={zoneOptions}
        />
        <Select
          label="Mohallah"
          value={mohallahChoice}
          onChange={(e) => setMohallahChoice(e.target.value)}
          options={mohallahOptions}
        />
      </div>
      <div className="mt-2 text-xs text-textMuted">
        Zone is the member&apos;s Hizb, from the <strong>Hizb</strong> tab. Mohallah is where
        they live, from the <strong>Personal</strong> tab. They are separate answers, so a
        member can appear under one zone and a Mohallah belonging to another. Choosing{" "}
        <strong>not chosen yet</strong> counts the members who have left that answer blank —
        including accounts with no profile at all, who are invisible to every other filter.
      </div>
    </Card>
  );

  // The filters stay on screen through loading and failure. Losing them would mean a failed
  // request also threw away the choice that made it, and the operator would have to pick
  // both again before they could even retry.
  if (isLoading) {
    return (
      <div className="space-y-4">
        {filters}
        <Card>
          <div className="text-sm text-textMuted">Counting members...</div>
        </Card>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        {filters}
        <Card>
          <div className="text-sm font-semibold text-danger">
            {apiErrorMessage(error, "Could not load the member figures.")}
          </div>
          <button type="button" onClick={() => refetch()} className="mt-2 text-sm underline">
            Try again
          </button>
        </Card>
      </div>
    );
  }

  const { access, form } = data;

  // A filter that matches nobody makes every figure below read zero, which looks exactly
  // like a membership that has done nothing. Say which it is.
  if (isFiltered && access.total === 0) {
    return (
      <div className="space-y-4">
        {filters}
        <Card>
          <div className="text-sm">
            No member accounts match <span className="font-semibold">{filterLabel}</span>.
            Every figure would read zero, which is why none is shown.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {filters}

      {isFiltered ? (
        <div className="rounded-input border border-primary bg-primary/5 p-3 text-sm">
          Every figure below counts only{" "}
          <span className="font-semibold">{filterLabel}</span> — {n(access.total)}{" "}
          {access.total === 1 ? "account" : "accounts"}.
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">Member accounts</h2>
          <div className="text-xs text-textMuted">
            {n(access.active)} active
            {access.inactive > 0 ? `, ${n(access.inactive)} deactivated` : ""}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Accounts" value={n(access.total)} note="Every member account created" />
          <Stat
            label="Signed in"
            value={n(access.signed_in)}
            note={`${access.signed_in_percent}% have logged in at least once`}
            tone={access.signed_in > 0 ? "good" : "plain"}
          />
          <Stat
            label="Set their own password"
            value={n(access.changed_password)}
            note={`${access.changed_password_percent}% no longer use the password they were issued`}
            tone={access.changed_password > 0 ? "good" : "plain"}
          />
          <Stat
            label="Never signed in"
            value={n(access.never_signed_in)}
            note="Still have not used their account at all"
            tone={access.never_signed_in > 0 ? "warn" : "plain"}
          />
        </div>

        {/*
          The gap between the two middle figures, named rather than left to be worked out.
          These members got in and stopped at the forced password change — the one group on
          this page that somebody can actually help today.
        */}
        {access.signed_in_not_changed > 0 ? (
          <div className="rounded-input border border-warning bg-warning/5 p-3 text-sm text-warning">
            <span className="font-semibold">{n(access.signed_in_not_changed)}</span>{" "}
            {access.signed_in_not_changed === 1 ? "member has" : "members have"} signed in but
            {access.signed_in_not_changed === 1 ? " is" : " are"} still on the password they
            were issued. They are stopped at the forced password change, or were reset and have
            not been back since.
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">Form completion</h2>
          <div className="text-xs text-textMuted">
            Across {n(form.measured)} active {form.measured === 1 ? "member" : "members"}
          </div>
        </div>

        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm text-textMuted">Average profile filled in</div>
              <div className="text-5xl font-bold leading-none">{form.average_percent}%</div>
            </div>
            <div className="text-right text-xs text-textMuted">
              {n(form.questions_answered)} of {n(form.questions_asked)} questions answered
            </div>
          </div>

          <div className="mt-3">
            <Bar percent={form.average_percent} tone={toneFor(form.average_percent)} />
          </div>

          {/*
            Printed here, not in a tooltip. The profile has no mandatory fields by design, so
            this figure is a definition rather than a measurement, and anyone quoting it is
            entitled to know what it counted.
          */}
          <div className="mt-3 border-t border-border pt-3 text-xs text-textMuted">
            A question counts only when the form actually asks that member: someone in
            business is never shown Designation, so it is not held against them. Sharaf,
            Maqamaat Muqaddasah, Ashara Mubaraka, Titles, Skills and Tamreen methods are
            excluded, because having none to enter is not the same as leaving them blank.
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Answered everything"
            value={n(form.fully_answered)}
            note={`${form.fully_answered_percent}% of active members`}
            tone={form.fully_answered > 0 ? "good" : "plain"}
          />
          <Stat label="Partly filled in" value={n(form.partly_answered)} note="Started, not finished" />
          <Stat
            label="Not started"
            value={n(form.not_started)}
            note="No answer on any tab yet"
            tone={form.not_started > 0 ? "warn" : "plain"}
          />
        </div>

        <Card>
          <div className="mb-3 text-sm font-semibold">By tab</div>
          {/* Labelled so a test — and a screen reader — can tell these tab names apart from
              the same words used in the prose above. */}
          <div className="space-y-2" role="list" aria-label="Completion by tab">
            {form.tabs.map((tab) => (
              <TabRow key={tab.tab} tab={tab} />
            ))}
          </div>
          <div className="mt-3 border-t border-border pt-3 text-xs text-textMuted">
            The share of that tab's questions answered, added up over every active member.
          </div>
        </Card>
      </section>
    </div>
  );
}
