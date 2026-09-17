import dotenv from "dotenv";

dotenv.config();

const missing: string[] = [];

/**
 * Reads a required variable. Deliberately has no fallback parameter: a default
 * for a credential means the credential lives in source control.
 */
function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    missing.push(name);
    return "";
  }
  return value;
}

/** Reads a non-secret variable that has a safe default. */
function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

const PLACEHOLDER_SECRETS = new Set(["change_me", "changeme", "change-me", "secret", "changeit", "test"]);

const config = {
  port: Number(optionalEnv("PORT", "4000")),
  cors: {
    allowedOrigins: optionalEnv(
      "CORS_ALLOWED_ORIGINS",
      "https://allocation-iota.vercel.app,https://www.karachizakereen.org,http://localhost:5173"
    )
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
  }
};

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(", ")}. ` +
      `Set them in backend/.env for local development, or in the hosting provider's ` +
      `environment configuration for a deployed environment. See backend/.env.example.`
  );
}

if (PLACEHOLDER_SECRETS.has(config.jwt.secret.toLowerCase())) {
  throw new Error(
    "JWT_SECRET is set to a placeholder value. Generate a strong secret with: " +
      "node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
  );
}

if (config.jwt.secret.length < 32) {
  process.stderr.write(
    "WARNING: JWT_SECRET is shorter than 32 characters. Use a longer random secret in production.\n"
  );
}

export const env = config;
