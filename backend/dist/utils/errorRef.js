"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.newErrorRef = newErrorRef;
exports.formatErrorLine = formatErrorLine;
const node_crypto_1 = __importDefault(require("node:crypto"));
/**
 * A short reference printed in a 500 response and in one stderr line, so a user who sees
 * "Internal server error" can quote something that identifies their exact failure.
 *
 * WHY THIS EXISTS. The application deliberately logs nothing: not one `console.*` call in
 * `src` outside the tests, and `sensitiveOutput.test.ts` asserts that. The reason is real —
 * `mysql2` interpolates named placeholders client-side, so a failed query carries the values
 * it was writing in its `sql` property, health values included (FR-066). Anything that logged
 * errors wholesale would void every guarantee about health data on exactly the request where
 * something went wrong.
 *
 * The cost of that choice was a generic 500 with no way to tell two different faults apart —
 * which turned a real "Internal server error" report into guesswork for everyone involved.
 *
 * So this is the narrow middle: a correlation id, the method and path, the driver's error
 * CODE and the error's class name. Never the message, never `err.sql`, never a stack, never a
 * request body. A code like `ER_NO_SUCH_TABLE` names the fault without quoting any data.
 */
/** 8 hex characters: enough to be unambiguous in a log, short enough to read down a phone. */
function newErrorRef() {
    return node_crypto_1.default.randomBytes(4).toString("hex");
}
/**
 * The one line this application is allowed to write about a failure.
 *
 * Returns the text rather than printing it, so it can be asserted in a test without having to
 * capture a stream.
 */
function formatErrorLine(ref, method, path, err) {
    const code = err?.code;
    const name = err?.name;
    return (`[error ${ref}] ${method} ${path} ` +
        `code=${typeof code === "string" && code ? code : "none"} ` +
        `name=${typeof name === "string" && name ? name : "Error"}`);
}
