---
id: 0001
title: Member Login And Profile Spec
stage: spec
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: /sp.specify
labels: ["membership-module", "authentication", "member-profile", "live-production", "stage-1-inspection"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-membership-module/spec.md
  - specs/001-membership-module/checklists/requirements.md
  - PROJECT_AS_IS.md
  - history/prompts/001-membership-module/0001-member-login-profile-spec.spec.prompt.md
tests:
  - none run or added - Stage 1 produced documentation only, and the repository contains no test infrastructure (no runner, no spec files, no CI)
---

## Prompt

# Claude Code Prompt — Membership Module for Existing Live Application

## 1. Important: Existing Live Project

This project is **already developed, deployed, and running in production**. Before making any changes:

1. Read and inspect the entire existing project, including frontend, backend, database models, routes, authentication, configuration, and existing documentation.
2. Understand and document the current architecture, database structure, user roles, Party Login workflow, existing modules, and dependencies.
3. Create or update Markdown documentation describing the current implementation, relevant business rules, and the proposed Membership Module integration.
4. Identify reusable components, APIs, lookup tables, and the **existing Gregorian-to-Hijri date conversion script**.
5. Prepare a database migration script and implementation plan. Do not execute migrations, alter production data, or deploy changes without explicit approval.
6. Preserve all existing functionality, especially **Party Login**, which must continue working exactly as it does now.
7. Avoid unnecessary refactoring. Use backward-compatible changes and secure handling of existing data.

**Workflow:** First inspect and document the project. Present the implementation plan, database migration scripts, and any questions or assumptions for approval. **Wait for my approval before modifying application code or applying database changes.**

## 2. Membership Module — Overview and Authentication

Add a Dropdown Value **Member** in **Login Page**.

- A member selects member from a dropdown list.
- The member enters their **ITS Number** and **Password**.
- ITS Number and Password credentials are used **only for Member Login**.
- The existing Party Login authentication and workflow must remain unchanged.
- On the member's first successful login, **force a password change** before allowing access to the profile form.
- Apply standard password security requirements (appropriate length, complexity or strong passphrase rules, confirmation, secure hashing, rate limiting, and safe session handling). Never store plaintext passwords.
- After changing their password, the member completes their personal data form.
- The form must be **one responsive page divided into 12 tabs**, keeping the interface compact and easy to navigate.
- Allow members to save and update their own data securely, with server-side validation and appropriate access controls.
- Use the project's existing design system and patterns wherever possible.

## 3. Member Profile Form

### Tab 1 — Personal Information

| Field | Requirement |
|---|---|
| ITS No. | Read-only; automatically display the authenticated member's ITS Number |
| First Prefix | Dropdown: None, Sheikh, Mulla |
| Name | Text input |
| Father Prefix | Dropdown: None, Sheikh, Mulla |
| Father Name | Text input |
| Surname | Text input |
| Photo | Image upload |
| Date of Birth (Gregorian) | Date picker |
| Date of Birth (Hijri) | Automatically calculate using the **existing project script** |
| Marital Status | Dropdown; create appropriate lookup options |
| Residence Address | Multiline text |
| Phone No. | Phone input |
| Mobile No. 1 | Phone input |
| Mobile No. 2 | Phone input |
| WhatsApp No. 1 | Phone input |
| WhatsApp No. 2 | Phone input |
| Email | Email input |

### Tab 2 — Title and Prefix

- **Prefix:** Display the selected First Prefix from Tab 1 only when it is not `None`.
- **Prefix Year:** Year dropdown from **1950 through 2026**.
- **Title:** Dropdown populated from a new database **Title** lookup table.
- **Title Year:** Year dropdown from **1950 through 2026**.
- Allow a member to add **multiple titles**, each with its own year.
- Design the database relationships to support multiple title records per member.

### Tab 3 — Hizb

- **Zone:** Dropdown populated from the existing Zone table.
- **Party:** Dependent dropdown populated from the existing Parties table, filtered by the selected Zone.
- **Role:** Dropdown: Leader, Side Lead, Member.

### Tab 4 — Occupation

- **Occupation Type:** Radio buttons: Job / Business.
- **Business Name / Company Name:** Text input, with label appropriate to occupation type.
- **Designation:** Show when occupation type is Job.
- **Since Year:** Year when the job/service or business started.
- **Address:** Text input or multiline input.
- **Phone No.:** Phone input.
- **Skills:** Multi-select dropdown. Create a database-backed skills lookup list using reputable publicly available skill categories if research access is available; otherwise provide a clearly marked initial seed list for review. Do not invent a claimed external source.

### Tab 5 — Education / Hifz

- **Standard / Degree:** Dropdown: Primary, Middle, Secondary, Intermediate, Bachelors, Masters, PhD.
- **Major Subjects:** Text input.
- **Status:** Dropdown: Complete, Ongoing.
- **Hifz Sanad:** Yes / No.
- **Sanad:** Dropdown with the following options:
  - Surah Balad
  - Surah Inshiqaq
  - Marhala Ula
  - Marhala Sania
  - Marhala Salesa
  - Marhala Rabea
  - Marhala Khamesa
  - Marhala Sadesa
  - Marhala Sabea
  - Shahadat Hifz al-Quran al-Kareem

**Subsection: Hifz Current Status**

- Surah
- Ayyah
- Last Update (date)

### Tab 6 — Health and Fitness

- **Blood Group:** Dropdown with standard blood groups: A+, A-, B+, B-, AB+, AB-, O+, O-.
- **Regular Donor:** Yes / No.
- **Last Donation Date:** Date picker.
- **BMI:** Calculate from Height and Weight where possible; show as read-only calculated value.
- **Height:** Numeric input with clearly specified unit.
- **Weight:** Numeric input with clearly specified unit.

Treat health-related data as sensitive: restrict access, validate carefully, and avoid unnecessary exposure in logs or reports.

### Tab 7 — Sharaf

Allow **multiple Sharaf entries** per member:

- **Sharaf:** Dropdown populated from the existing Sharaf table.
- **Year:** Year input.
- Support adding, editing, and deleting individual entries.

### Tab 8 — Miqaat

Allow **multiple Miqaat entries** per member:

- **Miqaat:** Dropdown populated from the existing Miqaat table.
- **Number of Times:** Numeric input.
- **Years:** Support multiple year values associated with each Miqaat record.
- Provide add/edit/remove functionality and validate consistency between the count and year entries; flag any ambiguity for review rather than guessing.

### Tab 9 — Ashara Mubaraka

Allow **multiple records** per member:

- **Attended With:** Radio buttons: With Aqa Moula TUS / With Aamil.
- **Hijri Year:** Dropdown starting at **1400 AH** and extending to the current Hijri year (use the existing Hijri date logic if suitable).
- **Moze:** Text or existing lookup, if available.
- **Mohallah:** Optional; use an existing lookup if available.

### Tab 10 — Asbaq

- **Asbaq Level:** Dropdown: Zaher, Taweel, Haqiqat.
- **Halqa:** Dropdown populated from the existing Asbaq table.
- **Ustad:** Text or existing lookup, if available.

### Tab 11 — Tamreen

- **Attend Karachi Zakireen Tamreen Session:** Yes / No.
- **Reason:** Required if the answer is No.
- **Party Tamreen Frequency:** Input or appropriate dropdown (propose options for approval).
- **Solo Tamreen Frequency:** Input or appropriate dropdown (propose options for approval).
- **Method Used for Tamreen:** Input or appropriate dropdown (propose options for approval).
- **Take Assistance from Any Ustad or Senior Zakireen:** Yes / No.
- **Idaratuz Zakereen Books:** Yes / No.

### Tab 12 — Other Sansta Khidmat

- **Khidmat Type:** Select Sansta / Umoor / Both.
- **Sansta Name:** Show when Sansta or Both is selected.
- **Umoor Name:** Show when Umoor or Both is selected.
- **Designation:** Text input.
- **Since:** Year or date input; confirm the desired format before implementation.

## 4. Database Requirements

Create a **database migration SQL script** for all new tables, columns, lookup values, foreign keys, indexes, and relationships needed for this module.

- Inspect the existing database schema first; **reuse existing tables** for Zone, Parties, Sharaf, Miqaat, Asbaq, and any other matching master data.
- Do not create duplicate master tables when suitable tables already exist.
- Add a separate member authentication structure if required to keep Member Login independent of Party Login.
- Use ITS Number as a unique member identifier where the existing data model permits it.
- Create a Title lookup table and suitable junction/detail tables for repeatable entries (titles, skills, Sharaf, Miqaat years, Ashara Mubaraka).
- Include seed data for new dropdown lookups, including marital statuses, prefixes, blood groups, education levels, roles, and other required static values as appropriate.
- Include password-change-required status and secure password hash storage.
- Handle optional fields, uniqueness, referential integrity, and timestamps.
- Provide safe, repeatable migrations where feasible, plus backup and rollback guidance.
- Never overwrite or delete existing production records as part of the migration.
- Match the **actual database engine and conventions found in the project**; do not assume MySQL or MSSQL before inspection.

## 5. UI, API, and Validation Requirements

- Maintain the existing project's layout, styling, and authentication conventions without changing Party Login.
- Build a responsive, single-page tabbed form with clear section navigation.
- Use conditional fields and dependent dropdowns as described above.
- Persist each repeatable section in a normalized relational structure.
- Provide secure APIs for member login, first-login password change, profile retrieval, profile updates, photo upload, and lookup data.
- Validate all inputs on the backend, not just the frontend.
- Prevent one member from reading or modifying another member's profile.
- Define acceptable photo file types, size limits, and secure storage.
- Show useful validation and save/error messages; avoid losing unsaved edits when changing tabs.
- Use transactions where updates affect multiple related tables.
- Add tests for member authentication, forced password changes, lookup filtering, repeated records, and Party Login regression.

## 6. Deliverables and Approval Sequence

**Stage 1 — Inspection and Documentation (do this first, without code changes):**

1. `PROJECT_AS_IS.md` — Existing architecture, authentication, modules, database, and dependencies.
2. `MEMBERSHIP_MODULE_SPEC.md` — Detailed functional requirements and tab-wise field specifications.
3. `MEMBERSHIP_DATABASE_DESIGN.md` — Proposed schema, relationships, constraints, and mapping to existing tables.
4. `MEMBERSHIP_IMPLEMENTATION_PLAN.md` — Development sequence, risks, migration strategy, testing, and rollback.
5. Draft SQL migration and seed scripts, **not executed**.
6. A concise list of unresolved questions or assumptions, including member list source, credential provisioning, date/year rules, and optional lookup choices.

**Stop and wait for my approval after Stage 1.**

**Stage 2 — Implementation (only after approval):**

1. Implement database changes using approved scripts and safe migration procedures.
2. Implement separate Member Login and mandatory first-login password change.
3. Implement the 12-tab member profile form and APIs.
4. Implement lookups, conditional fields, repeatable records, and calculations.
5. Run automated and manual tests, including regression tests for Party Login.
6. Document deployment, backup, rollback, and verification steps before any production release.

**Critical:** This is a live production application. Do not change or disrupt existing workflows, do not assume database structure, and do not deploy or execute migrations without explicit authorization.


## Response snapshot

Executed Stage 1 only: inspection and documentation, with no application, schema or
deployment change. Created branch `001-membership-module` and four documents.

**Inspection corrected five assumptions in the request:**

1. The login page already has a role dropdown (`admin`, `zonal_head`, `party`, `coordinator`) at `frontend/src/pages/LoginPage.tsx:12-17`. Adding Member is one entry plus a redirect branch, not a new page.
2. `authenticate()` (`backend/src/services/authService.ts:36-142`) is an if-chain that falls through to the coordinator query at `:113` with no role check. A `member` branch must be inserted before it. Party login is self-contained at `:90-111`, so adding a sibling leaves it untouched by construction.
3. A `members` table exists (`database/mpss_mysql.sql:70-81`) but zero application code references it, it has no auth columns, its `party_id` is NOT NULL, and its ITS column is spelled `its_number` against `parties.its_no`. Left untouched by decision.
4. The Sharaf, Asbaq/Halqa, Moze and Title tables the request calls "existing" do not exist. `miqaats` exists but is a dated scheduling calendar, not a repeatable attendance master, so Tab 8 cannot reuse it.
5. Hijri conversion (`frontend/src/utils/hijriDate.ts:56`) is frontend-only and returns a formatted display string, not components. The Tab 9 year range, the stored Hijri date of birth and server-side validation all need numeric parts. `Documentation/HijriCalendar.php` is the porting source — its `calendar()` does expose `hijri_day/month/year`.

Also found absent: any photo upload capability (and the host filesystem is ephemeral), a
`password_change_required` flag, a password policy, login rate limiting, and any test
infrastructure at all. The UI kit is four components, so the 12-tab form needs eight new
primitives.

**Four decisions were put to the user and confirmed:** deliverables are the spec plus an
as-is document now with schema design deferred to `/sp.plan`; member accounts are provisioned
by administrator roster upload reusing the existing bulk-import pattern, into new tables;
photographs are stored in the database behind an authenticated endpoint; absent lookups become
new maintained lists seeded with values marked `DRAFT - NEEDS REVIEW`.

**The specification** carries 6 prioritised user stories (P1 gated on no regression for the
four existing roles), 107 functional requirements covering all twelve tabs field-by-field, 10
key entities, 13 measurable success criteria, 16 sign-off assumptions and 11 edge cases. Zero
`[NEEDS CLARIFICATION]` markers: where the request asked for a proposal, a concrete proposal
was made and tied to a requirement.

**The checklist** records two validation rounds. Round 1 failed three items -- the lookup
requirements referenced non-existent tables, the edge cases were incomplete, and five open
questions needed resolving. All were fixed and all items now pass, with two deliberate
exceptions annotated: FR-028 names the server tier on purpose, and Assumption 3 records the
in-database photo decision in the section meant for decisions.

## Outcome

- Impact: Stage 1 complete. Branch `001-membership-module` holds a reviewable specification, a validated quality checklist and an as-is record of the live system. No application, schema or deployment change; `git diff master -- backend frontend database` is empty. Stage 2 is blocked pending approval.
- Tests: None run or added. The repository has no test runner, no spec files and no CI, so the request's testing requirements need a harness stood up first -- a prerequisite task recorded in `PROJECT_AS_IS.md`.
- Files: 4 created -- `specs/001-membership-module/spec.md`, `specs/001-membership-module/checklists/requirements.md`, `PROJECT_AS_IS.md`, and this record.
- Next prompts: `/sp.plan` for the database design, migration strategy, implementation sequencing and draft SQL; `/sp.adr` for the three architecturally significant decisions; `/sp.constitution`, since `.specify/memory/constitution.md` is still an unfilled template.
- Reflection: Reading the codebase before writing the spec changed its substance rather than merely confirming it. Five of the request's premises were wrong, and four of its "reuse the existing table" instructions were unimplementable as written. Had the spec been drafted from the brief alone, those would have surfaced mid-implementation on a live production system.

## Evaluation notes (flywheel)

- Failure modes observed: The `create-new-feature.ps1` script failed at its final step under Windows PowerShell 5.1 -- `Join-Path $repoRoot 'history' 'prompts' $branchName` at line 267 uses the three-argument form, which requires PowerShell 7. The branch, the `specs/` directory and `spec.md` were all created successfully; only `history/prompts/<branch>/` was missing and was created by hand. The script also exits before printing its JSON, so `BRANCH_NAME` and `SPEC_FILE` had to be read from the filesystem.
- Graders run and results (PASS/FAIL): PASS -- all 16 checklist items pass; zero unresolved template placeholders across `specs/`, `history/` and `PROJECT_AS_IS.md`; all twelve tabs cross-checked field-by-field against the source request with the four deviations tabulated.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): patch line 267 of `.specify/scripts/powershell/create-new-feature.ps1` to nest two-argument `Join-Path` calls, so the script completes and emits its JSON on Windows PowerShell 5.1.
