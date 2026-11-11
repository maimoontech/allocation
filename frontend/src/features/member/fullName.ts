/**
 * A member's full name, composed the one way (FR-034a).
 *
 * First Prefix, Name, Father Prefix, Father Name, Surname — in that order, with any part
 * that is absent simply left out. "None" is a real stored value on both prefix columns
 * meaning "no prefix", so it is dropped rather than printed.
 *
 * One function because the name was being assembled in three places with three different
 * answers: the profile header showed Name and Surname only, the admin list included the
 * First Prefix and the Father Name but not the Father Prefix, and the view page did its own
 * third thing. A person's name should not depend on which page is showing it.
 */

const PREFIX_PLACEHOLDER = "None";

export type NameParts = {
  first_prefix?: string | null;
  name?: string | null;
  father_prefix?: string | null;
  father_name?: string | null;
  surname?: string | null;
};

export function composeFullName(parts: NameParts): string {
  return [
    parts.first_prefix,
    parts.name,
    parts.father_prefix,
    parts.father_name,
    parts.surname
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part !== "" && part !== PREFIX_PLACEHOLDER)
    .join(" ");
}

/** The composed name, or the ITS number when nothing has been filled in yet. */
export function fullNameOr(parts: NameParts, fallback: string): string {
  return composeFullName(parts) || fallback;
}
