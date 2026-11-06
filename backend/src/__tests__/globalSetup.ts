import { env } from "../config/env";
import { pool } from "../db/pool";
import { ensureSchema } from "../db/ensureSchema";
import { destroyFixtures } from "./helpers/fixtures";

/**
 * Hosts the test suite is allowed to touch.
 *
 * Anything else is refused. See `assertLocalDatabase`.
 */
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "host.docker.internal"]);

/**
 * Refuses to run the suite against anything but a local database.
 *
 * This suite is NOT read-only. `ensureFixtures` inserts into admins, zones, mohallahs,
 * venues, parties, miqaats, schedules and member_accounts; `destroyFixtures` then DELETEs by
 * marker, and `clearMemberLoginAttempts` deletes every row whose ITS number starts with 999.
 * Pointed at production that is a write, and the only thing that made it survivable was
 * teardown happening to complete.
 *
 * The connection comes from `.env`, which is also what the running application uses — so
 * pointing the app at production silently points the tests there too. Nothing in the suite
 * itself distinguished the two, and that is the hole this closes: the check is on the host,
 * before a single statement is sent.
 *
 * Set MPSS_ALLOW_REMOTE_TEST_DB=1 to override, for the rare case of a genuinely disposable
 * remote database. It is deliberately awkward to type.
 */
function assertLocalDatabase() {
  if (process.env.MPSS_ALLOW_REMOTE_TEST_DB === "1") return;

  const host = String(env.db.host ?? "").trim().toLowerCase();
  if (LOCAL_DB_HOSTS.has(host)) return;

  // Written straight to stderr rather than carried in the Error. Vitest renders a
  // globalSetup failure through its source-map layer, which mangles a long multi-line
  // message — and the one moment this must be legible is the moment it fires.
  process.stderr.write(
    [
      "",
      "=".repeat(78),
      " REFUSING TO RUN TESTS",
      "=".repeat(78),
      ` DB_HOST is "${env.db.host}", which is not a local database.`,
      ` Database: ${env.db.name}`,
      "",
      " This suite WRITES. It inserts fixture admins, zones, mohallahs, venues,",
      " parties, miqaats, schedules and member accounts, and deletes rows by marker.",
      " Running it here would modify live data.",
      "",
      " Point DB_HOST at a local database before running tests.",
      " If this host really is disposable: MPSS_ALLOW_REMOTE_TEST_DB=1 npm test",
      "=".repeat(78),
      "",
      ""
    ].join("\n")
  );

  // Exit rather than throw. A throw from globalSetup is rendered through Vitest's
  // source-map layer, which fails with its own "code.charCodeAt is not a function" and
  // buries the banner under an irrelevant stack trace. Exiting leaves the banner as the
  // last thing on screen, which is the whole point of it.
  process.exit(1);
}

/**
 * Vitest globalSetup.
 *
 * Fixtures are created by each test file's `beforeAll` via the idempotent `ensureFixtures`,
 * rather than here, because globalSetup runs in its own context and cannot share ids with
 * the test files. Teardown belongs here though: it must happen exactly once, after every
 * file has finished, and it identifies rows by marker so it needs nothing passed in.
 *
 * Teardown also runs defensively at startup, to clear anything an interrupted previous run
 * left behind.
 *
 * `ensureSchema()` runs first, for the same reason the server runs it at boot: a developer's
 * local database is whatever the last migration left, and a test for a column added this week
 * would otherwise fail with "unknown column" rather than telling them anything useful. It is
 * idempotent and additive, and the host check above has already refused anything non-local,
 * so this cannot reach a live database.
 */
export default async function setup() {
  // First, before any connection is used: a refusal must not itself write anything.
  assertLocalDatabase();

  await ensureSchema();
  await destroyFixtures();

  return async () => {
    await destroyFixtures();
    await pool.end();
  };
}
