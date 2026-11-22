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
function queryLiterals(source: string): string[] {
  return [...source.matchAll(/`([^`]*)`/g)]
    .map((match) => match[1])
    .filter((chunk) => SQL_VERBS.test(chunk) && /:[a-z_][a-z0-9_]*/i.test(chunk));
}

/** `${...}` holes become a harmless literal, so the tokeniser sees a whole statement. */
function fillHoles(sql: string): string {
  return sql.replace(/\$\{[^}]*\}/g, "1");
}

const FILES = sourceFiles(SRC);
const QUERIES = FILES.flatMap((file) =>
  queryLiterals(fs.readFileSync(file, "utf8")).map((sql) => ({
    file: path.relative(SRC, file),
    sql
  }))
);

describe("named-placeholder queries", () => {
  it("finds the queries to check, so this file cannot pass by scanning nothing", () => {
    expect(FILES.length).toBeGreaterThan(10);
    expect(QUERIES.length).toBeGreaterThan(20);
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
   * The rule stated as a rule, so a failure names the cause rather than the symptom.
   *
   * An apostrophe in an SQL comment is always a hazard, even when it happens to pair with a
   * later quote and leave no `:name` behind: everything between them is then read as a
   * string, and what the tokeniser does with the rest is luck.
   */
  it("has no apostrophe inside an SQL comment", () => {
    for (const { file, sql } of QUERIES) {
      for (const line of sql.split("\n")) {
        const comment = line.indexOf("--");
        if (comment === -1) continue;

        const text = line.slice(comment);
        expect(
          text.includes("'"),
          `${file}: apostrophe in an SQL comment, which the named-placeholder tokeniser reads as a string: ${text.trim()}`
        ).toBe(false);
      }
    }
  });
});
