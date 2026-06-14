"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function requireEnv(name, fallback) {
    const value = process.env[name] ?? fallback;
    if (!value)
        throw new Error(`Missing environment variable: ${name}`);
    return value;
}
exports.env = {
    port: Number(process.env.PORT ?? "4000"),
    cors: {
        allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ??
            "https://allocation-iota.vercel.app,https://karachizakereen.org,http://localhost:5173").split(",").map((origin) => origin.trim()).filter(Boolean)
    },
    db: {
        host: requireEnv("DB_HOST", "64.20.33.10"),
        port: Number(process.env.DB_PORT ?? "3306"),
        name: requireEnv("DB_NAME", "masjid_scheduling"),
        user: requireEnv("DB_USER", "karachizakereen"),
        pass: process.env.DB_PASS ?? "Kz@5253"
    },
    jwt: {
        secret: requireEnv("JWT_SECRET", "change_me"),
        expiresIn: requireEnv("JWT_EXPIRES_IN", "1d"),
        refreshExpiresInDays: Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? "7")
    }
};
