---
id: 0035
title: Profile tabs show heading only
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: /sp.implement
labels: ["member-profile", "tabs", "ui", "accessibility", "copy"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/ui/Tabs.tsx
  - frontend/src/components/ui/Tabs.test.tsx
  - frontend/src/pages/modules/MembersPage.tsx
  - CHANGELOG.md
tests:
  - frontend vitest: 203 passed (15 files)
  - frontend tsc --noEmit: clean
---

## Prompt

Remove Numbers from tab, only show heading like Personal, Hizeb etc.

## Response snapshot

A one-line change with one consequence worth finding before shipping it.

**The change.** `Tabs.tsx` rendered `<span>{index + 1}</span>` ahead of the label. Removed,
along with the now-unused `index` parameter. The labels themselves were already clean —
"Personal", "Hizb", "Title & Prefix" — so nothing else in the tab definitions moved.

**The consequence.** The Members page told administrators that contact numbers are entered on
"Tab 1 Personal" and Zone and Party on "Tab 3 Hizb" — copy added two prompts ago, precisely so
an administrator could tell a member where to go. Those numbers are no longer on screen, so
that sentence pointed at labels that do not exist. It now names the tabs: the **Personal** tab
and the **Hizb** tab. Grepping for user-visible tab numbers rather than only editing the
component is what caught it; every other hit was a code comment or a test's `describe` name.

**What the number was costing.** It was not only decoration. It sat inside the `<button>` that
carries `role="tab"`, so it was part of each tab's accessible name: a screen reader announced
"1 Personal", and `getByRole("tab", { name: "Personal" })` with an exact string would not
match. The existing test asserted the number was present; it now asserts the text content is
exactly the heading, and that an exact-name role query finds the tab. Pinning the absence is
the useful direction — the previous test would have passed with the number back.

**Left alone deliberately.** The server still returns a tab number with each validation error
and the page still uses `TAB_BY_NUMBER` to open the right tab. That mapping is internal and was
never shown to anyone, so removing the printed number does not touch it.

## Outcome

- ✅ Impact: the twelve profile tabs read "Personal", "Title & Prefix", "Hizb" and so on, with
  no leading number, and each tab's accessible name is now exactly its heading.
- ✅ Admin copy that referred to "Tab 1" and "Tab 3" updated in the same change, so it cannot
  point at something the member can no longer see.
- 🧪 Tests: 203 frontend passed, tsc clean. The Tabs test was inverted to assert the absence.
- 📁 Files: 4 changed, 1 new (this record).
- 🔁 Next prompts: rebuild and redeploy the frontend; the backend tests still need a local
  `DB_HOST`.
- 🧠 Reflection: the risk in a cosmetic removal is the copy elsewhere that described what was
  removed. The instruction named one component; the thing that would have broken was a
  sentence on a different page, written for a different role.

## Evaluation notes (flywheel)

- Failure modes observed: (1) user-facing copy on another page referring to a visual detail by
  number, which a component-local edit silently invalidates; (2) decoration inside an element
  carrying an ARIA role, quietly becoming part of its accessible name; (3) a test asserting the
  presence of the very thing being removed — it fails loudly, which is fine, but inverting it
  rather than deleting it is what keeps the behaviour pinned.
- Graders run and results (PASS/FAIL): frontend vitest 203 — PASS. frontend tsc — PASS. Exact
  text content of a tab equals its heading — PASS. `getByRole("tab", { name: "Alpha" })` with
  an exact string resolves — PASS. No user-visible "Tab N" strings remain — PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): have the admin-facing copy derive its tab names
  from the same `ALL_TABS` list the member's page renders, so a renamed tab cannot leave that
  sentence describing an old label.
