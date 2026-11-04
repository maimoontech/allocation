export type Role = "admin" | "zonal_head" | "party" | "coordinator" | "member";

export type AuthUser = {
  role: Role;
  id: number;
  displayName: string;
  zoneId?: number;
  partyId?: number;
  venueId?: number;
  /** Member role only. */
  memberId?: number;
  /**
   * Member role only. When true the member must set a new password before anything else is
   * reachable, so ProtectedRoute diverts them to the forced-change screen (FR-017, FR-018).
   */
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
};
