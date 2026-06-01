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
  mohallahId?: number;
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

function tableForSelfServiceRole(role: Exclude<Role, "admin">) {
  if (role === "zonal_head") return "zones";
  if (role === "party") return "parties";
  return "mohallahs";
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

  const query = isNumericId(idOrName)
    ? "SELECT id, mohallah_name, zone_id, password_hash, last_login_at FROM mohallahs WHERE id = :id LIMIT 1"
    : "SELECT id, mohallah_name, zone_id, password_hash, last_login_at FROM mohallahs WHERE mohallah_name = :name LIMIT 1";
  const lookup = isNumericId(idOrName) ? { id: Number(idOrName) } : { name: idOrName };
  const [rows] = await pool.query<any[]>(query, lookup);
  const mohallah = rows[0];
  if (!mohallah) throw new Error("INVALID_CREDENTIALS");
  const ok = await bcrypt.compare(password, mohallah.password_hash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");

  await pool.query("UPDATE mohallahs SET last_login_at = NOW() WHERE id = :id", { id: mohallah.id });

  const user: AuthUser = {
    role,
    id: mohallah.id,
    displayName: mohallah.mohallah_name,
    zoneId: mohallah.zone_id,
    mohallahId: mohallah.id,
    lastLoginAt: mohallah.last_login_at
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
    mohallahId: user.mohallahId
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
    mohallahId: user.mohallahId
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

export async function changePassword(params: {
  role: Exclude<Role, "admin">;
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

  const [rows] = await pool.query<any[]>(
    "SELECT id, mohallah_name, zone_id, last_login_at FROM mohallahs WHERE id = :id LIMIT 1",
    { id }
  );
  const mohallah = rows[0];
  if (!mohallah) throw new Error("INVALID_REFRESH");
  return {
    role,
    id: mohallah.id,
    displayName: mohallah.mohallah_name,
    zoneId: mohallah.zone_id,
    mohallahId: mohallah.id,
    lastLoginAt: mohallah.last_login_at
  };
}
