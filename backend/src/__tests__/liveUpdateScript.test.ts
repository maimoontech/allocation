import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `database/membership_live_update.sql` must stay in step with its two sources.
 *
 * The combined script exists because a live migration is best handed over as one
 * self-contained file — runnable from any directory, pasteable into any client, with no chance
 * of running two files in the wrong order or forgetting the second. The cost of that choice is
 * a second copy of 800 lines of DDL, which would drift silently the first time somebody edits
 * the schema and forgets to regenerate.
 *
 * This test is what makes that drift loud. It fails the moment a source changes without the
 * generated file being rebuilt — which is exactly when someone is about to deploy a script
 * that no longer matches the schema they believe they are deploying.
 *
 * Fix: `node database/build_live_update.mjs`
 */

const DB_DIR = join(__dirname, "..", "..", "..", "database");

function read(name: string) {
  return readFileSync(join(DB_DIR, name), "utf8");
}

/** Must match the generator's hash: sha256, first 16 hex characters. */
function shortSha(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/**
 * Drops `--` comment lines before matching.
 *
 * These files are heavily commented and the comments quote SQL: the schema header explains the
 * collation rule, and the seed shows an example `INSERT INTO places` for whoever fills that
 * list in. Searching or counting the raw text picks those up and the assertion then means
 * nothing — which is exactly what two of the tests below did on their first run.
 */
function statementsOnly(sql: string) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\u000a");
}

describe("the live update script", () => {
  it("records the current hash of each source it was built from", () => {
    const generated = read("membership_live_update.sql");

    for (const source of ["membership_schema.sql", "membership_seed.sql"]) {
      const expected = shortSha(read(source));
      expect(
        generated.includes(`${source} (sha256 ${expected})`),
        `${source} has changed since membership_live_update.sql was generated. ` +
          `Run: node database/build_live_update.mjs`
      ).toBe(true);
    }
  });

  it("contains both sources in full, schema before seed", () => {
    const generated = read("membership_live_update.sql");

    // A marker from each source rather than a line count: the point is that the content is
    // present and in the right order, since the seed's foreign keys need the tables first.
    const schemaAt = generated.indexOf("CREATE TABLE IF NOT EXISTS member_accounts");
    const seedAt = generated.indexOf("INSERT INTO sanads");

    expect(schemaAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(-1);
    expect(schemaAt).toBeLessThan(seedAt);
  });

  it("refuses to run against the wrong database", () => {
    const generated = read("membership_live_update.sql");

    // The guard that matters most: pointing a migration at the wrong schema is the mistake
    // with the worst consequences and the one nobody expects to make.
    expect(generated).toContain("SIGNAL SQLSTATE '45000'");
    expect(generated).toContain("does not look like the MPSS database");

    // And it runs before anything is created.
    expect(generated.indexOf("_membership_preflight")).toBeLessThan(
      generated.indexOf("CREATE TABLE IF NOT EXISTS member_accounts")
    );
  });

  it("prints the existing row counts both before and after", () => {
    const generated = read("membership_live_update.sql");

    // The operator's proof that nothing existing changed. Both blocks must cover the same
    // tables, or comparing them proves nothing.
    const before = [...generated.matchAll(/'BEFORE', '([a-z_]+)'/g)].map((m) => m[1]);
    const after = [...generated.matchAll(/'AFTER', '([a-z_]+)'/g)].map((m) => m[1]);

    expect(before.length).toBeGreaterThan(10);
    expect(after).toEqual(before);

    // Including the dormant `members` table, which the module deliberately does not use.
    expect(before).toContain("members_dormant");
  });

  it("never writes to one of the 13 pre-existing tables", () => {
    // FR-106. This used to be asserted as "the schema contains no ALTER, UPDATE or DELETE at
    // all", which was a convenient proxy while that happened to be true. It is no longer: the
    // schema ALTERs member_photos to backfill the approval columns onto a database that
    // created the table before they existed, and the seed deactivates six rejected
    // tamreen_methods values with an UPDATE.
    //
    // Both target tables this module OWNS, which FR-106 has nothing to say about — it governs
    // the 13 tables that were here first. So the proxy is replaced by the real rule, which is
    // also the stronger one: every destructive or mutating statement in either source must
    // name a module table, and the pre-existing names must not appear as a target at all.
    const MODULE_TABLES = [
      "member_accounts", "member_login_attempts", "member_profiles", "member_photos",
      "member_titles", "member_sharafs", "member_skills", "member_place_visits",
      "member_place_visit_years", "member_ashara_attendances",
      "titles", "sharafs", "halqas", "mozes", "places", "sanads",
      "marital_statuses", "skills", "tamreen_frequencies", "tamreen_methods"
    ];
    const PRE_EXISTING_TABLES = [
      "admins", "members", "miqaats", "mohallahs", "parties", "party_venue_history",
      "performance_ratings", "ratings", "refresh_tokens", "schedule_edits", "schedules",
      "venues", "zones"
    ];

    const sources = ["membership_schema.sql", "membership_seed.sql"];
    const targets: string[] = [];

    for (const source of sources) {
      const statements = statementsOnly(read(source));
      for (const pattern of [
        /\bALTER\s+TABLE\s+([a-z_]+)/gi,
        /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z_]+)/gi,
        /\bTRUNCATE\s+(?:TABLE\s+)?([a-z_]+)/gi,
        /\bDELETE\s+FROM\s+([a-z_]+)/gi,
        /\bUPDATE\s+([a-z_]+)\s+SET\b/gi,
        /\bINSERT\s+INTO\s+([a-z_]+)/gi
      ]) {
        for (const match of statements.matchAll(pattern)) targets.push(match[1].toLowerCase());
      }
    }

    // Sanity: if the regexes stop matching, the assertions below pass vacuously.
    expect(targets.length).toBeGreaterThan(10);

    for (const table of targets) {
      expect(
        PRE_EXISTING_TABLES,
        `${table} is one of the 13 pre-existing tables and must never be written to (FR-106)`
      ).not.toContain(table);
      expect(
        MODULE_TABLES,
        `${table} is written to but is not a known membership-module table — either it is a ` +
          `new table missing from this list, or the migration has grown beyond its remit`
      ).toContain(table);
    }
  });

  it("creates every table with the explicit collation", () => {
    const statements = statementsOnly(read("membership_schema.sql"));

    // The bug this prevents: the database default is utf8mb4_0900_ai_ci while every existing
    // table is utf8mb4_general_ci, so a table inheriting the default throws error 1267 the
    // first time an its_no is compared across the two. That was found only by querying the
    // real database, after six offline structural checks had passed.
    const creates = statements.match(/CREATE TABLE IF NOT EXISTS/g) ?? [];
    const collations = statements.match(/COLLATE=utf8mb4_general_ci/g) ?? [];

    expect(creates).toHaveLength(20);
    expect(collations).toHaveLength(20);
  });

  it("seeds all ten lookup lists, every value already reviewed", () => {
    const seed = statementsOnly(read("membership_seed.sql"));

    // This replaces an assertion that titles, sharafs, halqas, mozes and places ship EMPTY.
    // That was correct while nobody had supplied those values and inventing Dawoodi Bohra
    // religious and organisational terms would have been worse than an empty list. They have
    // since been supplied through the Member Lists admin screen, so the seed now carries them
    // and a live apply gets the same lists the module has actually been used with.
    for (const table of [
      "titles", "sharafs", "halqas", "mozes", "places", "sanads",
      "marital_statuses", "skills", "tamreen_frequencies", "tamreen_methods"
    ]) {
      expect(seed, `${table} is no longer seeded`).toMatch(
        new RegExp(`INSERT INTO ${table}\\b`, "i")
      );
    }

    // Every seeded row is (name, display_order, is_active, is_draft) and must end `, 1, 0)`.
    // A trailing `, 1, 1)` would be a value shipped as an unreviewed draft, which would reach
    // production rendering as "DRAFT - NEEDS REVIEW" — the exact outcome supplying these
    // lists was meant to avoid.
    expect(seed, "a seeded value still carries is_draft = 1").not.toMatch(/,\s*1,\s*1\)/);

    // And the flag is written on conflict, so re-running over the earlier draft seed clears
    // it rather than leaving a reviewed value flagged forever.
    expect(seed).toMatch(/is_draft\s*=\s*VALUES\(is_draft\)/i);
  });

  it("seeds the four adopted tamreen_methods, not the seven that were proposed", () => {
    const seed = statementsOnly(read("membership_seed.sql"));

    const insert = seed.slice(seed.search(/INSERT INTO tamreen_methods\b/i));
    const values = insert.slice(0, insert.indexOf(";"));

    for (const adopted of ["Self", "With Party", "With an Ustad", "SatulIman"]) {
      expect(values).toContain(`'${adopted}'`);
    }

    // The six rejected proposals must not be re-inserted. They may still appear in the file —
    // section 4b deactivates them by name on a database that received the earlier seed — so
    // this is asserted against the INSERT's VALUES list, not the whole seed.
    for (const rejected of [
      "Self Study", "With a Group", "Audio Recording",
      "Video Recording", "Written Notes", "Other"
    ]) {
      expect(values, `the rejected proposal '${rejected}' is being seeded again`).not.toContain(
        `'${rejected}'`
      );
      expect(seed, `the rejected proposal '${rejected}' is not deactivated`).toContain(
        `'${rejected}'`
      );
    }

    expect(seed).toMatch(/UPDATE tamreen_methods\s+SET is_active = 0/i);
  });

  it("creates member_photos with the approval columns, and can backfill them", () => {
    // The drift this exists to catch, because it actually happened: the approval workflow was
    // added to the running development database with a standalone ALTER, and the migration
    // script was never updated. It kept passing every test here — none of them knew the
    // columns existed — and would have created a member_photos without them on production,
    // where every photo approval query then fails with error 1054, unknown column.
    const schema = statementsOnly(read("membership_schema.sql"));

    const createAt = schema.search(/CREATE TABLE IF NOT EXISTS member_photos\b/);
    expect(createAt).toBeGreaterThan(-1);
    // Ends at the ENGINE= clause, not at the first semicolon: the sha256 column's COMMENT
    // contains one ("...comparing blobs; also the ETag"), which truncated this slice before
    // the approval columns and made the assertions below fail on a correct file.
    const engineAt = schema.indexOf("ENGINE=InnoDB", createAt);
    expect(engineAt).toBeGreaterThan(createAt);
    const create = schema.slice(createAt, engineAt);

    for (const column of [
      "approval_status", "approved_by", "approved_by_role", "approved_at", "rejection_reason"
    ]) {
      expect(create, `member_photos is created without ${column}`).toContain(column);
    }
    for (const index of ["idx_member_photos_approval", "idx_member_photos_approved_by"]) {
      expect(create, `member_photos is created without ${index}`).toContain(index);
    }

    // CREATE TABLE IF NOT EXISTS skips an existing table entirely, columns and all, so the
    // CREATE above does nothing for a database that already ran an earlier version of this
    // script. The backfill is what makes "safe to re-run" true for those, and it must add
    // each column conditionally so it stays idempotent.
    expect(schema).toMatch(/CREATE PROCEDURE mm_backfill_photo_approval\b/);
    expect(schema).toMatch(/CALL mm_backfill_photo_approval\(\)/);
    expect(schema).toMatch(/DROP PROCEDURE mm_backfill_photo_approval/);

    const backfillAt = schema.search(/CREATE PROCEDURE mm_backfill_photo_approval\b/);
    const backfill = schema.slice(backfillAt, schema.indexOf("CALL mm_backfill", backfillAt));
    // Five columns plus two indexes, each behind its own existence check.
    expect(backfill.match(/IF NOT EXISTS\s*\(SELECT 1 FROM INFORMATION_SCHEMA/gi)).toHaveLength(7);
  });

  it("documents that the rollback needs the frontend rolled back first", () => {
    // The one finding from the T119 rehearsal that is not obvious from reading the SQL: with
    // the tables gone but the login page still offering Member, a member sign-in returns 500.
    const rollback = read("membership_rollback.sql");
    expect(rollback).toMatch(/ORDER MATTERS/i);
    expect(rollback).toMatch(/frontend/i);
  });
});
