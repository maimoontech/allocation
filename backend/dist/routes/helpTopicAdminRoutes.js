"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpTopicAdminRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const helpChatKnowledge_1 = require("../services/helpChatKnowledge");
const response_1 = require("../utils/response");
/**
 * Admin → Help Topics (FR-110a).
 *
 * Topics an administrator writes, on top of the ones in code. A row whose `topic_key`
 * matches a built-in id overrides it; deactivating that row puts the built-in back. The
 * built-ins themselves are not editable here — they restate rules the server enforces and
 * are pinned by tests, so a wrong edit to one is a wrong answer about a real rule.
 *
 * The list returned includes the built-ins, marked `built_in`, so the screen shows one
 * complete picture of what the agent knows rather than only half of it.
 */
exports.helpTopicAdminRoutes = (0, express_1.Router)();
exports.helpTopicAdminRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["admin"]));
const MAX = { key: 60, label: 150, keywords: 500, answer: 8000 };
/** Lower-case letters, digits and underscores: it is stored on every chat row. */
const KEY_RE = /^[a-z0-9_]{2,60}$/;
function readBody(body) {
    return {
        topic_key: typeof body.topic_key === "string" ? body.topic_key.trim().toLowerCase() : "",
        label: typeof body.label === "string" ? body.label.trim() : "",
        keywords: typeof body.keywords === "string" ? body.keywords.trim() : "",
        answer: typeof body.answer === "string" ? body.answer.trim() : ""
    };
}
function validate(v, requireKey) {
    if (requireKey && !KEY_RE.test(v.topic_key)) {
        return "A key must be 2 to 60 characters of lower-case letters, digits or underscores.";
    }
    if (!v.label)
        return "A label is required — it is what members see in the list of subjects.";
    if (v.label.length > MAX.label)
        return `A label must be ${MAX.label} characters or fewer.`;
    if (!v.keywords)
        return "At least one keyword is required, or nothing will reach this topic.";
    if (v.keywords.length > MAX.keywords) {
        return `Keywords must be ${MAX.keywords} characters or fewer.`;
    }
    if (!v.answer)
        return "An answer is required.";
    if (v.answer.length > MAX.answer)
        return `An answer must be ${MAX.answer} characters or fewer.`;
    // The matcher needs 2 points to answer at all. A single unweighted keyword would create a
    // topic that can never be reached, which is worse than refusing to save it.
    const parsed = (0, helpChatKnowledge_1.parseKeywords)(v.keywords);
    const best = parsed.reduce((n, k) => n + (Array.isArray(k) ? k[1] : 1), 0);
    if (best < 2) {
        return ("Give either two keywords, or one marked strong with a trailing * — a single ordinary " +
            "keyword is not enough for this topic to ever be matched.");
    }
    return null;
}
/** Every topic the agent knows: the built-ins, then the administrator's. */
exports.helpTopicAdminRoutes.get("/", async (_req, res) => {
    try {
        const [rows] = await pool_1.pool.query(`SELECT t.id, t.topic_key, t.label, t.keywords, t.answer, t.is_active, t.updated_at,
              COUNT(c.id) AS times_used,
              AVG(c.star_rating) AS average_rating
       FROM help_topics t
       LEFT JOIN member_help_chats c ON c.topic = t.topic_key
       GROUP BY t.id, t.topic_key, t.label, t.keywords, t.answer, t.is_active, t.updated_at
       ORDER BY t.label`);
        const overridden = new Set(rows.filter((r) => r.is_active).map((r) => String(r.topic_key)));
        // Built-ins get their usage too, so the page can show which subjects members actually
        // ask about rather than only which ones were written here.
        const [usage] = await pool_1.pool.query(`SELECT topic, COUNT(*) AS times_used, AVG(star_rating) AS average_rating
       FROM member_help_chats
       WHERE topic IS NOT NULL
       GROUP BY topic`);
        const usageByTopic = new Map(usage.map((u) => [String(u.topic), u]));
        return (0, response_1.ok)(res, {
            built_in: helpChatKnowledge_1.HELP_TOPICS.map((t) => {
                const u = usageByTopic.get(t.id);
                return {
                    topic_key: t.id,
                    label: t.label,
                    overridden: overridden.has(t.id),
                    times_used: Number(u?.times_used ?? 0),
                    average_rating: u?.average_rating == null ? null : Number(u.average_rating)
                };
            }),
            custom: rows.map((r) => ({
                id: Number(r.id),
                topic_key: String(r.topic_key),
                label: String(r.label),
                keywords: String(r.keywords),
                answer: String(r.answer),
                is_active: Boolean(r.is_active),
                overrides_built_in: helpChatKnowledge_1.HELP_TOPICS.some((t) => t.id === String(r.topic_key)),
                times_used: Number(r.times_used ?? 0),
                average_rating: r.average_rating == null ? null : Number(r.average_rating),
                updated_at: r.updated_at
            }))
        }, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load help topics", 500);
    }
});
exports.helpTopicAdminRoutes.post("/", async (req, res) => {
    const v = readBody(req.body ?? {});
    const error = validate(v, true);
    if (error)
        return (0, response_1.fail)(res, error, 400);
    try {
        const [result] = await pool_1.pool.query(`INSERT INTO help_topics (topic_key, label, keywords, answer, is_active)
       VALUES (:topic_key, :label, :keywords, :answer, 1)`, v);
        return (0, response_1.ok)(res, { id: Number(result.insertId), ...v }, "Topic added.");
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
            return (0, response_1.fail)(res, `A topic with the key "${v.topic_key}" already exists.`, 409);
        }
        return (0, response_1.fail)(res, "Failed to add the topic", 500);
    }
});
/** Edits a topic, or activates and deactivates it. The key cannot change. */
exports.helpTopicAdminRoutes.patch("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    const body = req.body ?? {};
    // Activation on its own, so the list can have a toggle without resending the whole topic.
    if (Object.keys(body).length === 1 && typeof body.is_active === "boolean") {
        try {
            const [result] = await pool_1.pool.query("UPDATE help_topics SET is_active = :is_active WHERE id = :id", { is_active: body.is_active ? 1 : 0, id });
            if (result.affectedRows === 0)
                return (0, response_1.fail)(res, "Topic not found", 404);
            return (0, response_1.ok)(res, { id, is_active: body.is_active }, "Topic updated.");
        }
        catch {
            return (0, response_1.fail)(res, "Failed to update the topic", 500);
        }
    }
    const v = readBody(body);
    const error = validate(v, false);
    if (error)
        return (0, response_1.fail)(res, error, 400);
    try {
        const [result] = await pool_1.pool.query(`UPDATE help_topics
       SET label = :label, keywords = :keywords, answer = :answer
       WHERE id = :id`, { label: v.label, keywords: v.keywords, answer: v.answer, id });
        if (result.affectedRows === 0)
            return (0, response_1.fail)(res, "Topic not found", 404);
        return (0, response_1.ok)(res, { id, ...v }, "Topic updated.");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to update the topic", 500);
    }
});
/**
 * Deletes a topic outright.
 *
 * Safe to do: chats keep the `topic` key they were answered with, as text, so deleting a
 * topic does not rewrite the history of what was said.
 */
exports.helpTopicAdminRoutes.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    try {
        const [result] = await pool_1.pool.query("DELETE FROM help_topics WHERE id = :id", { id });
        if (result.affectedRows === 0)
            return (0, response_1.fail)(res, "Topic not found", 404);
        return (0, response_1.ok)(res, { id, deleted: true }, "Topic deleted.");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to delete the topic", 500);
    }
});
/**
 * Tries a question against the knowledge base WITHOUT recording a chat.
 *
 * The point of the screen: an administrator writes a topic, then checks that the words a
 * member would actually type reach it. Without this they would have to sign in as a member
 * and leave a real chat row behind to find out.
 */
exports.helpTopicAdminRoutes.post("/preview", async (req, res) => {
    const question = typeof (req.body ?? {}).question === "string" ? req.body.question.trim() : "";
    if (!question)
        return (0, response_1.fail)(res, "Type a question to try.", 400);
    try {
        const [rows] = await pool_1.pool.query("SELECT topic_key, label, keywords, answer FROM help_topics WHERE is_active = 1");
        const result = (0, helpChatKnowledge_1.answerHelpQuestion)(question, rows.map((r) => ({
            id: String(r.topic_key),
            label: String(r.label),
            keywords: (0, helpChatKnowledge_1.parseKeywords)(String(r.keywords ?? "")),
            answer: String(r.answer)
        })));
        return (0, response_1.ok)(res, { ...result, matched: result.topic !== null }, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Could not try that question", 500);
    }
});
