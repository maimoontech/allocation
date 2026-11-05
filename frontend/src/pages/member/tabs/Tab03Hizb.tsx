import { useMemo } from "react";
import { Select } from "../../../components/ui/Select";
import { lookupOptions, toNullableId } from "./shared";
import type { TabProps } from "./shared";

const ROLE_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "Leader", label: "Leader" },
  { value: "Side Lead", label: "Side Lead" },
  { value: "Member", label: "Member" }
];

/**
 * Tab 3 — Hizb.
 *
 * The dependent dropdown (FR-048). Parties arrive from the lookups endpoint already carrying
 * `zone_id`, so the filter happens here with no second request.
 *
 * Two behaviours matter and are easy to get wrong:
 *
 *   - Changing the Zone CLEARS a Party that no longer belongs to it, in the same update. If
 *     it were left behind, the member would see a Party that is not in the list and the save
 *     would be refused by the server's cross-zone check with no obvious cause.
 *   - The Party select is disabled until a Zone is chosen, because an unfiltered list of
 *     every party in the organisation is not a useful thing to scroll.
 *
 * FR-048a: the list holds INACTIVE Hizbs as well as active ones, marked rather than hidden.
 * Two reasons. A member whose own Hizb was deactivated would otherwise find their saved
 * value missing from the list — the select renders blank and the save is refused with
 * nothing on screen to explain why. And a member who genuinely belongs to one that has been
 * retired has no way to say so if it is not offered. Marking is the other half: an unmarked
 * inactive Hizb reads as an ordinary choice.
 */
export function Tab03Hizb({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const zoneOptions = useMemo(() => lookupOptions(lookups.zones), [lookups.zones]);

  const partiesInZone = useMemo(
    () =>
      value.zone_id == null
        ? []
        : lookups.parties.filter((p) => p.zone_id === value.zone_id),
    [lookups.parties, value.zone_id]
  );

  const partyOptions = useMemo(
    () => [
      {
        value: "",
        label:
          value.zone_id == null
            ? "Select a Zone first"
            : partiesInZone.length
              ? "Select..."
              : "No parties in this Zone"
      },
      // Active first, then inactive, each group alphabetical — so the ordinary choice is
      // what a member meets first and the retired ones are not salted through the list.
      ...[...partiesInZone]
        .sort((a, b) =>
          a.is_active === b.is_active
            ? a.name.localeCompare(b.name)
            : Number(b.is_active) - Number(a.is_active)
        )
        .map((p) => ({
          value: String(p.id),
          // Marked, not hidden. An unmarked inactive Hizb reads as an ordinary choice, and a
          // member would have no way to tell it is no longer running.
          label: p.is_active ? p.name : `${p.name} — INACTIVE`
        }))
    ],
    [partiesInZone, value.zone_id]
  );

  function onZoneChange(raw: string) {
    const zoneId = raw === "" ? null : Number(raw);

    // Clearing the Party in the SAME update is the point: a stale Party would fail the
    // server's cross-zone check with nothing on screen to explain why.
    const partyStillValid =
      value.party_id != null &&
      zoneId != null &&
      lookups.parties.some((p) => p.id === value.party_id && p.zone_id === zoneId);

    onChange("__fields__", {
      zone_id: zoneId,
      party_id: partyStillValid ? value.party_id : null
    });
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-textMuted">
        Your Zone and Hizb, and the role you hold in it.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Zone"
          value={value.zone_id == null ? "" : String(value.zone_id)}
          onChange={(e) => onZoneChange(e.target.value)}
          options={zoneOptions}
          error={errorFor("zone_id")}
          disabled={disabled}
        />

        <Select
          label="Party"
          value={value.party_id == null ? "" : String(value.party_id)}
          onChange={(e) =>
            onChange("party_id", toNullableId(e.target.value))
          }
          options={partyOptions}
          error={errorFor("party_id")}
          disabled={disabled || value.zone_id == null}
        />

        <Select
          label="Role"
          value={value.hizb_role ?? ""}
          onChange={(e) => onChange("hizb_role", e.target.value === "" ? null : e.target.value)}
          options={ROLE_OPTIONS}
          error={errorFor("hizb_role")}
          disabled={disabled}
        />
      </div>

      {/* Spec assumption 16: a member need not belong to a Party, so this cannot block a save. */}
      <div className="text-xs text-textMuted">
        If you are not currently part of a Hizb, leave these blank — the rest of your profile
        can still be saved.
      </div>
    </div>
  );
}
