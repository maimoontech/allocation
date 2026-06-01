"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.fail = fail;
function ok(res, data, message = "OK") {
    return res.json({ success: true, data, message });
}
function fail(res, message, status = 400, data) {
    return res.status(status).json({ success: false, data: data ?? null, message });
}
