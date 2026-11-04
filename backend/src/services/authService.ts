import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool";
import { env } from "../config/env";
import type { JwtClaims, Role } from "../middleware/auth";

type AuthUser = {
  role: Role;
  id: number;
  displayName: string;
  zoneId?: number;
  partyId?: number;
  venueId?: number;
  /** Member role only. */
  memberId?: number;
  /** Member role only. Lets the client route straight to the forced change screen (FR-017). */
  mustChangePassword?: boolean;
  /**
   * Member role only: `password_changed_at` as a Unix timestamp, or null if never changed.
   * Carried into the token so `requireMember` can reject a token minted before a change.
   */
  passwordChangedEpoch?: number | null;
  lastLoginAt?: string | null;
};

function isNumericId(value: string) {
  return /^\d+$/.test(value.trim());
}

function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

// Returns "venues" by DEFAULT, so any role not named above lands on the venues table. The
// member role must never reach here — it is handled by `changeMemberPassword`, and the type
// excludes it so the compiler enforces that.
function tableForSelfServiceRole(role: Exclude<Role, "admin" | "member">) {
  if (role === "zonal_head") return "zones";
  if (role === "party") return "parties";
  return "venues";
}

export async function authenticate(params: {
  identifier: string;
  password: string;
  role: Role;
}): Promise<{ user: AuthUser; token: string; refreshToken: string }> {
  const { identifier, password, role } = params;
  const idOrName = identifier.trim();

  if (!idOrName || !password) throw new Error("INVALID_CREDENTIALS");

  if (role === "admin") {
    const [rows] = await pool.query<any[]>(
      "SELECT id, username, admin_name, password_hash, last_login_at FROM admins WHERE username = :username LIMIT 1",
      { username: idOrName }
    );
    const admin = rows[0];
    if (!admin) throw new Error("INVALID_CREDENTIALS");
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) throw new Error("INVALID_CREDENTIALS");

    await pool.query("UPDATE admins SET last_login_at = NOW() WHERE id = :id", { id: admin.id });

    const user: AuthUser = {
      role,
      id: admin.id,
      displayName: admin.admin_name ?? admin.username,
      lastLoginAt: admin.last_login_at
    };
    return issueTokens(user);
  }

  if (role === "zonal_head") {
    const query = isNumericId(idOrName)
      ? "SELECT id, zone_name, password_hash, last_login_at FROM zones WHERE id = :id LIMIT 1"
      : "SELECT id, zone_name, password_hash, last_login_at FROM zones WHERE zone_name = :name LIMIT 1";
    const lookup = isNumericId(idOrName) ? { id: Number(idOrName) } : { name: idOrName };
    const [rows] = await pool.query<any[]>(query, lookup);
    const zone = rows[0];
    if (!zone) throw new Error("INVALID_CREDENTIALS");
    const ok = await bcrypt.compare(password, zone.password_hash);
    if (!ok) throw new Error("INVALID_CREDENTIALS");

    await pool.query("UPDATE zones SET last_login_at = NOW() WHERE id = :id", { id: zone.id });

    const user: AuthUser = {
      role,
      id: zone.id,
      displayName: zone.zone_name,
      zoneId: zone.id,
      lastLoginAt: zone.last_login_at
    };
    return issueTokens(user);
  }

  if (role === "party") {
    const [rows] = await pool.query<any[]>(
      "SELECT id, its_no, party_name, zone_id, password_hash, last_login_at FROM parties WHERE its_no = :its_no LIMIT 1",
      { its_no: idOrName }
    );
    const party = rows[0];
    if (!party) throw new Error("INVALID_CREDENTIALS");
    const ok = await bcrypt.compare(password, party.password_hash);
    if (!ok) throw new Error("INVALID_CREDENTIALS");

    await pool.query("UPDATE parties SET last_login_at = NOW() WHERE id = :id", { id: party.id });

    const user: AuthUser = {
      role,
      id: party.id,
      displayName: party.party_name,
      zoneId: party.zone_id,
      partyId: party.id,
      lastLoginAt: party.last_login_at
    };
    return issueTokens(user);
  }

  // ---------------------------------------------------------------------------
  // MEMBER.
  //
  // This branch MUST stay above the venue/coordinator query below, which is reached by
  // FALLING THROUGH every preceding branch and has no `role === "coordinator"` guard of its
  // own. Placed after it, a member request would be answered by the venue lookup and fail.
  //
  // It is also written as a strict equality check on the role so that it cannot swallow a
  // coordinator request. Both directions are pinned by
  // src/__tests__/regression/authCoordinatorFallthrough.test.ts.
  //
  // Members authenticate by ITS number only, against their own table. No other role's
  // credentials can reach this query and these cannot reach any other (FR-011, FR-012).
  // ---------------------------------------------------------------------------
  if (role === "member") {
    const [rows] = await pool.query<any[]>(
      `SELECT id, its_no, member_name, password_hash, must_change_password, is_active,
              last_login_at, UNIX_TIMESTAMP(password_changed_at) AS password_changed_epoch
       FROM member_accounts
       WHERE its_no = :its_no
       LIMIT 1`,
      { its_no: idOrName }
    );
    const member = rows[0];
    if (!member || !member.password_hash) throw new Error("INVALID_CREDENTIALS");

    const ok = await bcrypt.compare(password, member.password_hash);
    if (!ok) throw new Error("INVALID_CREDENTIALS");

    // A withdrawn account is refused with the SAME error as a wrong password, so the response
    // cannot be used to discover which ITS numbers exist or have been deactivated
    // (FR-007, FR-013).
    if (!member.is_active) throw new Error("INVALID_CREDENTIALS");

    await pool.query("UPDATE member_accounts SET last_login_at = NOW() WHERE id = :id", {
      id: member.id
    });

    const user: AuthUser = {
      role,
      id: member.id,
      displayName: member.member_name ?? member.its_no,
      memberId: member.id,
      mustChangePassword: Boolean(member.must_change_password),
      passwordChangedEpoch:
        member.password_changed_epoch == null ? null : Number(member.password_changed_epoch),
      lastLoginAt: member.last_login_at
    };
    return issueTokens(user);
  }

  const query = isNumericId(idOrName)
    ? `SELECT v.id, v.venue_name, m.zone_id, v.password_hash, v.last_login_at
       FROM venues v
       JOIN mohallahs m ON m.id = v.mohallah_id
       WHERE v.id = :id
       LIMIT 1`
    : `SELECT v.id, v.venue_name, m.zone_id, v.password_hash, v.last_login_at
       FROM venues v
       JOIN mohallahs m ON m.id = v.mohallah_id
       WHERE v.venue_name = :name
       LIMIT 1`;
  const lookup = isNumericId(idOrName) ? { id: Number(idOrName) } : { name: idOrName };
  const [rows] = await pool.query<any[]>(query, lookup);
  const venue = rows[0];
  if (!venue || !venue.password_hash) throw new Error("INVALID_CREDENTIALS");
  const ok = await bcrypt.compare(password, venue.password_hash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");

  await pool.query("UPDATE venues SET last_login_at = NOW() WHERE id = :id", { id: venue.id });

  const user: AuthUser = {
    role,
    id: venue.id,
    displayName: venue.venue_name,
    zoneId: venue.zone_id,
    venueId: venue.id,
    lastLoginAt: venue.last_login_at
  };
  return issueTokens(user);
}

async function issueTokens(user: AuthUser): Promise<{ user: AuthUser; token: string; refreshToken: string }> {
  const claims: JwtClaims = {
    sub: `${user.role}:${user.id}`,
    role: user.role,
    id: user.id,
    zoneId: user.zoneId,
    partyId: user.partyId,
    venueId: user.venueId,
    memberId: user.memberId,
    pwdAt: user.role === "member" ? (user.passwordChangedEpoch ?? null) : undefined
  };

  const token = jwt.sign(claims, env.jwt.secret, { expiresIn: env.jwt.expiresIn as any });

  const refreshToken = randomRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + env.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000);

  await pool.query(
    "INSERT INTO refresh_tokens (token_hash, user_role, user_id, expires_at, created_at) VALUES (:token_hash, :user_role, :user_id, :expires_at, NOW())",
    {
      token_hash: refreshTokenHash,
      user_role: user.role,
      user_id: user.id,
      expires_at: expiresAt
    }
  );

  return { user, token, refreshToken };
}

export async function refreshAccessToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const [rows] = await pool.query<any[]>(
    "SELECT id, user_role, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = :token_hash LIMIT 1",
    { token_hash: tokenHash }
  );
  const row = rows[0];
  if (!row) throw new Error("INVALID_REFRESH");
  if (row.revoked_at) throw new Error("INVALID_REFRESH");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("INVALID_REFRESH");

  const role = row.user_role as Role;
  const userId = Number(row.user_id);

  const user = await loadUser(role, userId);
  const claims: JwtClaims = {
    sub: `${user.role}:${user.id}`,
    role: user.role,
    id: user.id,
    zoneId: user.zoneId,
    partyId: user.partyId,
    venueId: user.venueId,
    memberId: user.memberId,
    pwdAt: user.role === "member" ? (user.passwordChangedEpoch ?? null) : undefined
  };
  const token = jwt.sign(claims, env.jwt.secret, { expiresIn: env.jwt.expiresIn as any });
  return { token };
}

export async function revokeRefreshToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = :token_hash AND revoked_at IS NULL",
    { token_hash: tokenHash }
  );
}

/**
 * Password rules for MEMBER accounts only (FR-020, FR-021).
 *
 * Deliberately not applied to the four existing roles. They have no policy today, and
 * imposing one here would change their behaviour — which FR-104 forbids and
 * src/__tests__/regression/changePasswordExisting.test.ts pins. Raising their bar is a
 * separate, deliberate decision.
 *
 * Returns a message naming the rule that failed, so the UI can say which one.
 */
export function validateMemberPassword(password: string): string | null {
  const value = password ?? "";

  if (value.length < 8) {
    return "Password must be at least 8 characters long.";
  }

  // Either comfortably long, or shorter but mixed. A long passphrase should not be rejected
  // for lacking punctuation.
  if (value.length < 12) {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
    if (classes < 3) {
      return "A password shorter than 12 characters must mix at least three of: lower case, upper case, digits, symbols.";
    }
  }

  if (/^\s|\s$/.test(password)) {
    return "Password must not begin or end with a space.";
  }

  return null;
}

/**
 * Changes a member's own password.
 *
 * Separate from `changePassword` because `tableForSelfServiceRole` cannot serve it: the
 * member update must also clear `must_change_password` and stamp `password_changed_at`, and
 * that timestamp is what `requireMember` uses to reject tokens minted before the change.
 *
 * Returns a FRESH token pair. Without it, the member's current token — issued before the
 * change — would be rejected by its own staleness check the moment the change succeeded,
 * and they would be bounced to the login screen mid-flow. This is how FR-022 (old sessions
 * die) and spec story 3 scenario 3 (the profile opens straight after) are both satisfied.
 */
export async function changeMemberPassword(params: {
  memberId: number;
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}) {
  const { memberId, currentPassword, newPassword, confirmPassword } = params;

  if (!currentPassword || !newPassword) throw new Error("INVALID_PASSWORD_CHANGE");

  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    throw new Error("PASSWORD_CONFIRMATION_MISMATCH");
  }

  const [rows] = await pool.query<any[]>(
    `SELECT id, its_no, member_name, password_hash, is_active
     FROM member_accounts WHERE id = :id LIMIT 1`,
    { id: memberId }
  );
  const account = rows[0];
  if (!account || !account.is_active) throw new Error("INVALID_PASSWORD_CHANGE");

  const ok = await bcrypt.compare(currentPassword, account.password_hash);
  if (!ok) throw new Error("INVALID_PASSWORD_CHANGE");

  const policyError = validateMemberPassword(newPassword);
  if (policyError) {
    const err = new Error("PASSWORD_POLICY");
    (err as any).detail = policyError;
    throw err;
  }

  // FR-021. Checked against the stored hash rather than the supplied current password, so it
  // holds even if the two were submitted inconsistently.
  if (await bcrypt.compare(newPassword, account.password_hash)) {
    throw new Error("PASSWORD_REUSED");
  }

  const password_hash = await bcrypt.hash(newPassword, 10);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `UPDATE member_accounts
       SET password_hash = :password_hash,
           must_change_password = 0,
           password_changed_at = NOW()
       WHERE id = :id`,
      { password_hash, id: memberId }
    );

    // Every refresh token issued before now is dead (FR-022). The access tokens cannot be
    // deleted — they are stateless — which is why requireMember also checks the timestamp.
    await connection.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_role = 'member' AND user_id = :id AND revoked_at IS NULL`,
      { id: memberId }
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  // Re-read the stamp the UPDATE just wrote, so the fresh token carries the NEW value and
  // passes requireMember's equality check while every older token fails it.
  const [stampRows] = await pool.query<any[]>(
    "SELECT UNIX_TIMESTAMP(password_changed_at) AS epoch FROM member_accounts WHERE id = :id",
    { id: memberId }
  );

  return issueTokens({
    role: "member",
    id: account.id,
    displayName: account.member_name ?? account.its_no,
    memberId: account.id,
    mustChangePassword: false,
    passwordChangedEpoch:
      stampRows[0]?.epoch == null ? null : Number(stampRows[0].epoch)
  });
}

export async function changePassword(params: {
  role: Exclude<Role, "admin" | "member">;
  id: number;
  currentPassword: string;
  newPassword: string;
}) {
  const { role, id, currentPassword, newPassword } = params;
  const current = currentPassword.trim();
  const next = newPassword.trim();
  if (!current || !next) throw new Error("INVALID_PASSWORD_CHANGE");

  const table = tableForSelfServiceRole(role);
  const [rows] = await pool.query<any[]>(`SELECT password_hash FROM ${table} WHERE id = :id LIMIT 1`, { id });
  const account = rows[0];
  if (!account) throw new Error("INVALID_PASSWORD_CHANGE");

  const ok = await bcrypt.compare(currentPassword, account.password_hash);
  if (!ok) throw new Error("INVALID_PASSWORD_CHANGE");

  const password_hash = await bcrypt.hash(newPassword, 10);
  const updatedAtSql = table === "zones" ? ", updated_at = NOW()" : "";
  await pool.query(`UPDATE ${table} SET password_hash = :password_hash${updatedAtSql} WHERE id = :id`, {
    id,
    password_hash
  });
}

async function loadUser(role: Role, id: number): Promise<AuthUser> {
  if (role === "admin") {
    const [rows] = await pool.query<any[]>(
      "SELECT id, username, admin_name, last_login_at FROM admins WHERE id = :id LIMIT 1",
      { id }
    );
    const admin = rows[0];
    if (!admin) throw new Error("INVALID_REFRESH");
    return {
      role,
      id: admin.id,
      displayName: admin.admin_name ?? admin.username,
      lastLoginAt: admin.last_login_at
    };
  }

  if (role === "zonal_head") {
    const [rows] = await pool.query<any[]>(
      "SELECT id, zone_name, last_login_at FROM zones WHERE id = :id LIMIT 1",
      { id }
    );
    const zone = rows[0];
    if (!zone) throw new Error("INVALID_REFRESH");
    return {
      role,
      id: zone.id,
      displayName: zone.zone_name,
      zoneId: zone.id,
      lastLoginAt: zone.last_login_at
    };
  }

  if (role === "party") {
    const [rows] = await pool.query<any[]>(
      "SELECT id, party_name, zone_id, last_login_at FROM parties WHERE id = :id LIMIT 1",
      { id }
    );
    const party = rows[0];
    if (!party) throw new Error("INVALID_REFRESH");
    return {
      role,
      id: party.id,
      displayName: party.party_name,
      zoneId: party.zone_id,
      partyId: party.id,
      lastLoginAt: party.last_login_at
    };
  }

  // As in `authenticate`, this must stay above the venue fallthrough below.
  if (role === "member") {
    const [rows] = await pool.query<any[]>(
      `SELECT id, its_no, member_name, must_change_password, is_active, last_login_at,
              UNIX_TIMESTAMP(password_changed_at) AS password_changed_epoch
       FROM member_accounts
       WHERE id = :id
       LIMIT 1`,
      { id }
    );
    const member = rows[0];
    // A refresh must not resurrect a withdrawn account.
    if (!member || !member.is_active) throw new Error("INVALID_REFRESH");
    return {
      role,
      id: member.id,
      displayName: member.member_name ?? member.its_no,
      memberId: member.id,
      mustChangePassword: Boolean(member.must_change_password),
      passwordChangedEpoch:
        member.password_changed_epoch == null ? null : Number(member.password_changed_epoch),
      lastLoginAt: member.last_login_at
    };
  }

  const [rows] = await pool.query<any[]>(
    `SELECT v.id, v.venue_name, m.zone_id, v.last_login_at
     FROM venues v
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE v.id = :id
     LIMIT 1`,
    { id }
  );
  const venue = rows[0];
  if (!venue) throw new Error("INVALID_REFRESH");
  return {
    role,
    id: venue.id,
    displayName: venue.venue_name,
    zoneId: venue.zone_id,
    venueId: venue.id,
    lastLoginAt: venue.last_login_at
  };
}
