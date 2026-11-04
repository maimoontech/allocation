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
