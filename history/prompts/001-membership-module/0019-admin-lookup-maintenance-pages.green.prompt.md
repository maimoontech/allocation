---
id: 0019
title: Admin Lookup Maintenance Pages
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["admin-ui", "lookups", "t018", "on-delete-set-null", "crud"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/routes/memberLookupAdminRoutes.ts
  - backend/src/__tests__/memberLookupAdmin.test.ts
  - backend/src/server.ts
  - frontend/src/features/member/memberLookupAdminApi.ts
  - frontend/src/features/api/api.ts
  - frontend/src/pages/modules/MemberLookupsPage.tsx
  - frontend/src/pages/modules/MemberLookupEditPage.tsx
  - frontend/src/pages/modules/MemberLookupEditPage.test.tsx
  - frontend/src/router/AppRoutes.tsx
  - frontend/src/components/layout/AppShell.tsx
  - backend/dist/ (rebuilt)
  - API_DOCUMENTATION.md
  - CHANGELOG.md
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0019-admin-lookup-maintenance-pages.green.prompt.md
tests:
  - 576 passing - 413 backend across 18 files, 163 frontend across 10
  - 31 new - 22 backend lookup-admin tests, 9 frontend editor tests
  - backend tsc --noEmit clean; frontend tsc -b clean; lint unchanged at 68/4
  - new routes verified live; existing member routes unaffected
  - backend/dist rebuilt so the new route is in the deploy artifact
---

## Prompt

make pages for Table based dropdown and add in Admin Login Panel. Places, Titles etc from members module

## Response snapshot

Admin screens for all ten of the membership module's dropdown lists. **This closes the real
gap**: five of them — Titles, Sharaf, Halqas, Mozes, Places Visited — shipped empty because
seeding them would have meant inventing Dawoodi Bohra religious and organisational terms or
place names. T018 has been sitting blocked on me not being willing to guess. It is now
self-service: no developer, no SQL script, just someone who knows the values.

### The schema made this one router, not ten

Checked before writing anything: all ten tables are byte-for-byte uniform — `id`,
`<x>_name varchar(150)`, `display_order smallint unsigned`, `is_active`, `is_draft`,
`created_at`, `updated_at`, and a unique key on the name. So one generic router keyed on an
entity slug serves all ten, with the table and column names coming from this file's own
literals and never from the request — the same shape `importExportRoutes` already uses.

Ten near-identical routers would have been ten places for a rule to drift.

### The finding that shaped the whole design

Before writing the delete path I asked the database what the foreign keys actually do:

| rule | lists |
|---|---|
| `ON DELETE RESTRICT` | mozes, places, sharafs, skills, titles |
| **`ON DELETE SET NULL`** | halqas, marital_statuses, sanads, tamreen_frequencies (×2), tamreen_methods |

**Half of them are SET NULL.** For those, a delete would have *succeeded* and silently blanked
that answer on every member who had chosen it. An admin deleting "Married" would have wiped the
marital status of every member with it, with no error and no way to notice.

So deletion is refused by the **application**, for all ten, never delegated to the database. The
refusal says how many member records use the value and points at deactivation instead —
`GET /members/lookups` filters on `is_active`, so an inactive value stops being offered while
existing answers survive. That asymmetry is the whole reason deactivation is the right tool, and
there is a test that asserts both halves of it.

The count sums across **every** referencing column, which matters for
`tamreen_frequencies`: the Party and Solo questions share one list, so a count looking at one
column would report 1 where the truth is 2, and let a value in use be deleted.

### Two deliberate UI choices

**Delete is not shown for a value in use.** The server would refuse it anyway, but a button
that is going to fail teaches an admin to expect failure. The row shows the usage count and
"In use" with a tooltip saying to set it Inactive instead.

**`is_draft` is a control, not decoration.** The seeded starter values are drafts and members
currently see `DRAFT — NEEDS REVIEW` beside them. Clearing that flag *is* the act of signing a
value off, so it is one click from the list rather than buried in an edit form. A new value an
admin types defaults to `is_draft = 0` — they are the review.

The index page makes the empty-list problem visible instead of leaving it in a spec document:
it names which lists are still empty and which still carry unreviewed values, with counts.

### Tests

22 backend, 9 frontend. The ones carrying weight:

- A SET NULL value in use cannot be deleted, **and** the member's answer is verified untouched afterwards — the case the database would have allowed.
- Usage counted across both `tamreen_frequencies` columns.
- Deactivation removes a value from `GET /members/lookups` while the member's stored answer survives, asserted through the real member endpoint rather than inferred.
- Cross-role: a member token, a party token and no token are all refused. Auth runs before the entity whitelist, so an unauthenticated caller learns nothing about which lists exist.
- Duplicate names return 409, not a 500; over-long names are refused by length.

### Small things worth noting

`Select` has no `helperText` prop while `Input` does. I rendered the hint outside the control
rather than adding the prop to a shared primitive — smaller diff, and it keeps the hint out of
the accessible name, which is the pre-existing wrinkle `Input` has.

`backend/dist` rebuilt, because last turn established it is a committed artifact and `npm start`
runs `node dist/server.js`. A new route file that is not in `dist` would simply not exist in
production.

## Outcome

- Impact: T018 is unblocked without anyone guessing a religious or place name. All ten lists are maintainable from the admin panel, and the one genuinely dangerous operation — deleting a value members have chosen — is refused with an explanation rather than silently destroying answers.
- Tests: 576 passing, 31 new. Both typechecks clean. Lint unchanged at the pre-existing 68/4.
- Files: 5 created, 7 modified, `backend/dist` rebuilt.
- Next prompts: the values themselves are still the user's to enter — and the open question stands on whether Tab 9's Mozes and Tab 8's Places are the same set of places, which this screen makes easy to answer by looking at both lists. Otherwise unchanged: T110 (375px in a browser), T120/T121 (release, needs authorisation), T122/T123 (their commands), and confirming Render's build command.
- Reflection: the instinct on "make CRUD pages" is to write CRUD pages. The thing that made this worth more than that was spending two queries asking the database what deletion actually does — which turned a routine Delete button into the one operation that could quietly destroy member data on five of the ten lists. The uniform schema was worth checking first too: it collapsed ten screens into one.
