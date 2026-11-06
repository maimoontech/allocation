import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Tabs, type TabDefinition } from "../../components/ui/Tabs";
import {
  ALL_TABS,
  ProfileTabPanel,
  TAB_BY_NUMBER,
  TAB_IDS
} from "../member/tabs/profileTabs";
import { useGetMemberLookupsQuery } from "../../features/member/memberApi";
import {
  useGetAdminMemberProfileQuery,
  useSaveMemberProfileAsAdminMutation
} from "../../features/member/memberAdminApi";
import type {
  MemberProfile,
  MemberProfileInput,
  ProfileFieldError
} from "../../features/member/memberApi";

/**
 * One member's twelve-tab profile, read by an administrator or a Zonal Head (FR-047a).
 *
 * WHO SEES WHAT, and why it is decided on the server. Both roles see all twelve tabs
 * including Tab 6's health values — FR-065 already allowed "explicitly authorised
 * administrators" to read those, and extending it to Zonal Heads for their own zone was
 * authorised on 2026-11-06. Only an administrator may EDIT; a Zonal Head reads. That verdict
 * arrives as `can_edit` in the payload rather than being worked out from the signed-in role
 * here, because a browser that guessed wrong would offer a Save button the server then
 * refuses, which is worse than not offering one.
 *
 * The draft is LOCAL STATE, not the `memberProfile` slice. That slice is the member's own
 * unsaved work, mirrored to sessionStorage and restored on sign-in (FR-032); an administrator
 * editing somebody else's profile must not write into it, or the two would overwrite each
 * other and the member would find a stranger's edits waiting in their form.
 */
export function MemberProfileViewPage() {
  const params = useParams();
  const memberId = Number(params.id);

  const profileQuery = useGetAdminMemberProfileQuery(memberId, {
    skip: !Number.isInteger(memberId) || memberId <= 0
  });
  const lookupsQuery = useGetMemberLookupsQuery();
  const [saveProfile, saveState] = useSaveMemberProfileAsAdminMutation();

  const [draft, setDraft] = useState<MemberProfileInput>({});
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldError[]>([]);
  const [activeTab, setActiveTab] = useState<string>(TAB_IDS.personal);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const profile = profileQuery.data;
  const lookups = lookupsQuery.data;
  const canEdit = Boolean(profile?.can_edit);
  const isDirty = Object.keys(draft).length > 0;

  const merged = useMemo<MemberProfile | null>(
    () => (profile ? { ...profile, ...(draft as Partial<MemberProfile>) } : null),
    [profile, draft]
  );

  const errorFor = useCallback(
    (field: string) => fieldErrors.find((e) => e.field === field)?.message,
    [fieldErrors]
  );

  const onChange = useCallback(
    (field: string, value: unknown) => {
      setBanner(null);
      setDraft((current) =>
        field === "__fields__"
          ? { ...current, ...(value as Partial<MemberProfileInput>) }
          : { ...current, [field]: value }
      );
      setFieldErrors((current) => current.filter((e) => !e.field.startsWith(field)));
    },
    []
  );

  async function onSave() {
    setBanner(null);
    try {
      await saveProfile({
        id: memberId,
        body: { ...draft, if_unmodified_since: profile?.updated_at ?? null }
      }).unwrap();
      setDraft({});
      setFieldErrors([]);
      setBanner({ kind: "ok", text: "Profile saved." });
    } catch (err: unknown) {
      const errors = extractFieldErrors(err);
      if (errors.length > 0) {
        setFieldErrors(errors);
        const firstTab = TAB_BY_NUMBER[errors[0].tab];
        if (firstTab) setActiveTab(firstTab);
        setBanner({
          kind: "error",
          text: `Please correct ${errors.length} field${errors.length === 1 ? "" : "s"}.`
        });
        return;
      }
      setBanner({ kind: "error", text: messageFrom(err, "Could not save this profile.") });
    }
  }

  const tabs: TabDefinition[] = ALL_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    hasError: fieldErrors.some((e) => TAB_BY_NUMBER[e.tab] === tab.id)
  }));

  if (!Number.isInteger(memberId) || memberId <= 0) {
    return (
      <div className="p-4 sm:p-6">
        <MessageBar intent="error" role="alert">
          That is not a valid member.
        </MessageBar>
      </div>
    );
  }

  if (profileQuery.isLoading || lookupsQuery.isLoading) {
    return <div className="p-6 text-sm text-textMuted">Loading profile...</div>;
  }

  if (profileQuery.isError || lookupsQuery.isError || !merged || !lookups) {
    // 403 is the interesting case and deserves its own words: a Zonal Head reaching a member
    // outside their zone has not hit an outage, and "try again" would be a lie.
    const status = (profileQuery.error as { status?: number } | undefined)?.status;
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <MessageBar intent="error" role="alert">
          {status === 403
            ? "This member is not in your zone."
            : status === 404
              ? "That member does not exist."
              : "Could not load this profile. Please reload the page."}
        </MessageBar>
        <Link to="/members" className="text-sm underline">
          Back to Members
        </Link>
      </div>
    );
  }

  const fullName =
    [merged.name, merged.surname].filter(Boolean).join(" ").trim() || merged.its_no;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-2xl font-bold">{fullName}</div>
          <div className="text-sm text-textMuted">ITS No. {merged.its_no}</div>
        </div>
        <Link to="/members" className="text-sm underline">
          Back to Members
        </Link>
      </div>

      <Card>
        <div className="text-sm text-textMuted">
          {canEdit
            ? "You are viewing this member's profile. Any change you save is recorded against your account."
            : "You are viewing this member's profile. Only an administrator can change these answers."}
        </div>
      </Card>

      {banner ? (
        <MessageBar intent={banner.kind === "ok" ? "success" : "error"} role="alert">
          {banner.text}
        </MessageBar>
      ) : null}

      {canEdit && isDirty ? (
        <MessageBar intent="warning">
          You have unsaved changes. They are kept as you move between tabs.
        </MessageBar>
      ) : null}

      <Tabs tabs={tabs} activeId={activeTab} onChange={setActiveTab}>
        <Card>
          <ProfileTabPanel
            activeTab={activeTab}
            tabProps={{
              value: merged,
              lookups,
              errorFor,
              onChange,
              // The only thing that makes a Zonal Head's view read-only on screen. The
              // server refuses their PUT regardless, so this is the courtesy, not the guard.
              disabled: !canEdit || saveState.isLoading
            }}
            photo={{ photoPath: `members/${memberId}/photo` }}
          />
        </Card>
      </Tabs>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={onSave} disabled={saveState.isLoading || !isDirty}>
            {saveState.isLoading ? "Saving..." : "Save Changes"}
          </Button>
          {isDirty ? (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => {
                setDraft({});
                setFieldErrors([]);
                setBanner(null);
              }}
            >
              Discard changes
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Per-field failures out of an RTK Query rejection (FR-029).
 *
 * TWO levels of `data`, not one. RTK puts the response body on `err.data`, and that body is
 * the API envelope `{ success, message, data }`, so the errors are at `err.data.data.errors`.
 * Reading one level short silently yields an empty list and the member is told to correct
 * nothing in particular.
 */
function extractFieldErrors(err: unknown): ProfileFieldError[] {
  if (typeof err !== "object" || err === null) return [];
  const data = (err as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return [];
  const inner = (data as Record<string, unknown>).data;
  if (typeof inner !== "object" || inner === null) return [];
  const errors = (inner as Record<string, unknown>).errors;
  return Array.isArray(errors) ? (errors as ProfileFieldError[]) : [];
}

function messageFrom(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    const data = record.data;
    if (typeof data === "object" && data !== null) {
      const message = (data as Record<string, unknown>).message;
      if (typeof message === "string" && message) return message;
    }
  }
  return fallback;
}

/** A plain band. The member page's richer one depends on three of its own locals. */
function MessageBar({
  intent,
  role,
  children
}: {
  intent: "error" | "success" | "warning";
  role?: "alert" | "status";
  children: React.ReactNode;
}) {
  const look =
    intent === "error"
      ? "border-[#eeacb2] bg-[#fdf3f4]"
      : intent === "success"
        ? "border-[#9fd89f] bg-[#f1faf1]"
        : "border-warning bg-warning/5";
  return (
    <div
      role={role}
      className={`rounded-input border px-3 py-2 text-[13px] leading-5 text-textPrimary ${look}`}
    >
      {children}
    </div>
  );
}
