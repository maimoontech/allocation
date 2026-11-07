import { useEffect, useState } from "react";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Textarea } from "../../../components/ui/Textarea";
import { DatePicker } from "../../../components/ui/DatePicker";
import { todayIso } from "../../../utils/dates";
import { ImageUpload, type ImageUploadValue } from "../../../components/ui/ImageUpload";
import { resolveApiUrl } from "../../../features/api/api";
import { authStorage } from "../../../utils/storage";
import { lookupOptions, toNullableId } from "./shared";
import type { TabProps } from "./shared";

export type Tab01Props = TabProps & {
  /**
   * Absent on the administrator's read of someone else's profile (FR-047a). Changing a
   * member's photograph is the approval flow's job, not this form's, so without these the
   * photograph renders as a preview and nothing else.
   */
  onPhotoSelect?: (photo: ImageUploadValue) => void;
  onPhotoRemove?: () => void;
  photoBusy?: boolean;
  /** Changes when the photo does, so the preview reloads instead of showing a cached image. */
  photoVersion?: number;
  /** Where to fetch the photograph from. Defaults to the signed-in member's own. */
  photoPath?: string;
};

const PREFIX_OPTIONS = [
  { value: "None", label: "None" },
  { value: "Sheikh", label: "Sheikh" },
  { value: "Mulla", label: "Mulla" }
];

/**
 * Fetches the photograph as a blob and hands back an object URL.
 *
 * The image cannot be used as a plain `<img src>`: the endpoint requires a bearer token
 * (FR-090), and an `<img>` tag sends no Authorization header. So it is fetched with the
 * token and turned into a blob URL, which is also revoked on cleanup so the blob does not
 * leak.
 */
function usePhotoObjectUrl(hasPhoto: boolean, version: number, path: string) {
  // Stored WITH the version it was fetched for. The alternative — clearing the state at the
  // top of the effect — is a synchronous setState in an effect body, which triggers a second
  // render pass every time. Keying the value instead lets a stale URL simply not match.
  const [entry, setEntry] = useState<{ version: number; url: string } | null>(null);

  useEffect(() => {
    if (!hasPhoto) return;

    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const token = authStorage.getToken();
        const response = await fetch(resolveApiUrl(path), {
          headers: token ? { authorization: `Bearer ${token}` } : undefined
        });
        if (!response.ok) return;
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setEntry({ version, url: objectUrl });
      } catch {
        // A missing preview is cosmetic; the rest of the tab still works.
      }
    })();

    return () => {
      cancelled = true;
      // Revoked so the blob is not retained for the life of the document.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasPhoto, version, path]);

  // Derived rather than cleared: a URL fetched for an older version has been revoked, so
  // returning it would render a broken image.
  return hasPhoto && entry?.version === version ? entry.url : null;
}

export function Tab01Personal({
  value,
  lookups,
  errorFor,
  onChange,
  disabled,
  onPhotoSelect,
  onPhotoRemove,
  photoBusy,
  photoVersion,
  photoPath
}: Tab01Props) {
  // "me" for the member's own page; `members/<id>/photo` when an administrator or Zonal Head
  // is reading someone else's profile. Hardcoding "me" here would have shown the ADMIN's own
  // photograph on every member they opened.
  const photoUrl = usePhotoObjectUrl(
    value.has_photo,
    photoVersion ?? 0,
    photoPath ?? "members/me/photo"
  );

  // FR-094: a value awaiting review says so, rather than looking authoritative.
  const maritalOptions = lookupOptions(lookups.marital_statuses);
  // FR-040b. The Mohallahs the system already holds, not a list of this module's own
  // (FR-092 — no second copy of existing master data).
  const mohallahOptions = lookupOptions(lookups.mohallahs);

  return (
    <div className="space-y-4">
      {/* FR-034: read-only, and the server ignores any submitted value. */}
      <Input
        label="ITS No."
        value={value.its_no}
        readOnly
        disabled
        helperText="Your ITS number identifies your account and cannot be changed here."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="First Prefix"
          value={value.first_prefix ?? "None"}
          onChange={(e) => onChange("first_prefix", e.target.value)}
          options={PREFIX_OPTIONS}
          error={errorFor("first_prefix")}
          disabled={disabled}
        />
        <Input
          label="Name"
          value={value.name ?? ""}
          onChange={(e) => onChange("name", e.target.value)}
          error={errorFor("name")}
          disabled={disabled}
        />
        <Select
          label="Father Prefix"
          value={value.father_prefix ?? "None"}
          onChange={(e) => onChange("father_prefix", e.target.value)}
          options={PREFIX_OPTIONS}
          error={errorFor("father_prefix")}
          disabled={disabled}
        />
        <Input
          label="Father Name"
          value={value.father_name ?? ""}
          onChange={(e) => onChange("father_name", e.target.value)}
          error={errorFor("father_name")}
          disabled={disabled}
        />
        <Input
          label="Surname"
          value={value.surname ?? ""}
          onChange={(e) => onChange("surname", e.target.value)}
          error={errorFor("surname")}
          disabled={disabled}
        />
      </div>

      {onPhotoSelect && onPhotoRemove ? (
        <ImageUpload
          label="Photo"
          previewUrl={photoUrl}
          onSelect={onPhotoSelect}
          onRemove={onPhotoRemove}
          busy={photoBusy}
          disabled={disabled}
        />
      ) : (
        <div>
          <div className="mb-1 text-sm font-semibold">Photo</div>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Member photograph"
              className="h-32 w-32 rounded-input border border-border object-cover"
            />
          ) : (
            <div className="text-sm text-textMuted">No photograph set.</div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <DatePicker
          label="Date of Birth (Gregorian)"
          value={value.dob_gregorian}
          onChange={(next) => onChange("dob_gregorian", next)}
          error={errorFor("dob_gregorian")}
          min="1900-01-01"
          max={todayIso()}
          disabled={disabled}
        />
        {/*
          FR-039: derived by the server from the Gregorian date. Read-only, and typing over
          it is impossible — the server would ignore it anyway.
        */}
        <Input
          label="Date of Birth (Hijri)"
          value={value.dob_hijri_text ?? ""}
          readOnly
          disabled
          placeholder="Calculated from the Gregorian date"
          helperText="Calculated automatically."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* FR-040a. Free text: the brief asked for a field here, and a managed list would
            need values nobody has agreed yet. */}
        <Input
          label="Nationality"
          value={value.nationality ?? ""}
          onChange={(e) => onChange("nationality", e.target.value)}
          error={errorFor("nationality")}
          disabled={disabled}
        />

        <Select
          label="Marital Status"
          value={value.marital_status_id == null ? "" : String(value.marital_status_id)}
          onChange={(e) =>
            onChange("marital_status_id", e.target.value === "" ? null : Number(e.target.value))
          }
          options={maritalOptions}
          error={errorFor("marital_status_id")}
          disabled={disabled}
        />
      </div>

      {/* FR-095: an empty list explains itself rather than looking broken. */}
      {lookups.marital_statuses.length === 0 ? (
        <div className="rounded-input border border-warning bg-warning/5 p-2 text-xs text-warning">
          Marital status options have not been set up yet. You can still complete and save the
          rest of your profile.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Textarea
          label="Residence Address"
          value={value.residence_address ?? ""}
          onChange={(e) => onChange("residence_address", e.target.value)}
          error={errorFor("residence_address")}
          rows={3}
          disabled={disabled}
        />

        {/* FR-040b. Beside the address, because it is the same question asked two ways. */}
        <Select
          label="Mohallah"
          value={value.mohallah_id == null ? "" : String(value.mohallah_id)}
          onChange={(e) => onChange("mohallah_id", toNullableId(e.target.value))}
          options={mohallahOptions}
          error={errorFor("mohallah_id")}
          disabled={disabled || lookups.mohallahs.length === 0}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["phone_no", "Phone No."],
            ["mobile_no_1", "Mobile No. 1"],
            ["mobile_no_2", "Mobile No. 2"],
            ["whatsapp_no_1", "WhatsApp No. 1"],
            ["whatsapp_no_2", "WhatsApp No. 2"]
          ] as const
        ).map(([field, label]) => (
          <Input
            key={field}
            label={label}
            type="tel"
            inputMode="tel"
            value={(value[field] as string | null) ?? ""}
            onChange={(e) => onChange(field, e.target.value)}
            error={errorFor(field)}
            disabled={disabled}
          />
        ))}

        <Input
          label="Email"
          type="email"
          inputMode="email"
          value={value.email ?? ""}
          onChange={(e) => onChange("email", e.target.value)}
          error={errorFor("email")}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
