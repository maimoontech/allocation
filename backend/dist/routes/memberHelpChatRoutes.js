"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpChatAdminRoutes = exports.memberHelpChatRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const requireMember_1 = require("../middleware/requireMember");
const helpChatKnowledge_1 = require("../services/helpChatKnowledge");
const response_1 = require("../utils/response");
/**
 * The Need Help chat (FR-110).
 *
 * A member asks a question about filling in their profile, the agent answers from the
 * knowledge base, and the member rates the answer out of five. Every exchange is stored
 * with the ITS number and name as they were at the time.
 *
 * The answer is produced on the SERVER, not in the browser. Two reasons: the knowledge base
 * restates rules the server enforces and belongs beside them, and a reply that was never
 * stored is a rating nobody can interpret later.
 *
 * Guards are per route, matching `memberProfileRoutes`: a router-wide `requireMember()`
 * would answer an administrator's request to a *different* router with 403 before that
 * router was consulted.
 */
exports.memberHelpChatRoutes = (0, express_1.Router)();
const MAX_QUESTION = 1000;
/**
 * The administrator-written topics, ready for the matcher (FR-110a).
 *
 * Read per question rather than cached: a topic added in the admin screen should answer the
 * very next question, and this is one small indexed table.
 *
 * It fails SOFT. If the table cannot be read the built-in topics still answer, because a
 * member asking for help is the worst moment to return an error about a help system.
 */
async function loadAdminTopics() {
    try {
        const [rows] = await pool_1.pool.query(`SELECT topic_key, label, keywords, answer
       FROM help_topics
       WHERE is_active = 1
       ORDER BY topic_key`);
        return rows.map((r) => ({
            id: String(r.topic_key),
            label: String(r.label),
            keywords: (0, helpChatKnowledge_1.parseKeywords)(String(r.keywords ?? "")),
            answer: String(r.answer)
        }));
    }
    catch {
        return [];
    }
}
/** Ask a question. Returns the reply, and the id to attach a rating to. */
exports.memberHelpChatRoutes.post("/me/help-chats", auth_1.requireAuth, (0, requireMember_1.requireMember)(), async (req, res) => {
    const memberId = req.user.memberId ?? req.user.id;
    const body = req.body ?? {};
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question)
        return (0, response_1.fail)(res, "Please type a question.", 400);
    if (question.length > MAX_QUESTION) {
        return (0, response_1.fail)(res, `A question must be ${MAX_QUESTION} characters or fewer.`, 400);
    }
    try {
        // Name and ITS number are read now and copied onto the row, so the log says who asked
        // at the time rather than who they are today.
        const [rows] = await pool_1.pool.query(`SELECT ma.its_no,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', mp.name, mp.surname)), ''), ma.member_name)
                AS member_name
       FROM member_accounts ma
       LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
       WHERE ma.id = :id
       LIMIT 1`, { id: memberId });
        const account = rows[0];
        if (!account)
            return (0, response_1.fail)(res, "Member not found", 404);
        const { topic, reply } = (0, helpChatKnowledge_1.answerHelpQuestion)(question, await loadAdminTopics());
        const [result] = await pool_1.pool.query(`INSERT INTO member_help_chats
         (member_account_id, its_no, member_name, question, agent_reply, topic)
       VALUES (:member_account_id, :its_no, :member_name, :question, :agent_reply, :topic)`, {
            member_account_id: memberId,
            its_no: account.its_no,
            member_name: account.member_name ?? null,
            question,
            agent_reply: reply,
            topic
        });
        return (0, response_1.ok)(res, { id: Number(result.insertId), reply, topic, answered: topic !== null }, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Could not answer that right now. Please try again.", 500);
    }
});
/**
 * Rate an answer, one to five.
 *
 * Scoped to the member's own rows by `member_account_id` in the WHERE clause, so an id
 * belonging to someone else matches nothing and returns 404 rather than being rated.
 */
exports.memberHelpChatRoutes.patch("/me/help-chats/:id", auth_1.requireAuth, (0, requireMember_1.requireMember)(), async (req, res) => {
    const memberId = req.user.memberId ?? req.user.id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    const rating = Number((req.body ?? {}).star_rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return (0, response_1.fail)(res, "A rating must be between 1 and 5 stars.", 400);
    }
    try {
        const [result] = await pool_1.pool.query(`UPDATE member_help_chats
         SET star_rating = :rating, rated_at = NOW()
         WHERE id = :id AND member_account_id = :member_account_id`, { rating, id, member_account_id: memberId });
        if (result.affectedRows === 0)
            return (0, response_1.fail)(res, "Chat not found", 404);
        return (0, response_1.ok)(res, { id, star_rating: rating }, "Thank you for rating this answer.");
    }
    catch {
        return (0, response_1.fail)(res, "Could not save that rating.", 500);
    }
});
/**
 * Admin → Help Chats. Every exchange, newest first.
 *
 * Administrators only. A Zonal Head is not included: the log is read to find out which
 * questions keep coming up and which answers score badly, which is a question about the
 * form rather than about a zone.
 */
exports.helpChatAdminRoutes = (0, express_1.Router)();
exports.helpChatAdminRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["admin"]));
const PAGE_SIZE = 50;
exports.helpChatAdminRoutes.get("/", async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const rated = String(req.query.rated ?? "all");
    // Only the three shapes below reach SQL; the value is never interpolated.
    const where = rated === "rated"
        ? "WHERE star_rating IS NOT NULL"
        : rated === "unrated"
            ? "WHERE star_rating IS NULL"
            : "";
    try {
        const [rows] = await pool_1.pool.query(`SELECT id, member_account_id, its_no, member_name, question, agent_reply,
              topic, star_rating, created_at
       FROM member_help_chats
       ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT :limit OFFSET :offset`, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
        const [totals] = await pool_1.pool.query(`SELECT COUNT(*) AS total,
              AVG(star_rating) AS average_rating,
              SUM(topic IS NULL) AS unanswered
       FROM member_help_chats ${where}`);
        return (0, response_1.ok)(res, {
            items: rows.map((r) => ({
                ...r,
                star_rating: r.star_rating == null ? null : Number(r.star_rating)
            })),
            total: Number(totals[0]?.total ?? 0),
            average_rating: totals[0]?.average_rating == null ? null : Number(totals[0].average_rating),
            // How often the agent had nothing useful to say: the number worth acting on.
            unanswered: Number(totals[0]?.unanswered ?? 0),
            page,
            page_size: PAGE_SIZE
        }, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load help chats", 500);
    }
});
