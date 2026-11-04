import { pool } from "../db/pool";
import { destroyFixtures } from "./helpers/fixtures";

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
 */
export default async function setup() {
  await destroyFixtures();

  return async () => {
    await destroyFixtures();
    await pool.end();
  };
}
