"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashClientIp = hashClientIp;
exports.clientIpFrom = clientIpFrom;
exports.evaluateMemberLoginThrottle = evaluateMemberLoginThrottle;
exports.recordMemberLoginAttempt = recordMemberLoginAttempt;
const node_crypto_1 = __importDefault(require("node:crypto"));
const pool_1 = require("../db/pool");
const env_1 = require("../config/env");
/**
 * Sign-in throttling for MEMBER accounts (FR-014).
 *
 * Scoped to members on purpose. The four existing roles are unthrottled today, and adding it
 * to them would change their behaviour, which FR-102 to FR-104 forbid. Extending it to them
 * is worth doing, but as its own decision.
 *
 * Database-backed rather than in-memory because the backend may run more than one instance:
 * a per-process counter would simply be load-balanced past. It also gives the system its
 * first failed-authentication record, which it has never had.
 *
 * Counted on BOTH the ITS number and the client address. The ITS number alone would let one
 * attacker spray many accounts; the address alone would let a distributed attacker through.
 */
/**
 * Salted SHA-256 of the client address.
 *
 * The raw address is never stored. Equality is all a throttle needs, and a hash supports
 * that, so keeping the address itself would collect personal data the feature does not
 * require.
 */
function hashClientIp(ip) {
    if (!ip)
        return null;
    return node_crypto_1.default.createHash("sha256").update(`${env_1.loginIpHashSalt}:${ip}`).digest("hex");
}
/** Express sets `req.ip`; falls back to the socket address when no trust proxy is configured. */
function clientIpFrom(req) {
    return req.ip ?? req.socket?.remoteAddress ?? undefined;
}
const NOT_THROTTLED = { throttled: false, retryAfterSeconds: 0 };
/**
 * Decides whether this sign-in attempt should be refused before any password is checked.
 *
 * Checked BEFORE bcrypt, which matters: bcrypt at cost 10 is deliberately expensive, so an
 * unthrottled endpoint is a denial-of-service lever as much as a credential-stuffing one.
 *
 * A failure here never blocks a legitimate sign-in: if the query throws, the attempt is
 * allowed through rather than locking everybody out because of a throttle bug.
 */
/**
 * Counts consecutive failures for one key — an ITS number or an address hash — within the
 * rolling window, and returns when the most recent of them happened.
 *
 * "Consecutive" means since that key's own last SUCCESS. Resetting per key matters: a member
 * who mistypes twice and then signs in correctly starts clean, and an address resets when
 * anyone behind it succeeds, instead of accumulating other people's mistakes for ever.
 */
async function countRecentFailures(column, value, windowSeconds) {
    // "Since the last success" is bounded by row ID, not by timestamp.
    //
    // attempted_at is a DATETIME with one-second resolution, and a failure can land in the
    // SAME second as a success — which happens routinely when requests arrive back to back.
    // Comparing `attempted_at >` the success time silently discards those failures, which
    // undercounts and hands an attacker extra attempts for free. Observed in exactly that
    // form: six consecutive failures counted as five.
    //
    // AUTO_INCREMENT ids are strictly ordered, so `id >` is an exact boundary with no
    // granularity to lose. The timestamp is still used for the rolling window, where
    // second-level precision is fine.
    const [rows] = await pool_1.pool.query(`SELECT COUNT(*) AS failures, MAX(UNIX_TIMESTAMP(attempted_at)) AS last_at
     FROM member_login_attempts
     WHERE ${column} = :value
       AND succeeded = 0
       AND attempted_at > DATE_SUB(NOW(), INTERVAL :window_seconds SECOND)
       AND id > COALESCE((
         SELECT MAX(id) FROM member_login_attempts
         WHERE ${column} = :value AND succeeded = 1
       ), 0)`, { value, window_seconds: windowSeconds });
    const row = rows[0] ?? {};
    return { failures: Number(row.failures ?? 0), lastAt: Number(row.last_at ?? 0) };
}
async function evaluateMemberLoginThrottle(params) {
    const { itsNo, ipHash } = params;
    const { maxAttempts, maxAttemptsPerIp, windowSeconds, lockoutSeconds } = env_1.env.memberLogin;
    if (maxAttempts <= 0)
        return NOT_THROTTLED;
    try {
        // The column name is interpolated, but only ever from the two literals in this file's
        // own call sites — never from input. The values stay parameterised.
        const byIts = await countRecentFailures("its_no", itsNo, windowSeconds);
        let lockedAt = null;
        if (byIts.failures >= maxAttempts) {
            lockedAt = byIts.lastAt;
        }
        else if (ipHash && maxAttemptsPerIp > 0) {
            const byIp = await countRecentFailures("ip_hash", ipHash, windowSeconds);
            if (byIp.failures >= maxAttemptsPerIp)
                lockedAt = byIp.lastAt;
        }
        if (lockedAt === null)
            return NOT_THROTTLED;
        const remaining = lockoutSeconds - (Math.floor(Date.now() / 1000) - lockedAt);
        if (remaining <= 0)
            return NOT_THROTTLED;
        return { throttled: true, retryAfterSeconds: remaining };
    }
    catch {
        // Fail open. A broken throttle must not become an outage.
        return NOT_THROTTLED;
    }
}
/**
 * Records the outcome of an attempt, and prunes the log.
 *
 * Failures are never swallowed into the caller's response: recording is best-effort, because
 * a logging problem should not turn a correct sign-in into an error.
 */
async function recordMemberLoginAttempt(params) {
    try {
        await pool_1.pool.query(`INSERT INTO member_login_attempts (its_no, ip_hash, succeeded)
       VALUES (:its_no, :ip_hash, :succeeded)`, {
            its_no: params.itsNo.slice(0, 20),
            ip_hash: params.ipHash,
            succeeded: params.succeeded ? 1 : 0
        });
        // Pruned here rather than on a schedule, because the project has no job runner. Cheap:
        // idx_member_login_attempts_at covers it.
        await pool_1.pool.query(`DELETE FROM member_login_attempts
       WHERE attempted_at < DATE_SUB(NOW(), INTERVAL :days DAY)`, { days: env_1.env.memberLogin.attemptRetentionDays });
    }
    catch {
        // Intentionally ignored.
    }
}
