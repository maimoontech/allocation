import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Tabs, type TabDefinition } from "../../components/ui/Tabs";
import type { ImageUploadValue } from "../../components/ui/ImageUpload";
import { useAppDispatch, useAppSelector } from "../../hooks/storeHooks";
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
    return <div className="p-2 text-sm text-textMuted">Loading your profile...</div>;
  }

  if (profileError || lookupsError || !merged || !lookups) {
    return (
      <div
        role="alert"
        className="rounded-input border border-danger bg-danger/5 p-3 text-sm text-danger"
      >
        Could not load your profile. Please reload the page.
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-2xl font-bold">My Profile</div>
        <div className="text-sm text-textMuted">
          {merged.name ? `${merged.name} ${merged.surname ?? ""}`.trim() : merged.its_no}
        </div>
      </div>

      {banner ? (
        <div
          role="alert"
          className={[
            "rounded-input border p-2 text-sm",
            banner.kind === "ok"
              ? "border-success bg-success/5 text-success"
              : "border-danger bg-danger/5 text-danger"
          ].join(" ")}
        >
          {banner.text}
        </div>
      ) : null}

      {isDirty ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-warning bg-warning/5 p-2 text-sm text-warning">
          <span>You have unsaved changes. They are kept as you move between tabs.</span>
          <Button
            type="button"
            variant="ghost"
            disabled={isBusy}
            onClick={() => {
              dispatch(discardDraft());
              dispatch(setFieldErrors([]));
              setBanner(null);
            }}
          >
            Discard changes
          </Button>
        </div>
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onSave} disabled={isBusy || !isDirty}>
          {isBusy ? "Saving..." : "Save Profile"}
        </Button>
        {!isDirty && !banner ? (
          <span className="text-sm text-textMuted">No changes to save.</span>
        ) : null}
        <span className="text-sm text-textMuted">
          Saving applies every tab, not only this one.
        </span>
      </div>
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
