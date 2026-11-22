import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every named-placeholder query in this codebase must survive being tokenised (FR-006c).
 *
 * THE BUG THIS EXISTS BECAUSE OF
 *   The pool runs with `namedPlaceholders: true`, so mysql2 rewrites `:name` into `?` before
 *   sending anything. The tokeniser that does it understands quoted strings but NOT that `--`
 *   starts a comment. So a single apostrophe inside an SQL comment — "the other's reason" —
 *   reads as the opening of a string literal, swallows the remainder of the statement, and
 *   leaves `:limit` and `:offset` sitting there as literal text. MySQL rejects the statement
 *   and the endpoint answers 500.
 *
 *   It cost the member account list a day. Nothing about it is visible in review: the SQL is
 *   valid, the comment is accurate English, the TypeScript compiles, and the failure appears
 *   only once a real query reaches a real server.
 *
 * WHY A SCAN RATHER THAN A TEST PER QUERY
 *   The rule is not about one query. Any query, written by anyone, in any file, is one
 *   apostrophe away from this — and the apostrophe will be in a COMMENT, which is where
 *   people write the explanations this codebase asks for. So the whole tree is checked, and
 *   a new query is covered the moment it is written.
 *
 * No database: this reads source files and calls the same tokeniser mysql2 uses.
 *
 * `named-placeholders` is loaded dynamically and is listed in devDependencies. It arrives as
 * a dependency of mysql2 either way, but a test that relied on that would break the day
 * mysql2 changed how it rewrites placeholders — and the point of this file is to use the
 * EXACT code that rewrites them, not a copy of its rules.
 */

/** The tokeniser mysql2 uses, under both the CJS and the ESM loaders. */
async function loadTokeniser() {
  const loaded: any = await import("named-placeholders");
  const factory = typeof loaded === "function" ? loaded : loaded.default;
  return factory() as (
    sql: string,
    params: Record<string, unknown>
  ) => [string, unknown[]];
}

const SRC = path.join(__dirname, "..");
const SQL_VERBS = /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|REPLACE INTO)\b/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Test files are not queries sent to a server, and the fixtures write their own SQL.
      return entry.name === "__tests__" ? [] : sourceFiles(full);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

/**
 * The template literals in a file that look like a query carrying named placeholders.
 *
 * A template literal cannot contain a backtick, so splitting on backticks is sound. Chunks
 * that are not SQL, or carry no `:name`, are not this rule's business and are dropped.
 */
function sqlLiterals(source: string): string[] {
  return [...source.matchAll(/`([^`]*)`/g)]
    .map((match) => match[1])
    .filter((chunk) => SQL_VERBS.test(chunk));
}

/** Of those, the ones carrying `:name` placeholders, which is what the tokeniser rewrites. */
function queryLiterals(source: string): string[] {
  return sqlLiterals(source).filter((chunk) => /:[a-z_][a-z0-9_]*/i.test(chunk));
}

/** `${...}` holes become a harmless literal, so the tokeniser sees a whole statement. */
function fillHoles(sql: string): string {
  return sql.replace(/\$\{[^}]*\}/g, "1");
}

const FILES = sourceFiles(SRC);

function collect(pick: (source: string) => string[]) {
  return FILES.flatMap((file) =>
    pick(fs.readFileSync(file, "utf8")).map((sql) => ({
      file: path.relative(SRC, file),
      sql
    }))
  );
}

/** Queries carrying `:name`, for the tokenising check. */
const QUERIES = collect(queryLiterals);
/** Every SQL literal, for the no-comments rule - a comment is a hazard in any of them. */
const ALL_QUERIES = collect(sqlLiterals);

describe("named-placeholder queries", () => {
  it("finds the queries to check, so this file cannot pass by scanning nothing", () => {
    expect(FILES.length).toBeGreaterThan(10);
    expect(QUERIES.length).toBeGreaterThan(20);
    expect(ALL_QUERIES.length).toBeGreaterThanOrEqual(QUERIES.length);
  });

  /**
   * The real check: after tokenising, no `:name` may be left behind. A leftover is not a
   * style problem — it is text MySQL will refuse.
   */
  it("converts every :name into a placeholder", async () => {
    const convert = await loadTokeniser();

    for (const { file, sql } of QUERIES) {
      const filled = fillHoles(sql);
      const names = [...filled.matchAll(/:([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]);
      const params: Record<string, unknown> = {};
      for (const name of names) params[name] = 1;

      const [converted] = convert(filled, params);
      const leftover = [...converted.matchAll(/:[a-z_][a-z0-9_]*/gi)].map((m) => m[0]);

      expect(leftover, `${file}: ${leftover.join(", ")} survived tokenising`).toEqual([]);
    }
  });

  /**
   * No `--` comment inside a query at all. The rule is deliberately blunt.
   *
   * The first attempt at this rule banned apostrophes in SQL comments, which was treating a
   * symptom. The hazard is the comment: the tokeniser does not know what one is, so anything
   * written inside it is read as SQL. An apostrophe becomes an unterminated string. A `:word`
   * becomes a placeholder, which makes the count of placeholders disagree with the count of
   * clauses that need one - harmless only if the formatter downstream happens to skip
   * comments, which is a property of a patch version and not a promise.
   *
   * Every other query in this codebase already keeps its explanation in TypeScript. This test
   * makes that the rule rather than the habit. A comment ABOUT a query is for people to read,
   * and TypeScript is where people read it.
   */
  it("has no SQL comment inside a query", () => {
    for (const { file, sql } of ALL_QUERIES) {
      const offenders = sql
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /(^|\s)--(\s|$)/.test(line));

      expect(
        offenders,
        `${file}: move this out of the SQL and into a TypeScript comment above the query - ` +
          `the named-placeholder tokeniser reads comment text as SQL`
      ).toEqual([]);
    }
  });
});
