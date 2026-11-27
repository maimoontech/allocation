"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMBER_SORT_KEYS = exports.memberAdminRoutes = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const authService_1 = require("../services/authService");
const memberProfileService_1 = require("../services/memberProfileService");
const memberCompletionQuery_1 = require("../services/memberCompletionQuery");
const response_1 = require("../utils/response");
/**
 * Administrator and Zonal Head view of member ACCOUNTS (FR-006, FR-007).
 *
 * Shows account state plus the identifying details needed to recognise a person: name parts,
 * photograph, zone and party posting, and WhatsApp and mobile numbers. The LIST stays at
 * that: the twelve-tab answers are not in it, so a page of fifty members is not a page of
 * fifty medical records (FR-101).
 *
 * One figure is DERIVED from those answers without being one of them: `completion_percent`
 * (FR-112b), how much of the form that member has filled in. The query reads presence - 1 or
 * 0 per field - never a value, and the presence columns are consumed in this file and left
 * out of the response. So the list says how far along a member is without saying anything
 * about what they wrote, which is the whole reason the measure was built on presence.
 *
 * The full profile is a separate, deliberate request — `GET /:id/profile`, one member at a
 * time, which both roles may make and which does include the Tab 6 health values under
 * FR-065 as amended on 2026-11-06.
 *
 * Two roles reach this router and they see different things:
 *   - admin       every account, including those with no profile row yet
 *   - zonal_head  only accounts whose PROFILE places them in that head's own zone
 *
 * A Zonal Head's scope therefore depends on `member_profiles.zone_id`, the same source
 * memberPhotoApprovalRoutes already scopes by. One consequence is deliberate and is stated
 * in the UI: an account created here has no profile yet, so it is in NO zone, and a Zonal
 * Head cannot see it until the member chooses their zone in Tab 2. Scoping zone-less
 * accounts to whoever created them was rejected — it needs a column recording who
 * provisioned them, and showing every zone-less account to every Zonal Head would leak one
 * zone's new members into another zone's list.
 *
 * Single accounts are created here (ITS number, name, password); rosters still go through
 * the import route. Both hash with bcrypt cost 10 and both set `must_change_password`, so a
 * provisioned password is a one-time credential whichever way it was issued (FR-004, FR-015).
 */
exports.memberAdminRoutes = (0, express_1.Router)();
exports.memberAdminRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["admin", "zonal_head"]));
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
const MAX_MEMBER_NAME = 150;
/**
 * The orders this list may be returned in (FR-006b).
 *
 * A WHITELIST, and the only reason it is a whitelist is that an ORDER BY cannot be a bound
 * parameter: the text goes into the statement verbatim, so the text must never come from the
 * caller. An unrecognised value falls back to `its_no` rather than being refused, because a
 * stale bookmark is not worth an error page.
 *
 * Two details that are easy to get wrong and are deliberate here:
 *
 *   NULLS LAST. MySQL sorts NULL first ascending, so sorting by Party would open the list
 *   with every member who has not chosen one - burying the thing the operator asked to see.
 *   The leading `(... IS NULL)` term pushes the blanks to the end in both directions.
 *
 *   A TIE-BREAK on `its_no` in every order. Without one, two members in the same Party come
 *   back in whatever order the engine chose that time, which makes paging through the list
 *   skip and repeat rows between pages.
 */
const NAME_FOR_SORT = `COALESCE(NULLIF(TRIM(mp.name), ''), NULLIF(TRIM(ma.member_name), ''))`;
const SORT_ORDERS = {
    its_no: "ma.its_no ASC",
    // The member's own first name, falling back to the roster name on the account. NOT the
    // composed full name: that begins with the prefix, so it would sort every Mulla before
    // every Sheikh and look like no sort at all.
    name: `(${NAME_FOR_SORT} IS NULL), ${NAME_FOR_SORT} ASC, mp.surname ASC, ma.its_no ASC`,
    party: "(p.party_name IS NULL), p.party_name ASC, ma.its_no ASC",
    zone: "(z.zone_name IS NULL), z.zone_name ASC, ma.its_no ASC",
    recent_login: "(ma.last_login_at IS NULL), ma.last_login_at DESC, ma.its_no ASC",
    newest: "ma.created_at DESC, ma.its_no ASC"
};
/**
 * The two orders that CANNOT be expressed as an ORDER BY (FR-006d).
 *
 * Completion is not a column. It is questions answered over questions ASKED, and what a
 * member is asked depends on their own answers - a Student is not asked for an employer, a
 * Solo member has no Party, a member who is not a Muntasib is not asked a Farig Year. Those
 * rules live in `memberFormCompletion`, as a readable function, deliberately: the earlier
 * note on the list query says the same thing, that a CASE expression nobody would maintain is
 * the wrong home for them.
 *
 * So these two keys are not in `SORT_ORDERS` and are ranked in a pass of their own below.
 * The alternative - a second definition of completion written in SQL purely to sort by - is
 * how a row comes to read 76% in a list ordered as though it were something else.
 */
const COMPLETION_SORTS = {
    completion_asc: "asc",
    completion_desc: "desc"
};
/**
 * How many accounts the ranking pass will read before it gives up and returns the list in ITS
 * number order instead.
 *
 * Ranking by completion means computing it for EVERY account the filters match, not just the
 * fifty on the page, because page 2 of "least complete first" is meaningless unless page 1
 * was drawn from the whole set. That pass reads presence bits - one TINYINT per field, no
 * values - so it is cheap per row, but it is still linear in the filtered set.
 *
 * 20,000 is far above this organisation's membership and far below anything that would hold a
 * request open. Crossing it does NOT error: the response reports `sort` as the order it
 * actually used, the page shows that order in its control, and an operator who needs the
 * ranking narrows the search. Silently serving a mislabelled order would be the real failure.
 */
const MAX_COMPLETION_RANK_ROWS = 20000;
exports.MEMBER_SORT_KEYS = [...Object.keys(SORT_ORDERS), ...Object.keys(COMPLETION_SORTS)];
function sortKeyFor(raw) {
    const key = String(raw ?? "").trim();
    return key in SORT_ORDERS || key in COMPLETION_SORTS ? key : "its_no";
}
/**
 * The zone this request is confined to, or null for an administrator, who is not confined.
 *
 * `false` means the caller is a Zonal Head whose token carries no usable zone. That is a
 * broken token, not a "see everything" case, so callers refuse the request rather than fall
 * through to an unscoped query.
 */
function requestZoneScope(user) {
    if (user.role !== "zonal_head")
        return null;
    const zoneId = Number(user.zoneId);
    return Number.isInteger(zoneId) && zoneId > 0 ? zoneId : false;
}
exports.memberAdminRoutes.get("/", async (req, res, next) => {
    const scope = requestZoneScope(req.user);
    if (scope === false)
        return (0, response_1.fail)(res, "Forbidden", 403);
    const q = String(req.query.q ?? "").trim();
    const isActiveRaw = String(req.query.is_active ?? "").trim();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.page_size ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
    const conditions = [];
    const params = {};
    // A Zonal Head sees only their own zone. `mp.zone_id` sits on the LEFT JOINed profile, so
    // this also excludes accounts with no profile at all — which is correct: such an account
    // is in no zone, and claiming it for this zone would be a guess.
    if (scope !== null) {
        conditions.push("mp.zone_id = :scope_zone_id");
        params.scope_zone_id = scope;
    }
    if (q) {
        // Matches the ITS number, the roster name, the full name stored on the profile, or the
        // member's PARTY (FR-006b) — one box rather than a second one, because "Hizb al Hussain"
        // and "10012345" are never going to be confused for each other, and an operator looking
        // for a Party should not have to notice which field to type it into.
        // `LIKE` with a leading wildcard cannot use the index, which is fine at this table's
        // size and keeps the search forgiving.
        conditions.push(`(ma.its_no LIKE :q
        OR ma.member_name LIKE :q
        OR CONCAT_WS(' ', mp.first_prefix, mp.name, mp.father_prefix, mp.father_name, mp.surname) LIKE :q
        OR p.party_name LIKE :q)`);
        params.q = `%${q}%`;
    }
    if (isActiveRaw === "true" || isActiveRaw === "1") {
        conditions.push("ma.is_active = 1");
    }
    else if (isActiveRaw === "false" || isActiveRaw === "0") {
        conditions.push("ma.is_active = 0");
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    // From the whitelist above, never from the caller's text: an ORDER BY cannot be bound.
    // An unrecognised key resolves to `its_no` and is reported as such in the response, so the
    // page shows the order it actually got rather than the one it asked for.
    const sortKey = sortKeyFor(req.query.sort);
    try {
        // The joins MIRROR the list query below, including the two this count does not read.
        // `where` is shared between the two statements, so a condition that is valid in one must
        // be valid in the other: adding `p.party_name` to the search broke this count until the
        // parties join came with it, and the next column somebody searches on would break it
        // again. Both are LEFT JOINs on unique keys, so neither changes the count.
        const [countRows] = await pool_1.pool.query(`SELECT COUNT(*) AS total
       FROM member_accounts ma
       LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
       LEFT JOIN zones z ON z.id = mp.zone_id
       LEFT JOIN parties p ON p.id = mp.party_id
       ${where}`, params);
        const total = Number(countRows[0]?.total ?? 0);
        /**
         * FR-006d. Ordering by completion, which needs a pass of its own.
         *
         * WHY A WHOLE-SET PASS AND NOT AN ORDER BY
         *   Completion is computed, conditionally, per member. There is no column to sort on, and
         *   writing one in SQL would mean a second definition of the measure - the thing this
         *   module has gone out of its way to avoid, because two definitions is how a row reads
         *   76% inside a list ordered as if it read something else.
         *
         * WHY THE WHOLE FILTERED SET AND NOT THIS PAGE
         *   "Least complete first" is a claim about everybody the filters match. Ranking only the
         *   fifty rows a LIMIT already chose would sort each page within itself and leave the
         *   pages in ITS-number order - which looks sorted, page by page, and is not. So the
         *   ranking reads every matching account, orders it, and only then takes this page's
         *   slice. That slice is a list of ids, and the display query below is confined to them.
         *
         * WHAT THE PASS READS
         *   Presence bits and the eight discriminants. No profile value, exactly as elsewhere -
         *   so ordering the list by how complete it is reads nothing about what anybody wrote.
         */
        const rankDirection = COMPLETION_SORTS[sortKey];
        let effectiveSort = sortKey;
        let rankedIds = null;
        const rankedCompletion = new Map();
        if (rankDirection) {
            if (total > MAX_COMPLETION_RANK_ROWS) {
                // Reported, not hidden. See MAX_COMPLETION_RANK_ROWS.
                effectiveSort = "its_no";
            }
            else {
                const [rankRows] = await pool_1.pool.query(`SELECT ma.id,
                  ma.its_no,
                  ${memberCompletionQuery_1.COMPLETION_SELECT}
           FROM member_accounts ma
           LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
           LEFT JOIN member_photos ph ON ph.member_account_id = ma.id
           LEFT JOIN zones z ON z.id = mp.zone_id
           LEFT JOIN parties p ON p.id = mp.party_id
           ${where}`, params);
                const ranked = rankRows.map((r) => ({
                    id: Number(r.id),
                    its_no: String(r.its_no ?? ""),
                    completion: (0, memberCompletionQuery_1.completionFor)(r)
                }));
                // The tie-break is `its_no`, for the reason every order in SORT_ORDERS has one:
                // without it, two members on the same percentage come back in whatever order the
                // engine chose that time, and paging skips and repeats rows between pages. ITS
                // numbers are fixed-length digit strings, so comparing them as strings is the same
                // order MySQL's `ma.its_no ASC` gives.
                const direction = rankDirection === "desc" ? -1 : 1;
                ranked.sort((a, b) => {
                    if (a.completion.percent !== b.completion.percent) {
                        return (a.completion.percent - b.completion.percent) * direction;
                    }
                    return a.its_no < b.its_no ? -1 : a.its_no > b.its_no ? 1 : 0;
                });
                const offset = (page - 1) * pageSize;
                const slice = ranked.slice(offset, offset + pageSize);
                rankedIds = slice.map((r) => r.id);
                for (const r of slice)
                    rankedCompletion.set(r.id, r.completion);
            }
        }
        const orderBy = SORT_ORDERS[effectiveSort];
        // A page past the end of a ranked list: no ids, so there is nothing to ask the database
        // for. Returning here rather than building `IN ()`, which is a syntax error.
        if (rankedIds !== null && rankedIds.length === 0) {
            return (0, response_1.ok)(res, { items: [], total, page, page_size: pageSize, sort: effectiveSort }, "OK");
        }
        // One placeholder per id rather than one bound array. The pool runs with
        // `namedPlaceholders`, and how an array is expanded there is a property of the driver's
        // patch version; a named placeholder per id is a question nobody has to look up. At most
        // MAX_PAGE_SIZE of them, so the statement stays a sane length.
        const rankPlaceholders = rankedIds
            ? rankedIds.map((_, i) => `:rank_id_${i}`).join(", ")
            : "";
        const rankParams = {};
        if (rankedIds)
            rankedIds.forEach((id, i) => (rankParams[`rank_id_${i}`] = id));
        // The filters are re-applied ALONGSIDE the id list, not replaced by it. The ids came from
        // the scoped ranking query above, so this is belt and braces - but a Zonal Head's scope is
        // exactly the condition that must not depend on one query having got it right earlier.
        const listWhere = rankedIds
            ? `WHERE ma.id IN (${rankPlaceholders})${conditions.length ? ` AND ${conditions.join(" AND ")}` : ""}`
            : where;
        // FIELD() keeps the ranked order, which the id list alone does not carry.
        const listOrderBy = rankedIds ? `FIELD(ma.id, ${rankPlaceholders})` : orderBy;
        // The ranking pass already took this page's slice, so the LIMIT below has nothing left to
        // do on that path - but it STAYS IN THE QUERY TEXT, and the offset becomes 0.
        //
        // Moving it into a ${hole} would have been tidier and would have cost real safety: the
        // guard in `sqlNamedPlaceholders.test.ts` scans source for literals carrying `:name`, so
        // a query whose only placeholders arrive through a hole drops out of the set it checks.
        // This query is the one that has twice gone to production broken. It stays in the set.
        const listOffset = rankedIds ? 0 : (page - 1) * pageSize;
        /**
         * NOTHING BUT SQL GOES INSIDE THIS TEMPLATE LITERAL. No `--` comment, however useful.
         *
         * Every other query in this codebase already follows that rule; this one did not, and it
         * took the member list down twice in a day. The pool runs with `namedPlaceholders`, so
         * each query passes through a tokeniser on its way out, and that tokeniser does not know
         * what an SQL comment is. Two separate failures came of it:
         *
         *   1. An apostrophe in the prose - "the other's reason" - read as the start of a string
         *      literal, swallowed the remainder of the statement, and left `:limit` and `:offset`
         *      in the text. MySQL answered ER_PARSE_ERROR.
         *   2. Writing `:limit` in the prose, while explaining the first failure, made the
         *      tokeniser find FOUR placeholders where the statement has two. Whether that is
         *      harmless depends on whether the formatter downstream happens to skip comments,
         *      which is a property of a patch version rather than a guarantee. If it does not,
         *      the values land in the wrong clauses.
         *
         * So the hazard is the comment, not the apostrophe and not the colon. Explanations about
         * a query belong here, in TypeScript, where they are read by people and by nothing else.
         *
         * WHAT THE COMPLETION FRAGMENT ADDS (FR-112b)
         *   Presence, 1 or 0 per field, never a value. Those columns are consumed in this file
         *   and left out of the response: what goes back is the percentage computed from them.
         *   The fragment requires the aliases `mp` and `ph`, and both are LEFT JOINed below, so
         *   an account with no profile row scores 0% instead of dropping out of the list.
         *
         *   `first_prefix` is therefore selected twice - once above as a name part, once in the
         *   fragment as a discriminant. MySQL allows it and both are the same value; dropping
         *   either would tie the response to the other one's reason for being there.
         */
        const [rows] = await pool_1.pool.query(`SELECT ma.id,
              ma.its_no,
              ma.member_name,
              ma.must_change_password,
              ma.is_active,
              IF(mp.id IS NULL, 0, 1) AS has_profile,
              IF(ph.id IS NULL, 0, 1) AS has_photo,
              mp.first_prefix,
              mp.name,
              mp.father_prefix,
              mp.father_name,
              mp.surname,
              z.zone_name,
              p.party_name,
              mp.whatsapp_no_1,
              mp.whatsapp_no_2,
              mp.mobile_no_1,
              mp.mobile_no_2,
              ma.last_login_at,
              ma.created_at,
              ${memberCompletionQuery_1.COMPLETION_SELECT}
       FROM member_accounts ma
       LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
       LEFT JOIN member_photos ph ON ph.member_account_id = ma.id
       LEFT JOIN zones z ON z.id = mp.zone_id
       LEFT JOIN parties p ON p.id = mp.party_id
       ${listWhere}
       ORDER BY ${listOrderBy}
       LIMIT :limit OFFSET :offset`, { ...params, ...rankParams, limit: pageSize, offset: listOffset });
        return (0, response_1.ok)(res, {
            items: rows.map((r) => {
                // FR-112b. The same measure the dashboard averages, applied to this one member, so
                // a row reading 76% and the figure it is counted in cannot disagree. Computed per
                // row rather than in SQL because the rules are conditional - a Student is not asked
                // for an employer, a Solo member has no Party - and those rules live in one
                // readable function rather than in a CASE expression nobody would maintain.
                //
                // FR-006d. When the list was RANKED by completion, the figure carried over from
                // that pass is used rather than recomputed from this second read. The row then
                // shows the number it was ordered by, even in the case where the member saved
                // between the two queries - a row reading 80% inside "least complete first" would
                // look like a bug in the sort rather than the honest race it is.
                const completion = rankedCompletion.get(Number(r.id)) ?? (0, memberCompletionQuery_1.completionFor)(r);
                return {
                    id: Number(r.id),
                    its_no: r.its_no,
                    member_name: r.member_name,
                    must_change_password: Boolean(r.must_change_password),
                    is_active: Boolean(r.is_active),
                    has_profile: Boolean(r.has_profile),
                    has_photo: Boolean(r.has_photo),
                    first_prefix: r.first_prefix,
                    name: r.name,
                    father_prefix: r.father_prefix,
                    father_name: r.father_name,
                    surname: r.surname,
                    zone_name: r.zone_name,
                    party_name: r.party_name,
                    whatsapp_no_1: r.whatsapp_no_1,
                    whatsapp_no_2: r.whatsapp_no_2,
                    mobile_no_1: r.mobile_no_1,
                    mobile_no_2: r.mobile_no_2,
                    last_login_at: r.last_login_at,
                    created_at: r.created_at,
                    // 0-100. How much of the twelve-tab form THIS member has answered.
                    completion_percent: completion.percent,
                    // The two halves of that fraction, so the page can say "22 of 42 questions"
                    // rather than leave a bare percentage to be taken on trust. The denominator
                    // differs between members by design: it counts only what each was asked.
                    completion_answered: completion.answered,
                    completion_asked: completion.asked
                };
            }),
            total,
            page,
            page_size: pageSize,
            // The order ACTUALLY used, which is not always the one asked for: an unrecognised key
            // falls back to `its_no`, and so does a completion ranking over
            // MAX_COMPLETION_RANK_ROWS. The page reads this back into its own control.
            sort: effectiveSort
        }, "OK");
    }
    catch (err) {
        // Handed to the terminal error boundary rather than swallowed here.
        //
        // This catch used to answer "Failed to list members" and discard the error. It cost a
        // real diagnosis: the list started failing after a change to this query, and the only
        // evidence anywhere was a message that said no more than the browser already showed.
        // The boundary writes the one line this application permits itself - a reference, the
        // method, the path, the driver error code and the error class, never the message and
        // never `err.sql` (FR-066, see `utils/errorRef.ts`) - and returns that reference to the
        // caller, so a report of "it will not load" can be matched to a specific failure.
        return next(err);
    }
});
/**
 * Creates ONE member account: the basic entry an Admin or Zonal Head needs so a person can
 * sign in and fill their own profile — ITS number, full name, password.
 *
 * Only those three. Zone, party and every profile answer belong to the member's own twelve
 * tabs, so nothing here pre-empts them.
 *
 * `member_name` is the roster name held on the ACCOUNT, which exists so a list reads
 * sensibly before Tab 1 is filled. It is not the profile's name parts and does not become
 * them: the member enters those, and the list prefers them once present.
 *
 * The password is checked against the member policy (FR-020, FR-021) even though it is
 * temporary. The member must replace it at first sign-in, and refusing a weak one here is
 * cheaper than the member meeting the same rule later with no idea why. It is hashed with
 * bcrypt cost 10 and never returned.
 */
exports.memberAdminRoutes.post("/", async (req, res) => {
    const scope = requestZoneScope(req.user);
    if (scope === false)
        return (0, response_1.fail)(res, "Forbidden", 403);
    const body = (req.body ?? {});
    const itsNo = String(body.its_no ?? "").trim();
    const memberName = String(body.member_name ?? "").trim();
    // Not trimmed and not coerced: a non-string password is absent, and trimming would accept
    // a password the member could never retype. The policy rejects outer spaces itself.
    const password = typeof body.password === "string" ? body.password : "";
    // ITS numbers are digits. Rejecting anything else keeps a mistyped field from silently
    // creating an unusable account (FR-008). Same rule as the import route.
    if (!/^\d{6,20}$/.test(itsNo)) {
        return (0, response_1.fail)(res, "ITS No must be 6 to 20 digits.", 400);
    }
    if (!memberName) {
        return (0, response_1.fail)(res, "Full name is required.", 400);
    }
    if (memberName.length > MAX_MEMBER_NAME) {
        return (0, response_1.fail)(res, `Full name must be ${MAX_MEMBER_NAME} characters or fewer.`, 400);
    }
    const policyError = (0, authService_1.validateMemberPassword)(password);
    if (policyError)
        return (0, response_1.fail)(res, policyError, 400);
    try {
        const password_hash = await bcryptjs_1.default.hash(password, 10);
        // must_change_password defaults to 1 in the schema and is set explicitly here so the
        // intent is visible at the call site (FR-004). password_changed_at stays NULL, which is
        // what marks this password as never having been the member's own (FR-005).
        const [result] = await pool_1.pool.query(`INSERT INTO member_accounts
         (its_no, member_name, password_hash, must_change_password, password_changed_at, is_active)
       VALUES (:its_no, :member_name, :password_hash, 1, NULL, 1)`, { its_no: itsNo, member_name: memberName, password_hash });
        return (0, response_1.ok)(res, {
            id: Number(result?.insertId ?? 0),
            its_no: itsNo,
            member_name: memberName,
            is_active: true,
            must_change_password: true
        }, `Member ${itsNo} created. They must change this password at first sign-in.`);
    }
    catch (err) {
        // uq_member_accounts_its_no. Named rather than generic so the operator knows the ITS
        // number is taken instead of retyping it expecting a different result.
        if (err?.code === "ER_DUP_ENTRY") {
            return (0, response_1.fail)(res, `ITS No ${itsNo} already has a member account.`, 409);
        }
        return (0, response_1.fail)(res, "Failed to create member", 500);
    }
});
/**
 * The member's current photograph, for the member list.
 *
 * Served as bytes behind the role guard rather than as a data URL in the list payload: a
 * list of fifty members would otherwise carry tens of megabytes. Approval status is not
 * filtered, because an administrator is the party that approves it.
 */
exports.memberAdminRoutes.get("/:id/photo", async (req, res) => {
    const scope = requestZoneScope(req.user);
    if (scope === false)
        return (0, response_1.fail)(res, "Forbidden", 403);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    try {
        const [rows] = await pool_1.pool.query(`SELECT ph.content_type, ph.byte_size, ph.sha256, ph.image_data, mp.zone_id
       FROM member_photos ph
       LEFT JOIN member_profiles mp ON mp.member_account_id = ph.member_account_id
       WHERE ph.member_account_id = :id
       LIMIT 1`, { id });
        const photo = rows[0];
        if (!photo)
            return (0, response_1.fail)(res, "No photo set", 404);
        if (scope !== null && Number(photo.zone_id) !== scope)
            return (0, response_1.fail)(res, "Forbidden", 403);
        res.setHeader("Content-Type", photo.content_type);
        res.setHeader("Content-Length", String(photo.byte_size));
        res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
        res.setHeader("ETag", `"${photo.sha256}"`);
        if (req.headers["if-none-match"] === `"${photo.sha256}"`) {
            return res.status(304).end();
        }
        return res.status(200).end(photo.image_data);
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load photo", 500);
    }
});
/**
 * Confirms the caller may act on this member, and returns their zone.
 *
 * One helper for both profile routes so the check cannot be written two slightly different
 * ways. It reads the zone BEFORE anything else happens, which is what stops a refusal from
 * following a completed read or write.
 */
async function assertMemberInScope(id, scope) {
    const [rows] = await pool_1.pool.query(`SELECT ma.id, mp.zone_id
     FROM member_accounts ma
     LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
     WHERE ma.id = :id
     LIMIT 1`, { id });
    const row = rows[0];
    if (!row)
        return "not_found";
    if (scope !== null && Number(row.zone_id) !== scope)
        return "forbidden";
    return "ok";
}
/**
 * One member's full twelve-tab profile, for an administrator or a Zonal Head.
 *
 * FR-047a, authorised 2026-11-06. This DOES include the Tab 6 health values. FR-065 already
 * allowed "explicitly authorised administrators" to read them; extending that to Zonal Heads
 * for their own zone is the new part, and it was authorised explicitly rather than inferred.
 *
 * A Zonal Head is confined to their own zone, derived from `member_profiles.zone_id` exactly
 * as the list and the photo endpoint derive it. A member with no profile row is therefore in
 * no zone and is invisible to every Zonal Head — the same consequence stated for FR-006a.
 */
exports.memberAdminRoutes.get("/:id/profile", async (req, res) => {
    const scope = requestZoneScope(req.user);
    if (scope === false)
        return (0, response_1.fail)(res, "Forbidden", 403);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    try {
        const verdict = await assertMemberInScope(id, scope);
        if (verdict === "not_found")
            return (0, response_1.fail)(res, "Member not found", 404);
        if (verdict === "forbidden")
            return (0, response_1.fail)(res, "Forbidden", 403);
        const profile = await (0, memberProfileService_1.readMemberProfile)(id);
        if (!profile)
            return (0, response_1.fail)(res, "Member not found", 404);
        // Stated in the payload rather than re-derived in the browser, so the client cannot
        // enable editing for a Zonal Head by lying to itself. The server refuses regardless.
        return (0, response_1.ok)(res, { ...profile, can_edit: req.user.role === "admin" }, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load profile", 500);
    }
});
/**
 * An administrator corrects one member's profile. ADMIN ONLY — a Zonal Head reads.
 *
 * Every edit writes a row to `member_profile_edits` naming the fields that changed, because
 * a value an administrator can change without trace is a value nobody can later defend. The
 * row holds field NAMES only: Tab 6 is medical data and FR-066 says health values appear in
 * no log, so copying them into an audit table would simply move the problem.
 */
exports.memberAdminRoutes.put("/:id/profile", (0, auth_1.requireRole)(["admin"]), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    const payload = req.body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return (0, response_1.fail)(res, "Invalid request", 400);
    }
    try {
        const verdict = await assertMemberInScope(id, null);
        if (verdict === "not_found")
            return (0, response_1.fail)(res, "Member not found", 404);
        const result = await (0, memberProfileService_1.saveMemberProfile)(id, payload);
        if (!result.ok && result.kind === "conflict") {
            return (0, response_1.fail)(res, "This profile was changed in another session. Reload it and apply your edits again.", 409);
        }
        if (!result.ok) {
            return (0, response_1.fail)(res, "Please correct the highlighted fields.", 400, { errors: result.errors });
        }
        // After the save, and only on success: an audit row for a write that did not happen
        // would be worse than none. `if_unmodified_since` is the concurrency stamp, not a
        // profile field, so it is not reported as a change.
        const changed = Object.keys(payload).filter((k) => k !== "if_unmodified_since");
        await pool_1.pool.query(`INSERT INTO member_profile_edits
         (member_account_id, edited_by_admin_id, edited_by_role, changed_fields)
       VALUES (:member_account_id, :admin_id, 'admin', :changed_fields)`, {
            member_account_id: id,
            admin_id: req.user.id,
            changed_fields: JSON.stringify(changed)
        });
        const profile = await (0, memberProfileService_1.readMemberProfile)(id);
        return (0, response_1.ok)(res, { ...profile, can_edit: true }, "Profile saved");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to save profile", 500);
    }
});
/**
 * An administrator resets one member's password. ADMIN ONLY.
 *
 * FR-005a, authorised 2026-11-08. FR-005 said a member who has chosen their own password
 * keeps it, and the activate/deactivate route still honours that — it is amended here only
 * for this deliberate, audited action, which exists because a member who cannot sign in has
 * no other way back in.
 *
 * FOUR THINGS HAPPEN TOGETHER, in one transaction, and each matters:
 *
 *   1. The new hash, at bcrypt cost 10, matching every other password this system stores.
 *   2. `must_change_password = 1`. The administrator now knows this password, so it is a
 *      one-time credential exactly like a provisioned one (FR-004).
 *   3. `password_changed_at = NOW()` — NOT NULL, which is what the create route uses.
 *      This is the subtle one. `requireMember` compares the token's stamp to this column
 *      for EQUALITY, so writing NULL would leave every token minted while it was already
 *      NULL still valid: whoever is signed in as that member stays signed in, through the
 *      very reset meant to lock them out. NOW() cannot collide with an older token.
 *   4. Refresh tokens revoked. Access tokens are stateless and die by (3); refresh tokens
 *      are rows and would otherwise mint fresh ones straight past it.
 *
 * Failed login attempts are cleared too. A locked-out member is the commonest reason to
 * reset at all, and leaving the lockout in place would mean the reset appeared to work and
 * changed nothing they could observe.
 *
 * The response carries no password material (FR-015). The administrator already has the
 * value — they chose it — and echoing it back only puts it somewhere else.
 */
exports.memberAdminRoutes.post("/:id/reset-password", (0, auth_1.requireRole)(["admin"]), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    const body = req.body ?? {};
    const password = typeof body.password === "string" ? body.password : "";
    const policyError = (0, authService_1.validateMemberPassword)(password);
    if (policyError)
        return (0, response_1.fail)(res, policyError, 400);
    try {
        const [rows] = await pool_1.pool.query("SELECT id, its_no, member_name FROM member_accounts WHERE id = :id LIMIT 1", { id });
        const account = rows[0];
        if (!account)
            return (0, response_1.fail)(res, "Member not found", 404);
        const password_hash = await bcryptjs_1.default.hash(password, 10);
        const connection = await pool_1.pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query(`UPDATE member_accounts
         SET password_hash = :password_hash,
             must_change_password = 1,
             password_changed_at = NOW()
         WHERE id = :id`, { password_hash, id });
            await connection.query(`UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE user_role = 'member' AND user_id = :id AND revoked_at IS NULL`, { id });
            // The lockout is counted by ITS number, so it is cleared by ITS number.
            await connection.query("DELETE FROM member_login_attempts WHERE its_no = :its_no", {
                its_no: account.its_no
            });
            await connection.query(`INSERT INTO member_password_resets (member_account_id, reset_by_admin_id)
         VALUES (:member_account_id, :admin_id)`, { member_account_id: id, admin_id: req.user.id });
            await connection.commit();
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
        return (0, response_1.ok)(res, {
            id: Number(account.id),
            its_no: account.its_no,
            member_name: account.member_name,
            must_change_password: true
        }, "Password reset. The member must change it at their next sign-in.");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to reset the password", 500);
    }
});
/**
 * Activates or deactivates one account.
 *
 * `is_active` is the ONLY field this accepts. A password cannot be changed here, so a member
 * who has chosen their own keeps it (FR-005); and nothing about the member's own profile is
 * touched, because FR-007 requires a withdrawn member's data to be retained, not removed.
 */
exports.memberAdminRoutes.patch("/:id", async (req, res) => {
    const scope = requestZoneScope(req.user);
    if (scope === false)
        return (0, response_1.fail)(res, "Forbidden", 403);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    const { is_active } = (req.body ?? {});
    if (typeof is_active !== "boolean") {
        return (0, response_1.fail)(res, "is_active must be true or false", 400);
    }
    try {
        // Read first, for two reasons: a Zonal Head must be refused a member outside their zone
        // before anything is written, and `affectedRows` cannot tell "no such row" apart from
        // "the value was already what was asked for".
        const [existingRows] = await pool_1.pool.query(`SELECT ma.id, mp.zone_id
       FROM member_accounts ma
       LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
       WHERE ma.id = :id
       LIMIT 1`, { id });
        const existing = existingRows[0];
        if (!existing)
            return (0, response_1.fail)(res, "Member not found", 404);
        if (scope !== null && Number(existing.zone_id) !== scope) {
            return (0, response_1.fail)(res, "Forbidden", 403);
        }
        await pool_1.pool.query("UPDATE member_accounts SET is_active = :is_active WHERE id = :id", {
            is_active: is_active ? 1 : 0,
            id
        });
        // Deactivating does not revoke the member's refresh tokens here. It does not need to:
        // requireMember reads is_active on every request, so an open session stops working on
        // its next call (FR-007).
        return (0, response_1.ok)(res, { id, is_active }, is_active ? "Member activated" : "Member deactivated");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to update member", 500);
    }
});
