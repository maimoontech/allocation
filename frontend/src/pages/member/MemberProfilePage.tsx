import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Card } from "../../components/ui/Card";
import { Tabs, type TabDefinition } from "../../components/ui/Tabs";
import type { ImageUploadValue } from "../../components/ui/ImageUpload";
import { useAppDispatch, useAppSelector } from "../../hooks/storeHooks";
import { useMemberAvatarUrl } from "../../features/member/useMemberAvatarUrl";
import {
  useDeleteMemberPhotoMutation,
  useGetMemberLookupsQuery,
  useGetMemberProfileQuery,
  useSaveMemberProfileMutation,
  useSetMemberPhotoMutation,
  type MemberProfile,
  type MemberProfileInput,
  type ProfileFieldError
} from "../../features/member/memberApi";
import {
  clearDraft,
  discardDraft,
  setDraftBase,
  setFieldErrors,
  updateDraftField,
  updateDraftFields
} from "../../features/member/memberProfileSlice";
import { Tab01Personal } from "./tabs/Tab01Personal";
import { Tab02TitlePrefix } from "./tabs/Tab02TitlePrefix";
import { Tab03Hizb } from "./tabs/Tab03Hizb";
import { Tab04Occupation } from "./tabs/Tab04Occupation";
import { Tab05EducationHifz } from "./tabs/Tab05EducationHifz";
import { Tab06Health } from "./tabs/Tab06Health";
import { Tab07Sharaf } from "./tabs/Tab07Sharaf";
import { Tab08PlacesVisited } from "./tabs/Tab08PlacesVisited";
import { Tab09Ashara } from "./tabs/Tab09Ashara";
import { Tab10Asbaq } from "./tabs/Tab10Asbaq";
import { Tab11Tamreen } from "./tabs/Tab11Tamreen";
import { Tab12Khidmat } from "./tabs/Tab12Khidmat";

/**
 * The member profile: one page, twelve tabs, one save.
 *
 * How the unsaved-edit guarantee works. Only the active panel is rendered, so the inputs for
 * the other eleven tabs do not exist. Values therefore cannot live in the inputs — they live
 * in `memberProfileSlice`, and a tab is a view onto that draft. Switching tabs changes which
 * fields are shown and nothing else (FR-026). The draft is mirrored to sessionStorage, so a
 * lapsed session does not cost the member their work (FR-032).
 *
 * One Save covers all twelve tabs, because one request writes them in one transaction
 * (FR-030). A per-tab save would make a profile that is half new and half old reachable, and
 * the cross-tab rules — Tab 2's prefix comes from Tab 1, Tab 8's counts must agree — would
 * then have no single point at which they are true.
 */

const TAB_IDS = {
  personal: "personal",
  title: "title",
  hizb: "hizb",
  occupation: "occupation",
  education: "education",
  health: "health",
  sharaf: "sharaf",
  places: "places",
  ashara: "ashara",
  asbaq: "asbaq",
  tamreen: "tamreen",
  khidmat: "khidmat"
} as const;

/** The full twelve, in the order the requirement lists them. */
const ALL_TABS: Array<{ id: string; label: string }> = [
  { id: TAB_IDS.personal, label: "Personal" },
  { id: TAB_IDS.title, label: "Title & Prefix" },
  { id: TAB_IDS.hizb, label: "Hizb" },
  { id: TAB_IDS.occupation, label: "Occupation" },
  { id: TAB_IDS.education, label: "Education / Hifz" },
  { id: TAB_IDS.health, label: "Health & Fitness" },
  { id: TAB_IDS.sharaf, label: "Sharaf" },
  { id: TAB_IDS.places, label: "Places Visited" },
  { id: TAB_IDS.ashara, label: "Ashara Mubaraka" },
  { id: TAB_IDS.asbaq, label: "Asbaq" },
  { id: TAB_IDS.tamreen, label: "Tamreen" },
  { id: TAB_IDS.khidmat, label: "Other Sansta Khidmat" }
];

/** Maps a server error's tab number onto the tab id, so the right one can be opened. */
const TAB_BY_NUMBER: Record<number, string> = {
  1: TAB_IDS.personal,
  2: TAB_IDS.title,
  3: TAB_IDS.hizb,
  4: TAB_IDS.occupation,
  5: TAB_IDS.education,
  6: TAB_IDS.health,
  7: TAB_IDS.sharaf,
  8: TAB_IDS.places,
  9: TAB_IDS.ashara,
  10: TAB_IDS.asbaq,
  11: TAB_IDS.tamreen,
  12: TAB_IDS.khidmat
};

export function MemberProfilePage() {
  const dispatch = useAppDispatch();

  const { data: profile, isLoading: profileLoading, error: profileError } =
    useGetMemberProfileQuery();
  const { data: lookups, isLoading: lookupsLoading, error: lookupsError } =
    useGetMemberLookupsQuery();

  const [saveProfile, saveState] = useSaveMemberProfileMutation();
  const [setPhoto, photoState] = useSetMemberPhotoMutation();
  const [removePhoto, removePhotoState] = useDeleteMemberPhotoMutation();

  const draft = useAppSelector((s) => s.memberProfile.draft);
  const fieldErrors = useAppSelector((s) => s.memberProfile.fieldErrors);
  const baseUpdatedAt = useAppSelector((s) => s.memberProfile.baseUpdatedAt);

  const [activeTab, setActiveTab] = useState<string>(TAB_IDS.personal);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const avatarUrl = useMemberAvatarUrl(true);

  const isDirty = Object.keys(draft).length > 0;

  // Record which version of the profile the draft is based on, so a concurrent edit is
  // detected rather than silently overwritten.
  useEffect(() => {
    if (profile && !baseUpdatedAt) dispatch(setDraftBase(profile.updated_at));
  }, [profile, baseUpdatedAt, dispatch]);

  // FR-027: warn before unsaved edits are lost. This covers closing the tab or navigating
  // away from the app; in-app navigation is covered by the banner and the Discard button,
  // since React Router 6.30 has no stable blocker for a data-router-less setup.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /** Saved values overlaid with unsaved edits — what the member should see. */
  const merged = useMemo<MemberProfile | null>(() => {
    if (!profile) return null;
    return { ...profile, ...(draft as Partial<MemberProfile>) };
  }, [profile, draft]);

  const errorFor = useCallback(
    (field: string) => fieldErrors.find((e) => e.field === field)?.message,
    [fieldErrors]
  );

  const onChange = useCallback(
    (field: string, value: unknown) => {
      setBanner(null);
      // A conditional rule that clears its dependents sends several fields at once, so they
      // land in one update and cannot be seen half-applied.
      if (field === "__fields__") {
        dispatch(updateDraftFields(value as Partial<MemberProfileInput>));
        return;
      }
      dispatch(updateDraftField({ field: field as keyof MemberProfileInput, value }));
    },
    [dispatch]
  );

  async function onSave() {
    setBanner(null);
    try {
      const saved = await saveProfile({ ...draft, if_unmodified_since: baseUpdatedAt }).unwrap();
      dispatch(clearDraft());
      // Re-base on the version the save just produced. Without this the SECOND save in a
      // page session still carries the FIRST read's `updated_at`, the server sees its own
      // completed write as someone else's and answers 409 — and the effect above cannot
      // recover it, because it only re-seeds while baseUpdatedAt is null. The response is
      // the saved profile, so this needs no refetch.
      dispatch(setDraftBase(saved.updated_at));
      setBanner({ kind: "ok", text: "Your profile has been saved." });
    } catch (err: unknown) {
      const errors = extractFieldErrors(err);
      if (errors.length > 0) {
        dispatch(setFieldErrors(errors));
        // Open the first tab that has a problem, so the member is not left hunting (FR-029).
        const firstTab = TAB_BY_NUMBER[errors[0].tab];
        if (firstTab) setActiveTab(firstTab);
        setBanner({
          kind: "error",
          text: `Please correct ${errors.length} field${errors.length === 1 ? "" : "s"} and save again.`
        });
        return;
      }
      setBanner({ kind: "error", text: messageFrom(err, "Could not save your profile.") });
    }
  }

  async function onPhotoSelect(photo: ImageUploadValue) {
    setBanner(null);
    try {
      await setPhoto(photo).unwrap();
      // Forces the preview to refetch rather than showing the previous blob.
      setPhotoVersion((v) => v + 1);
      setBanner({ kind: "ok", text: "Photo updated." });
    } catch (err: unknown) {
      setBanner({ kind: "error", text: messageFrom(err, "Could not save that photo.") });
    }
  }

  async function onPhotoRemove() {
    setBanner(null);
    try {
      await removePhoto().unwrap();
      setPhotoVersion((v) => v + 1);
      setBanner({ kind: "ok", text: "Photo removed." });
    } catch (err: unknown) {
      setBanner({ kind: "error", text: messageFrom(err, "Could not remove that photo.") });
    }
  }

  const tabs: TabDefinition[] = ALL_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    hasError: fieldErrors.some((e) => TAB_BY_NUMBER[e.tab] === tab.id)
  }));

  if (profileLoading || lookupsLoading) {
    return <div className="p-6 text-sm text-textMuted">Loading your profile...</div>;
  }

  if (profileError || lookupsError || !merged || !lookups) {
    return (
      <div className="p-4 sm:p-6">
        <MessageBar intent="error" role="alert">
          Could not load your profile. Please reload the page.
        </MessageBar>
      </div>
    );
  }

  const isBusy = saveState.isLoading;

  // Every tab takes the same four props; only Tab 1 needs more.
  const tabProps = {
    value: merged,
    lookups,
    errorFor,
    onChange,
    disabled: isBusy
  };

  const fullName = merged.name ? `${merged.name} ${merged.surname ?? ""}`.trim() : merged.its_no;
  const initials =
    fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "M";

  function onDiscard() {
    dispatch(discardDraft());
    dispatch(setFieldErrors([]));
    setBanner(null);
  }

  // Laid out as a Dynamics 365 record form: command bar, record header, tabs, then the
  // active tab's section. The colours come from the `theme-d365` wrapper in MemberShell.
  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-[#e0e0e0] bg-white px-2 py-1">
        <CommandButton icon={ICON.save} onClick={onSave} disabled={isBusy || !isDirty}>
          {isBusy ? "Saving..." : "Save Profile"}
        </CommandButton>
        <CommandButton icon={ICON.undo} onClick={onDiscard} disabled={isBusy || !isDirty}>
          Discard changes
        </CommandButton>
        <div className="ml-auto hidden px-2 text-[13px] text-textMuted sm:block">
          {!isDirty && !banner ? "No changes to save. " : null}
          Saving applies every tab, not only this one.
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ebf3fc] text-lg font-semibold text-primary">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-textPrimary">
              {fullName}
              <span className="font-normal text-textMuted">
                {" "}
                - {isDirty ? "Unsaved" : "Saved"}
              </span>
            </h1>
            <div className="text-sm text-textMuted">Member profile</div>
          </div>
          <dl className="flex gap-6 border-l border-[#e0e0e0] pl-4 text-sm">
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-textMuted">ITS No</dt>
              <dd className="font-semibold tabular-nums text-textPrimary">{merged.its_no}</dd>
            </div>
            {fieldErrors.length ? (
              <div className="flex flex-col-reverse">
                <dt className="text-xs text-textMuted">Needs attention</dt>
                <dd className="font-semibold text-danger">
                  {fieldErrors.length} field{fieldErrors.length === 1 ? "" : "s"}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {banner ? (
          <MessageBar intent={banner.kind === "ok" ? "success" : "error"} role="alert">
            {banner.text}
          </MessageBar>
        ) : null}

        {isDirty ? (
          <MessageBar intent="warning">
            You have unsaved changes. They are kept as you move between tabs.
          </MessageBar>
        ) : null}

        <Tabs tabs={tabs} activeId={activeTab} onChange={setActiveTab}>
          <Card>
            {activeTab === TAB_IDS.personal ? (
              <Tab01Personal
                {...tabProps}
                onPhotoSelect={onPhotoSelect}
                onPhotoRemove={onPhotoRemove}
                photoBusy={photoState.isLoading || removePhotoState.isLoading}
                photoVersion={photoVersion}
              />
            ) : activeTab === TAB_IDS.hizb ? (
              <Tab03Hizb {...tabProps} />
            ) : activeTab === TAB_IDS.occupation ? (
              <Tab04Occupation {...tabProps} />
            ) : activeTab === TAB_IDS.education ? (
              <Tab05EducationHifz {...tabProps} />
            ) : activeTab === TAB_IDS.health ? (
              <Tab06Health {...tabProps} />
            ) : activeTab === TAB_IDS.asbaq ? (
              <Tab10Asbaq {...tabProps} />
            ) : activeTab === TAB_IDS.tamreen ? (
              <Tab11Tamreen {...tabProps} />
            ) : activeTab === TAB_IDS.khidmat ? (
              <Tab12Khidmat {...tabProps} />
            ) : activeTab === TAB_IDS.title ? (
              <Tab02TitlePrefix {...tabProps} />
            ) : activeTab === TAB_IDS.sharaf ? (
              <Tab07Sharaf {...tabProps} />
            ) : activeTab === TAB_IDS.places ? (
              <Tab08PlacesVisited {...tabProps} />
            ) : (
              <Tab09Ashara {...tabProps} />
            )}
          </Card>
        </Tabs>
      </div>
    </div>
  );
}

/* ---------- Dynamics 365 building blocks for this page ---------- */

/** Fluent 20px regular glyphs, inline so nothing new is installed. */
const ICON = {
  save: "M3 5a2 2 0 0 1 2-2h8.59c.4 0 .78.16 1.06.44l1.91 1.91c.28.28.44.67.44 1.06V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1v-4.5c0-.83.67-1.5 1.5-1.5h7c.83 0 1.5.67 1.5 1.5V16a1 1 0 0 0 1-1V6.41a.5.5 0 0 0-.15-.35l-1.91-1.91A.5.5 0 0 0 14 4v2.5c0 .83-.67 1.5-1.5 1.5h-4A1.5 1.5 0 0 1 7 6.5V4H5Zm9 12v-4.5a.5.5 0 0 0-.5-.5h-7a.5.5 0 0 0-.5.5V16h8ZM8 4v2.5c0 .28.22.5.5.5h4a.5.5 0 0 0 .5-.5V4H8Z",
  undo: "M4 3.5a.5.5 0 0 0-1 0v5c0 .28.22.5.5.5h5a.5.5 0 0 0 0-1H4.89l2.49-2.33A5.5 5.5 0 1 1 5.04 13a.5.5 0 1 0-.9.42 6.5 6.5 0 1 0 2.56-8.48L4 7.46V3.5Z",
  info: "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 6a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0v-4A.5.5 0 0 1 10 9Zm0-2.75a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z",
  error:
    "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm0-6.5a.5.5 0 0 1 .5.5v4.5a.5.5 0 0 1-1 0V6.5A.5.5 0 0 1 10 6Z",
  success:
    "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm3.36 4.15a.5.5 0 0 1 .06.63l-.06.07-4 4a.5.5 0 0 1-.64.06l-.07-.06-2-2a.5.5 0 0 1 .64-.76l.07.06L9 10.79l3.65-3.64a.5.5 0 0 1 .71 0Z"
};

function Glyph({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-4 w-4 shrink-0 fill-current ${className}`}>
      <path d={d} />
    </svg>
  );
}

/** A command-bar button: blue icon and label, no fill until hovered. */
function CommandButton({
  icon,
  onClick,
  disabled,
  children
}: {
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group inline-flex h-8 items-center gap-1.5 rounded-button px-2 text-sm text-textPrimary hover:bg-[#f5f5f5] active:bg-[#e0e0e0] disabled:cursor-not-allowed disabled:text-[#bdbdbd] disabled:hover:bg-transparent focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <Glyph d={icon} className="text-primary group-disabled:text-[#bdbdbd]" />
      {children}
    </button>
  );
}

type Intent = "info" | "warning" | "error" | "success";

const messageBarLook: Record<Intent, { box: string; icon: string; glyph: string }> = {
  info: { box: "border-[#e0e0e0] bg-[#f5f5f5]", icon: "text-[#616161]", glyph: ICON.info },
  warning: { box: "border-[#fdcfb4] bg-[#fff9f5]", icon: "text-warning", glyph: ICON.error },
  error: { box: "border-[#eeacb2] bg-[#fdf3f4]", icon: "text-danger", glyph: ICON.error },
  success: { box: "border-[#9fd89f] bg-[#f1faf1]", icon: "text-success", glyph: ICON.success }
};

/** Fluent message bar: one band with the intent's icon first. */
function MessageBar({
  intent,
  role,
  children
}: {
  intent: Intent;
  role?: "alert" | "status";
  children: ReactNode;
}) {
  const look = messageBarLook[intent];
  return (
    <div
      role={role}
      className={`flex items-start gap-2 rounded-input border px-3 py-2 text-[13px] leading-5 text-textPrimary ${look.box}`}
    >
      <Glyph d={look.glyph} className={`mt-0.5 ${look.icon}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Pulls the server's per-field failures out of an RTK Query rejection (FR-029). */
function extractFieldErrors(err: unknown): ProfileFieldError[] {
  if (typeof err !== "object" || err === null) return [];
  const data = (err as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return [];
  const inner = (data as Record<string, unknown>).data;
  if (typeof inner !== "object" || inner === null) return [];
  const errors = (inner as Record<string, unknown>).errors;
  if (!Array.isArray(errors)) return [];
  return errors.filter(
    (e): e is ProfileFieldError =>
      typeof e === "object" && e !== null && "field" in e && "message" in e
  );
}

function messageFrom(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    const data = record.data;
    if (typeof data === "object" && data !== null) {
      const message = (data as Record<string, unknown>).message;
      if (typeof message === "string" && message) return message;
    }
    if (typeof record.error === "string" && record.error) return record.error;
  }
  return fallback;
}
