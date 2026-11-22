---
id: 0052
title: No SQL comments inside a query, ever
stage: green
date: 2026-11-22
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: (direct request)
labels: ["bug", "mysql2", "named-placeholders", "members-list", "convention"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/routes/memberAdminRoutes.ts
 - backend/src/__tests__/sqlNamedPlaceholders.test.ts
 - backend/dist (rebuilt)
 - CHANGELOG.md
tests:
 - backend: npm run build clean
 - backend: both rules verified through tsx across the real source tree - 39 files, 183 SQL
   literals, 0 with an SQL comment; 93 queries carrying :name, every one tokenising and
   formatting with nothing left over
 - backend: the rebuilt list query now yields exactly 2 placeholders for its 2 clauses and
   formats to "LIMIT 25 OFFSET 0", where the previous version yielded 4
 - backend: vitest NOT RUN - globalSetup refuses a non-local DB_HOST
---

## Prompt

[error b559702c] GET /api/v1/members code=ER_PARSE_ERROR name=Error

## Response snapshot

### The previous fix treated the symptom

It removed the apostrophe from the SQL comment and left the comment in place. The hazard is
the comment. The tokeniser that rewrites `:name` into `?` does not know what an SQL comment
is, so it reads the prose as SQL, and the prose can break it in more than one way:

1. An apostrophe reads as the start of a string literal and swallows the rest of the
   statement, leaving `:limit` and `:offset` as literal text. That was the first failure.
2. The replacement comment, written to explain failure 1, contained the words `:limit` and
   `:offset` - so the tokeniser found FOUR placeholders in a statement with two clauses that
   need one. Whether that is harmless depends on whether the formatter downstream skips
   comment text, which is a patch-version property, not a guarantee.

The second one is a better bug than the first, because it is not about punctuation. No amount
of care in writing an SQL comment makes it safe to have one.

### What settled it

A scan of every SQL literal in the backend: **mine was the only query in the codebase with a
comment inside it.** 183 SQL literals, 17 comment lines, all 17 in the query I had written
the day before. Every other query keeps its explanation in TypeScript above the call. The
convention was already there and already correct; I had broken it and then tried to make my
break safe.

### The fix

The comment moved into a TypeScript block above `pool.query`, where it says more than it did
before - including why nothing but SQL may go inside that template literal. The statement now
yields two placeholders for two clauses and formats with none left over.

The guard was rewritten to match: it no longer bans apostrophes in SQL comments, it bans SQL
comments inside query literals outright, and separately asserts that every query carrying
`:name` both tokenises and FORMATS with nothing left behind. The second half is new - the
previous version checked only that no `:name` survived tokenising, which is why it passed on a
query that was producing phantom placeholders.

### Honest about confidence

The exact parse error could not be reproduced here. With the mysql2 and named-placeholders
versions installed locally, even the previous query formatted into valid SQL, because this
formatter does skip comments; the deployed pair evidently does not behave the same way. What
is certain: the previous statement produced four placeholders for two clauses, that depends on
library internals, and the current statement produces two for two.

If the error survives this deploy, the next step is a small admin-only endpoint returning the
generated SQL text. It carries no member data - the values are never in the template - so it
can be read directly instead of inferred.

## Outcome

- Impact: the member list query carries no SQL comment and no phantom placeholders. A whole
  class of hazard is now a test failure rather than a production 500.
- Tests: guard rewritten and verified through tsx against the real tree (the suite needs a
  local database).
- Files: 2 modified, dist rebuilt.
- Next prompts: redeploy and confirm. If it still fails, the admin-only query-text endpoint.
- Reflection: the first fix was a patch on the specific character that broke it. The right
  question was not "how do I write a safe SQL comment" but "why is there an SQL comment here
  when no other query in the codebase has one". Checking the convention before defending my
  own code would have found it an hour earlier.

## Evaluation notes (flywheel)

- Failure modes observed: my own guard passed a broken query, because it asserted the wrong
  thing - no leftover `:name` after tokenising, rather than a correct placeholder count after
  formatting. A guard written from the first instance of a bug tends to describe that
  instance; this one now describes the rule.
- Graders run and results (PASS/FAIL): backend build PASS; no-SQL-comment rule PASS (183/183
  literals); tokenise-and-format rule PASS (93/93 queries); rebuilt list query 2-for-2 PASS;
  backend vitest NOT RUN (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run the same two rules over the SQL in
  `database/sources/`, which is applied by hand and by the install script rather than through
  mysql2 - different risks, but the same habit of explaining things inside the statement.
