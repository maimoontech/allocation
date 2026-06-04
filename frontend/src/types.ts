export type Role = "admin" | "zonal_head" | "party" | "coordinator";

export type AuthUser = {
  role: Role;
  id: number;
  displayName: string;
  zoneId?: number;
  partyId?: number;
  venueId?: number;
  lastLoginAt?: string | null;
};
