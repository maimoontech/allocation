"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = exports.loginIpHashSalt = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
// Resolve the backend package root from this module rather than from the current
// working directory, so `.env` is found no matter where the process was started:
// src/config -> backend (tsx), dist/config -> backend (compiled).
const backendRoot = node_path_1.default.resolve(__dirname, "..", "..");
const envPath = node_path_1.default.join(backendRoot, ".env");
const envFileFound = node_fs_1.default.existsSync(envPath);
// Real environment variables always take precedence: dotenv never overwrites a
// value already present in process.env, so deployed configuration still wins.
if (envFileFound) {
    dotenv_1.default.config({ path: envPath });
}
else {
    dotenv_1.default.config();
}
const missing = [];
/**
 * Reads a required variable. Deliberately has no fallback parameter: a default
 * for a credential means the credential lives in source control.
 */
function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        missing.push(name);
        return "";
    }
    return value;
}
/** Reads a non-secret variable that has a safe default. */
function optionalEnv(name, fallback) {
    const value = process.env[name]?.trim();
    return value ? value : fallback;
}
const PLACEHOLDER_SECRETS = new Set(["change_me", "changeme", "change-me", "secret", "changeit", "test"]);
const config = {
    port: Number(optionalEnv("PORT", "4000")),
    cors: {
        allowedOrigins: optionalEnv("CORS_ALLOWED_ORIGINS", 
        // 127.0.0.1 and localhost are DIFFERENT origins to a browser, and Vite serves both.
        // Allowing only one of them meant a developer who typed the other address got a
        // CORS rejection on the first POST — which, until it was translated to a 403, surfaced
        // as "Internal server error" at the login screen and nowhere else.
        "https://allocation-iota.vercel.app,https://www.karachizakereen.org," +
            "http://localhost:5173,http://127.0.0.1:5173")
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean)
    },
    db: {
        host: requireEnv("DB_HOST"),
        port: Number(optionalEnv("DB_PORT", "3306")),
        name: requireEnv("DB_NAME"),
        user: requireEnv("DB_USER"),
        pass: requireEnv("DB_PASS")
    },
    jwt: {
        secret: requireEnv("JWT_SECRET"),
        expiresIn: optionalEnv("JWT_EXPIRES_IN", "1d"),
        refreshExpiresInDays: Number(optionalEnv("REFRESH_TOKEN_EXPIRES_IN_DAYS", "7"))
    },
    // Member sign-in throttling. Every value is OPTIONAL with a default: making any of them
    // required would stop the deployed server booting the moment this code ships, before the
    // hosting environment has been updated.
    memberLogin: {
        maxAttempts: Number(optionalEnv("MEMBER_LOGIN_MAX_ATTEMPTS", "5")),
        /**
         * Per-address limit, deliberately higher than the per-account one. Several members
         * legitimately share one address — a household, an office, anything behind NAT — so
         * holding the address to the same count as a single account would let one person's
         * mistyping lock out everyone around them. It still stops one host spraying many
         * accounts, which the per-account counter alone would miss.
         */
        maxAttemptsPerIp: Number(optionalEnv("MEMBER_LOGIN_MAX_ATTEMPTS_PER_IP", "20")),
        windowSeconds: Number(optionalEnv("MEMBER_LOGIN_WINDOW_SECONDS", "900")),
        lockoutSeconds: Number(optionalEnv("MEMBER_LOGIN_LOCKOUT_SECONDS", "900")),
        /** Retention for the attempt log, pruned on write so the table cannot grow without bound. */
        attemptRetentionDays: Number(optionalEnv("MEMBER_LOGIN_ATTEMPT_RETENTION_DAYS", "30"))
    }
};
if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}. ` +
        (envFileFound
            ? `Loaded ${envPath}, but it does not define them. Add them there, or set them in the environment.`
            : `No .env file was found at ${envPath}. Copy backend/.env.example to backend/.env and fill it in ` +
                `for local development, or set these variables in the hosting provider's environment configuration.`));
}
if (PLACEHOLDER_SECRETS.has(config.jwt.secret.toLowerCase())) {
    throw new Error("JWT_SECRET is set to a placeholder value. Generate a strong secret with: " +
        "node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"");
}
if (config.jwt.secret.length < 32) {
    process.stderr.write("WARNING: JWT_SECRET is shorter than 32 characters. Use a longer random secret in production.\n");
}
/**
 * Salt for hashing client addresses in the member login attempt log.
 *
 * Derived from JWT_SECRET rather than being its own required variable, so shipping the
 * throttle cannot stop a deployed server booting. It is a separate value from the secret
 * itself — a one-way derivation — so the log never contains anything that could help recover
 * the signing key. Override with LOGIN_IP_HASH_SALT if the two should rotate independently.
 */
exports.loginIpHashSalt = optionalEnv("LOGIN_IP_HASH_SALT", node_crypto_1.default.createHash("sha256").update(`member-login-ip:${config.jwt.secret}`).digest("hex"));
exports.env = config;
