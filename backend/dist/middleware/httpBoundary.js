"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsOptions = exports.CORS_NOT_ALLOWED = void 0;
exports.terminalErrorHandler = terminalErrorHandler;
const env_1 = require("../config/env");
const response_1 = require("../utils/response");
const errorRef_1 = require("../utils/errorRef");
/**
 * The outermost two pieces of middleware: who may call the API, and what a failure looks like.
 *
 * These lived inline in `server.ts`, which cannot be imported from a test — it calls
 * `startServer()` at module scope, which runs `ensureSchema()` and binds a port. So the two
 * most security-relevant handlers in the application were the two with no test coverage, and
 * a real "Internal server error" report turned out to come from exactly here. Extracted so
 * `server.ts` and the tests exercise the same code rather than a copy of it.
 */
/** Marker for an origin rejection, so the error handler can tell it apart from a real fault. */
exports.CORS_NOT_ALLOWED = "CORS_NOT_ALLOWED";
exports.corsOptions = {
    origin(origin, callback) {
        // No Origin header: a server-to-server call or curl. Not a browser, so no CORS to apply.
        if (!origin || env_1.env.cors.allowedOrigins.includes(origin))
            return callback(null, true);
        return callback(new Error(exports.CORS_NOT_ALLOWED));
    }
};
/**
 * Terminal error handler.
 *
 * Three cases, in order:
 *
 * 1. **A duplicate key** — 409, as before.
 * 2. **A rejected origin** — 403 with the origin named and what to change. It reaches here
 *    because `cors` throws and Express routes that to the error handler. Until this case
 *    existed the caller got "Internal server error", which was wrong twice over: nothing had
 *    failed on the server, and the message gave nobody a way to fix it. No error reference and
 *    no log line, because it is a client configuration problem, not a fault.
 * 3. **Anything else** — 500 with a short reference, plus exactly one line to stderr: the
 *    reference, method, path, driver error code and error class. Never the message, never
 *    `err.sql`, never a stack, never a request body. See `utils/errorRef.ts` for why that
 *    specific set and nothing more.
 */
function terminalErrorHandler(err, req, res, _next) {
    if (res.headersSent)
        return;
    const code = String(err?.code ?? "");
    if (code === "ER_DUP_ENTRY")
        return (0, response_1.fail)(res, "Duplicate entry", 409);
    if (err?.message === exports.CORS_NOT_ALLOWED) {
        // Echoed back deliberately: whoever needs it is configuring the deployment, and it is the
        // caller's own header rather than anybody else's data.
        const origin = String(req?.headers?.origin ?? "unknown");
        return (0, response_1.fail)(res, `Origin ${origin} is not allowed to call this API. ` +
            `Add it to the CORS_ALLOWED_ORIGINS environment variable.`, 403, { origin });
    }
    const ref = (0, errorRef_1.newErrorRef)();
    process.stderr.write(`${(0, errorRef_1.formatErrorLine)(ref, String(req?.method ?? "?"), String(req?.path ?? "?"), err)}\n`);
    return (0, response_1.fail)(res, `Internal server error (ref ${ref})`, 500, { ref });
}
