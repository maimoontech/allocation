import type { Role } from "../../types";

const roleLabel: Record<Role, string> = {
  admin: "Admin",
  zonal_head: "Zonal Head",
  party: "Party",
  coordinator: "Coordinator",
  member: "Member"
};

export function RoleAvatar({
  role,
  name,
  photoUrl
}: {
  role: Role;
  name: string;
  photoUrl?: string | null;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex items-center gap-2">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={`${name} profile photograph`}
          className="h-9 w-9 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          {initials || "U"}
        </div>
      )}
      <div className="text-left">
        <div className="text-sm font-semibold leading-tight">{name}</div>
        <div className="text-xs text-textMuted">{roleLabel[role]}</div>
      </div>
    </div>
  );
}

