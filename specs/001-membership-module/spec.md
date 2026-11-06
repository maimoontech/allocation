# Feature Specification: Member Login and 12-Tab Member Profile

**Feature Branch**: `001-membership-module`  
**Created**: 2026-10-29  
**Status**: Draft  
**Input**: User description: see `Documentation/claude_membership_module_prompt.md`, recorded verbatim in `history/prompts/001-membership-module/0001-member-login-profile-spec.spec.prompt.md`. In short: add a **Member** option to the existing login page, authenticate members by ITS Number and password, force a password change on first sign-in, and let each member maintain a personal profile presented as one responsive page divided into 12 tabs — without altering Party Login or any other existing workflow.

---

## Scope Note (read first)

This specification is **Stage 1** of the two-stage sequence the request defines. It states
*what* the Membership Module must do and *why*. It deliberately contains no schema, no
endpoint list and no technology choices; those belong to the implementation plan produced
next. No application code, SQL script or database was changed in producing it.

The request described several master data tables as already existing. Inspection of the live
system found that only some do. The affected requirements below state the verified position
rather than the assumed one, and `PROJECT_AS_IS.md` records the evidence.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Existing Users Are Unaffected (Priority: P1)

Every person who can sign in today — Admin, Zonal Head, Party and Venue Coordinator —
continues to sign in the same way, sees the same screens, and completes the same tasks with
the same results after the Membership Module is added.

**Why this priority**: The system is live and in daily use. The request names this as a hard
constraint and singles out Party Login. A member profile that works but breaks an existing
sign-in is a failed delivery, so this story gates every other one.

**Independent Test**: Before and after the change, sign in as each of the four existing user
types and complete that type's primary task (Admin publishes a schedule, Zonal Head
generates a schedule in their zone, Party views its schedule and submits a mic rating,
Coordinator views assigned parties and submits an attendance rating). Compare the results.

**Acceptance Scenarios**:

1. **Given** a Party user with a valid ITS Number and password, **When** they select Party on the login page and sign in, **Then** they reach their schedule screen exactly as before, with no password change prompt and no change to what they can see or do.
2. **Given** an Admin, Zonal Head or Coordinator account, **When** they sign in, **Then** their navigation, permissions and data scope are identical to before the change.
3. **Given** any existing user, **When** they change their own password, **Then** it behaves as it does today.
4. **Given** a Party user, **When** they attempt to open any member profile screen or request another member's data, **Then** access is refused.

---

### User Story 2 - Administrator Provisions Member Accounts (Priority: P1)

An administrator supplies the roster of people who should become members, as a file listing
each person's ITS Number and an initial password. The system creates one member account per
row, storing the password securely, and marks each new account as requiring a password
change before use. Re-supplying a roster updates existing rows rather than duplicating them.

**Why this priority**: No member can sign in until an account exists. This story is the
precondition for Stories 3 to 6.

**Independent Test**: Upload a small roster of test ITS Numbers, confirm one account per row
is created, confirm each is flagged as requiring a password change, re-upload the same
roster and confirm no duplicates appear.

**Acceptance Scenarios**:

1. **Given** a roster file with valid ITS Numbers and initial passwords, **When** an administrator uploads it, **Then** one member account is created per row and a per-row success count is reported.
2. **Given** a roster row whose ITS Number already has a member account, **When** the roster is uploaded, **Then** the existing account is updated and no second account for that ITS Number is created.
3. **Given** a roster row with a missing or malformed ITS Number, **When** the roster is uploaded, **Then** that row is rejected with a message naming the row and the reason, and the remaining valid rows are still processed.
4. **Given** any provisioned account, **When** an administrator views or exports member data, **Then** no password value is readable anywhere.
5. **Given** a non-administrator, **When** they attempt to provision member accounts, **Then** the attempt is refused.

---

### User Story 3 - Member Signs In and Must Set a New Password (Priority: P1)

A person selects **Member** on the login page, enters their ITS Number and the password they
were issued, and is required to choose a new password before they can reach anything else.
Once the new password is set, they are taken to their profile.

**Why this priority**: This is the authentication slice. It is independently valuable — it
proves the new login type coexists with the existing four — and it is where the security
requirements concentrate.

**Independent Test**: With a provisioned account, sign in with the issued password, confirm
the profile is unreachable until a new password is accepted, set one, confirm the profile
opens, sign out and confirm the new password works and the old one does not.

**Acceptance Scenarios**:

1. **Given** the login page, **When** a user opens it, **Then** **Member** appears as a selectable option alongside the four existing ones, and choosing it asks for an ITS Number and a password.
2. **Given** a provisioned member signing in for the first time with the issued password, **When** the credentials are correct, **Then** they are sent to a password change step and cannot reach the profile form or any member data until a new password is accepted.
3. **Given** the password change step, **When** the member submits a new password that meets the policy twice identically, **Then** it is accepted, the requirement is cleared, and the profile opens.
4. **Given** the password change step, **When** the member submits a password that fails the policy or does not match its confirmation, **Then** it is rejected with a message explaining which rule failed, and the requirement remains in force.
5. **Given** a member who has already changed their password, **When** they sign in again, **Then** they go straight to their profile with no password change step.
6. **Given** an ITS Number with no member account, or a correct ITS Number with a wrong password, **When** sign-in is attempted, **Then** it fails with a single message that does not reveal which of the two was wrong.
7. **Given** repeated failed sign-in attempts for the same ITS Number or from the same origin, **When** a threshold is exceeded, **Then** further attempts are refused for a cooling-off period and the member is told to try again later.
8. **Given** a member who changes their password, **When** the change succeeds, **Then** sessions established with the old password can no longer be used.

---

### User Story 4 - Member Records Core Identity (Priority: P1)

A signed-in member opens their profile, finds their ITS Number already filled in and not
editable, and completes who they are (Tab 1) and where they serve (Tab 3) — selecting a Zone
and then a Party from within that Zone, and their role in it. They save, and the data is
still there when they return.

**Why this priority**: Together these two tabs are the minimum profile worth collecting.
Delivering only this story already produces a usable member directory.

**Independent Test**: Sign in as a member, fill Tab 1 and Tab 3, save, sign out, sign back in
and confirm every value persisted, including the automatically derived Hijri date of birth.

**Acceptance Scenarios**:

1. **Given** a signed-in member, **When** the profile opens, **Then** their own ITS Number is displayed, is not editable, and cannot be changed by any submission.
2. **Given** Tab 1, **When** the member picks a Gregorian date of birth, **Then** the Hijri date of birth is shown automatically and the member cannot type over it.
3. **Given** Tab 3, **When** the member selects a Zone, **Then** the Party list offers only the Parties belonging to that Zone, and changing the Zone clears a Party that no longer belongs to it.
4. **Given** a completed Tab 1 and Tab 3, **When** the member saves, **Then** a success message confirms it and the values are present on next sign-in.
5. **Given** an invalid entry — a malformed email, a future date of birth, a phone number outside the accepted format — **When** the member saves, **Then** the save is refused with the offending field identified, and no partial record is stored.

---

### User Story 5 - Member Completes the Single-Entry Sections (Priority: P2)

The member works through the sections that hold one set of answers each: Occupation (Tab 4),
Education and Hifz (Tab 5), Health and Fitness (Tab 6), Asbaq (Tab 10), Tamreen (Tab 11) and
Other Sansta Khidmat (Tab 12). Fields that only apply to certain answers appear only when
relevant, and the BMI is worked out from the height and weight rather than typed.

**Why this priority**: This is the bulk of the data but introduces no interaction pattern
beyond conditional display, so it can follow the core identity slice without blocking it.

**Independent Test**: Complete each of the six tabs in turn, saving after each, and confirm
the conditional fields appear and disappear as specified and that every saved value returns.

**Acceptance Scenarios**:

1. **Given** Tab 4 with Occupation Type set to Job, **When** the tab renders, **Then** Designation is available and the company field is labelled for a job; **When** it is set to Business, **Then** Designation is hidden and the field is labelled for a business.
2. **Given** Tab 5, **When** Hifz Sanad is answered No, **Then** the Sanad selection is not required; **When** it is answered Yes, **Then** a Sanad must be chosen before the tab can be saved.
3. **Given** Tab 6 with a height and a weight entered, **When** the tab renders, **Then** a BMI is displayed, is not editable, and updates when either value changes.
4. **Given** Tab 11 with the Karachi Zakireen Tamreen session answered No, **When** the member saves, **Then** a reason is required and the save is refused without one.
5. **Given** Tab 12 with Khidmat Type set to Sansta, **When** the tab renders, **Then** only the Sansta name is requested; with Umoor, only the Umoor name; with Both, both are requested.
6. **Given** a hidden conditional field that previously held a value, **When** the member saves, **Then** the stored record reflects the visible answers and does not retain a contradictory hidden value.

---

### User Story 6 - Member Manages Repeatable Records (Priority: P2)

The member records things that happened more than once: each Title they hold and the year of
each (Tab 2), each Sharaf and its year (Tab 7), each place visited with how many times and in which
years (Tab 8), and each Ashara Mubaraka attendance with who it was with, the Hijri year and
the place (Tab 9). They can add a row, correct a row, and remove a row.

**Why this priority**: These sections need add, edit and delete behaviour that the
single-entry tabs do not. Separating them keeps that work independently demonstrable.

**Independent Test**: On each of the four tabs, add three rows, edit the middle one, delete
the first, save, and confirm on return that exactly the expected rows remain with the
expected values.

**Acceptance Scenarios**:

1. **Given** Tab 2, **When** the member adds several Titles each with its own year, **Then** all of them are kept and shown as separate entries.
2. **Given** Tab 2, **When** the First Prefix on Tab 1 is None, **Then** no Prefix is displayed on Tab 2; **When** it is Sheikh or Mulla, **Then** that Prefix is displayed and a Prefix Year can be chosen.
3. **Given** any repeatable tab, **When** the member deletes a row and saves, **Then** that row is gone and the other rows are untouched.
4. **Given** Tab 8, **When** the number of times recorded for a place does not agree with the number of years listed against it, **Then** the save is refused with a message naming the place and both counts.
5. **Given** Tab 9, **When** the member chooses a Hijri year, **Then** the choices run from 1400 AH to the current Hijri year and no later.
6. **Given** a repeatable tab with no rows, **When** the member saves, **Then** the save succeeds and the section is recorded as empty rather than failing.

---

### Edge Cases

- **Switching tabs with unsaved edits**: moving between tabs must not discard typed values, and leaving the page with unsaved edits must warn before losing them.
- **Session expiring mid-form**: a member who has been filling the form for a long time must not silently lose the work when their session lapses; they are told, and the entries they made are recoverable after re-authenticating.
- **Two sessions for one member**: if the same member edits the profile in two places at once, the later save must not silently discard the earlier one without the member being told.
- **An ITS Number that is also a Party identifier**: a single ITS Number may legitimately identify both a Party and a member. Selecting Member must authenticate against member accounts only, and selecting Party against party accounts only; a password that works for one must not grant the other.
- **Account provisioned, then the roster is corrected**: re-provisioning must not reset a password the member has already chosen, nor re-impose the password change requirement on an account that has satisfied it.
- **A required list is empty**: a tab whose list has no values yet must explain that and still allow the rest of the profile to be saved.
- **Deactivated or withdrawn member**: cannot sign in, and their profile data is retained rather than deleted.
- **A photo that is too large, is not an image, or is a disguised file**: rejected with a clear message, and never stored or served.
- **A date of birth in the future, or implausibly distant past**: rejected.
- **A height or weight of zero or negative**: rejected, and no BMI is shown.
- **A member who belongs to no Party**: Tab 3 must be completable, or explicitly skippable, without blocking the rest of the profile.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Member account provisioning

- **FR-001**: An administrator MUST be able to create member accounts in bulk from a supplied roster identifying each member by ITS Number.
- **FR-001a** *(authorised 2026-11-04)*: An administrator or a Zonal Head MUST also be able to create ONE member account directly, supplying only the ITS Number, the member's full name and an initial password. Zone, party and every profile answer remain the member's own to enter (FR-047, FR-048), so single creation MUST NOT set them. All of FR-002 through FR-005 apply unchanged: the ITS Number stays unique, and the account is created requiring a password change.
- **FR-002**: The system MUST treat the ITS Number as the unique identifier of a member account; two member accounts MUST NOT share an ITS Number.
- **FR-003**: Provisioning the same ITS Number again MUST update the existing account rather than create a second one.
- **FR-004**: Each newly provisioned account MUST be recorded as requiring a password change before first use.
- **FR-005**: Re-provisioning an account whose member has already set their own password MUST NOT overwrite that password nor re-impose the password change requirement.
- **FR-006** *(amended 2026-11-04; previously "Only administrators")*: Only administrators and Zonal Heads MUST be able to provision, deactivate or reactivate member accounts. A Zonal Head MUST be confined to members posted to their own zone for every such action, and for viewing the account list and member photographs. Bulk roster provisioning (FR-001) remains administrator-only.
- **FR-006a** *(authorised 2026-11-04)*: A Zonal Head's confinement MUST be derived from the member's profile zone (`member_profiles.zone_id`), the same source photo approval already uses. An account with no profile is therefore in no zone and MUST NOT be visible to any Zonal Head — including the one who just created it. The interface MUST state this where an account is created, rather than leaving it to be discovered. Treating zone-less accounts as belonging to whoever created them is explicitly NOT permitted without a column recording that fact, because showing them to every Zonal Head would disclose one zone's members to another.
- **FR-007**: A deactivated member account MUST be refused at sign-in while its profile data is retained.
- **FR-008**: Roster rows that cannot be processed MUST be reported individually with a reason, without preventing the valid rows from being processed.

#### Member sign-in

- **FR-009**: The login page MUST offer **Member** as a selectable option alongside the existing Admin, Zonal Head, Party and Venue Coordinator options.
- **FR-010**: When Member is selected, the system MUST ask for an ITS Number and a password, and MUST label the identifier field accordingly.
- **FR-011**: Member credentials MUST be verified only against member accounts, and MUST NOT grant access to any other user type.
- **FR-012**: Credentials belonging to any other user type MUST NOT grant member access.
- **FR-013**: A failed sign-in MUST return one message that does not disclose whether the ITS Number or the password was wrong.
- **FR-014**: The system MUST refuse further sign-in attempts for a cooling-off period once a threshold of consecutive failures for the same ITS Number, or from the same origin, is exceeded, and MUST say so without revealing whether the account exists.
- **FR-015**: Passwords MUST never be stored, logged, exported or displayed in a readable form, and MUST be held only as a non-reversible hash.
- **FR-016**: A member session MUST expire after a period of inactivity and MUST be invalidated on sign-out.

#### Forced first-login password change and password policy

- **FR-017**: A member whose account is marked as requiring a password change MUST be sent to a password change step immediately after successful sign-in.
- **FR-018**: Until the password change is completed, the member MUST NOT be able to reach the profile form or read or write any profile data, by any route.
- **FR-019**: The password change step MUST require the new password to be entered twice identically.
- **FR-020**: A new password MUST be rejected unless it meets a stated minimum length and complexity or passphrase rule, and the rejection MUST name the rule that failed.
- **FR-021**: A new password MUST be rejected if it is the same as the password being replaced.
- **FR-022**: On a successful password change the requirement MUST be cleared, the member MUST be taken to their profile, and sessions established with the previous password MUST cease to be usable.
- **FR-023**: A member MUST be able to change their password again at any later time by supplying their current password.

#### Profile form behaviour

- **FR-024**: The profile MUST be presented as a single page divided into 12 tabs, in the order and with the titles given in the request.
- **FR-025**: The profile MUST be usable on a phone, a tablet and a desktop, with the tab navigation remaining reachable at every size.
- **FR-026**: Moving between tabs MUST NOT discard values the member has entered but not yet saved.
- **FR-027**: Attempting to leave the profile with unsaved edits MUST warn the member before the edits are lost.
- **FR-028**: Every value MUST be validated by the server before it is stored, independently of any check made in the browser.
- **FR-029**: A save that fails validation MUST identify the offending field and tab, and MUST leave the previously stored record unchanged.
- **FR-030**: A save that spans several sections MUST either record all of it or none of it, never a partial profile.
- **FR-031**: A successful save MUST be confirmed to the member, and a failure MUST state what went wrong in terms the member can act on.
- **FR-032**: If a member's session lapses while the form is open, the member MUST be told, and MUST be able to recover their unsaved entries after signing in again.
- **FR-033**: A member MUST be able to save a partially completed profile and return to finish it later; only the fields stated as required below may block a save.

#### Tab 1 — Personal Information

- **FR-034**: Tab 1 MUST display the signed-in member's own ITS Number (labelled "ITS No.") as a read-only value, and the system MUST ignore any attempt to submit a different one.
- **FR-035**: Tab 1 MUST offer First Prefix and Father Prefix each as a choice of None, Sheikh or Mulla.
- **FR-036**: Tab 1 MUST capture Name, Father Name and Surname as free text.
- **FR-037**: Tab 1 MUST allow a photograph to be attached to the profile, replaced, and removed.
- **FR-038**: Tab 1 MUST capture a Gregorian date of birth through a date picker, and MUST reject a date in the future or implausibly far in the past.
- **FR-039**: Tab 1 MUST derive and display the Hijri date of birth from the Gregorian date of birth using the project's existing Hijri conversion logic, as a read-only value the member cannot type over.
- **FR-040**: Tab 1 MUST offer Marital Status from a maintained list of values.
- **FR-041**: Tab 1 MUST capture Residence Address as multi-line text, and Phone No., Mobile No. 1, Mobile No. 2, WhatsApp No. 1 and WhatsApp No. 2 as telephone numbers validated against a stated format.
- **FR-042**: Tab 1 MUST capture Email and MUST reject a malformed address.

#### Tab 2 — Title and Prefix

- **FR-043**: Tab 2 MUST display the First Prefix chosen on Tab 1 only when that prefix is not None, and MUST hide it when it is None.
- **FR-044** *(amended 2026-11-04; previously "from 1950 through 2026")*: Tab 2 MUST offer a Prefix Year chosen from 1401 AH through the current Hijri year. The year is **Hijri, not Gregorian**, and the interface MUST say so. The upper bound MUST be computed on the server so the list extends itself each Hijri year and a client clock cannot widen it.
- **FR-045**: Tab 2 MUST offer Title from a maintained list of titles.
- **FR-046** *(amended 2026-11-04; previously "from 1950 through 2026")*: Tab 2 MUST allow a member to hold several Titles, each with its own Title Year chosen from 1401 AH through the current Hijri year on the same terms as FR-044, and MUST allow each to be added, corrected and removed independently.

#### Tab 3 — Hizb

- **FR-047**: Tab 3 MUST offer Zone from the Zones already held by the system.
- **FR-048**: Tab 3 MUST offer Party from the Parties already held by the system, restricted to those belonging to the selected Zone, and MUST clear a selected Party that no longer belongs to a newly chosen Zone.
- **FR-048a** *(authorised 2026-11-05)*: The Party list MUST offer **inactive** Hizbs as well as active ones, and MUST mark the inactive ones rather than hiding them. Hiding them has two failure modes: a member whose own Hizb was deactivated would find their saved value absent from the list, so the control renders empty and the save is refused with nothing on screen to explain it; and a member who genuinely belongs to a retired Hizb has no way to record it. Marking is the other half of the requirement — an unmarked inactive Hizb reads as an ordinary choice. Active values MUST be ordered ahead of inactive ones. Zone filtering (FR-048) is unchanged: an inactive Hizb is still confined to its own Zone.
- **FR-049**: Tab 3 MUST offer Role as a choice of Leader, Side Lead or Member.
- **FR-049a** *(authorised 2026-11-06)*: Tab 3 MUST capture **"Since when have you been doing Zikr e Hussain AS?"** as a Hijri year chosen from **1375 AH** through the current Hijri year. The floor is deliberately lower than the 1401 AH of FR-044, FR-046, FR-068, FR-072 and FR-087: a member may have been doing Zikr since long before they held a title or a sharaf. The ceiling MUST be the server-computed current Hijri year, on the same terms as FR-044. The field is optional.

#### Tab 4 — Occupation

- **FR-050**: Tab 4 MUST offer Occupation Type as a choice between Job and Business.
- **FR-051**: Tab 4 MUST capture a company or business name, labelled to match the chosen Occupation Type.
- **FR-052**: Tab 4 MUST request Designation only when Occupation Type is Job.
- **FR-053**: Tab 4 MUST capture the year the job or business began, and MUST reject a year in the future or earlier than the member's year of birth.
- **FR-054**: Tab 4 MUST capture a work Address and a work Phone No.
- **FR-055**: Tab 4 MUST allow several Skills to be selected from a maintained list of skills.

#### Tab 5 — Education and Hifz

- **FR-056**: Tab 5 MUST offer Standard or Degree as a choice of Primary, Middle, Secondary, Intermediate, Bachelors, Masters or PhD.
- **FR-057**: Tab 5 MUST capture Major Subjects as free text, and Status as a choice of Complete or Ongoing.
- **FR-058**: Tab 5 MUST capture Hifz Sanad as a Yes or No answer.
- **FR-059**: Tab 5 MUST offer Sanad from exactly the ten values named in the request — Surah Balad, Surah Inshiqaq, Marhala Ula, Marhala Sania, Marhala Salesa, Marhala Rabea, Marhala Khamesa, Marhala Sadesa, Marhala Sabea, Shahadat Hifz al-Quran al-Kareem — and MUST require one when Hifz Sanad is Yes.
- **FR-060**: Tab 5 MUST capture a Hifz Current Status of Surah, Ayyah and a Last Update date.

#### Tab 6 — Health and Fitness

- **FR-061**: Tab 6 MUST offer Blood Group from the eight standard groups A+, A-, B+, B-, AB+, AB-, O+ and O-.
- **FR-062**: Tab 6 MUST capture Regular Donor as a Yes or No answer and a Last Donation Date, and MUST reject a donation date in the future.
- **FR-063**: Tab 6 MUST capture Height and Weight as numbers, each labelled with its unit of measurement.
- **FR-064**: Tab 6 MUST derive and display BMI from Height and Weight as a read-only value, and MUST show no BMI when either is absent or not a positive number.
- **FR-065**: Health values MUST be readable and writable only by the member they belong to and by explicitly authorised administrators.
- **FR-066**: Health values MUST NOT appear in application logs, error messages or any general-purpose export.

#### Tab 7 — Sharaf

- **FR-067**: Tab 7 MUST offer Sharaf from a maintained list of Sharaf values.
- **FR-068** *(amended 2026-11-04)*: Tab 7 MUST allow several Sharaf entries per member, each with its own year, chosen from 1401 AH through the current Hijri year on the same terms as FR-044.
- **FR-069**: Tab 7 MUST allow each Sharaf entry to be added, corrected and removed independently.

#### Tab 8 — Places Visited

*The original request called this tab "Miqaat". It is renamed here, and the word is used
nowhere in this module, because the system already has a `miqaats` table that means something
different — the scheduling calendar of majlis sessions. See Assumption 17.*

Tab 8 records the **places a member has visited**, with how many times and in which years.

- **FR-070**: Tab 8 MUST offer Place Visited from a maintained list of places, kept entirely separately from the scheduling calendar.
- **FR-071**: Tab 8 MUST allow several entries per member, each recording one place, a Number of Times visited, and the years concerned; the same place MUST NOT appear twice for one member, so that its count and years form one coherent record.
- **FR-072** *(amended 2026-11-04)*: Tab 8 MUST allow several years to be recorded against a single place, each chosen from 1401 AH through the current Hijri year on the same terms as FR-044, and MUST allow each entry to be added, corrected and removed independently.
- **FR-073**: Tab 8 MUST refuse a save where the Number of Times recorded for a place does not equal the number of years listed against it, naming the place and both counts.

#### Tab 9 — Ashara Mubaraka

- **FR-074**: Tab 9 MUST allow several attendance records per member, each added, corrected and removed independently.
- **FR-075**: Tab 9 MUST capture Attended With as a choice between With Aqa Moula TUS and With Aamil.
- **FR-076**: Tab 9 MUST offer a Hijri Year from 1400 AH through the current Hijri year, determined using the project's existing Hijri logic, and MUST NOT offer a later year.
- **FR-076b** *(authorised 2026-11-05)*: Tab 9 MUST present Ashara Mubaraka as one row per Hijri year, from the current Hijri year down to 1405 AH, each answered Not attended, With Aqa Moula TUS or With Aamil. Not attended MUST mean no record for that year. The server MUST continue to accept 1400 to 1404 AH (FR-076), and a record already saved for one of those years MUST be shown as an extra row rather than hidden.
- **FR-077** *(amended 2026-11-05; previously unconditional)*: Tab 9 MUST capture Moze, and MUST capture Mohallah as an optional value offered from the Mohallahs already held by the system. Both apply ONLY to a record attended **With Aamil** — see FR-077a.
- **FR-077c** *(authorised 2026-11-06; supersedes the Mohallah half of FR-077)*: Tab 9 MUST offer a **Venue** in place of Mohallah for a record attended With Aamil. A venue already names its Mohallah, so Venue is the more specific answer to the same question. The list MUST contain **inactive venues as well as active ones, marked** and ordered after the active ones: an Ashara recorded for a past year may have been held somewhere since closed, and filtering those out would leave the member unable to answer truthfully. Venue MUST be optional, and MUST be cleared when the answer changes to With Aqa Moula TUS. The lookup response MUST expose only the venue's id, name, Mohallah and active flag — `venues` holds `password_hash` and `last_login_at`, and neither may reach a member (FR-101). The `mohallah_id` column is retained so existing rows are not destroyed, but is no longer collected.
- **FR-077a** *(authorised 2026-11-05)*: Where a member attended MUST follow who they attended with, because the two answers ask different questions. A record attended **With Aqa Moula TUS** MUST offer a new master list, "Ashara with Aqa Moula", naming where Aqa Moula TUS held Ashara Mubaraka that year, and MUST NOT offer Moze or Mohallah. A record attended **With Aamil** MUST offer Moze and the optional Mohallah, and MUST NOT offer the Aqa Moula list. Changing the answer MUST clear the fields the other answer owns, on the client and again on the server, so a value cannot survive in a field the form no longer shows. The new list MUST be maintainable by an administrator through the Dropdown Lists panel on the same terms as the other lookups, and MUST ship empty: supplying values would mean stating a religious calendar the organisation has not confirmed.
- **FR-077b** *(authorised 2026-11-05)*: Aqa Moula TUS holds Ashara in one place a year, so each "Ashara with Aqa Moula" entry MUST carry a Hijri year, set by an administrator, with at most one entry per year. A record attended With Aqa Moula TUS MUST NOT ask the member for the place: Tab 9 MUST show the entry for that year, and the server MUST set the record's place from the year on save, overriding any value the client sent. A year with no entry yet MUST still be saveable, and MUST say that its place has not been added.
- **FR-077c** *(authorised 2026-11-05)*: The same place name MAY appear more than once in "Ashara with Aqa Moula", one entry per year it hosted Ashara. The Hijri year, not the name, MUST remain unique. This is the only lookup list whose names may repeat.

#### Tab 10 — Asbaq

- **FR-078**: Tab 10 MUST offer Asbaq Level as a choice of Zaher, Taweel or Haqiqat.
- **FR-079**: Tab 10 MUST offer Halqa from a maintained list of Halqa values, and MUST capture Ustad.

#### Tab 11 — Tamreen

- **FR-080**: Tab 11 MUST capture whether the member attends the Karachi Zakireen Tamreen session as a Yes or No answer.
- **FR-081**: Tab 11 MUST require a Reason when that answer is No, and MUST refuse the save without one.
- **FR-082**: Tab 11 MUST capture Party Tamreen Frequency and Solo Tamreen Frequency, each from a maintained list of frequency values.
- **FR-083**: Tab 11 MUST capture the Method Used for Tamreen from a maintained list of method values.
- **FR-084**: Tab 11 MUST capture whether the member takes assistance from an Ustad or senior Zakireen, and whether they use Idaratuz Zakereen books, each as a Yes or No answer.

#### Tab 12 — Other Sansta Khidmat

- **FR-085**: Tab 12 MUST offer Khidmat Type as a choice of Sansta, Umoor or Both.
- **FR-086**: Tab 12 MUST request a Sansta Name when Khidmat Type is Sansta or Both, and an Umoor Name when it is Umoor or Both.
- **FR-087** *(amended 2026-11-04)*: Tab 12 MUST capture Designation as free text and a Since year chosen from 1401 AH through the current Hijri year on the same terms as FR-044, which is what rejects a year in the future. Because this year is Hijri, it MUST NOT be compared against the member's Gregorian year of birth — a valid Hijri year is numerically smaller and that comparison would reject every one of them. Tab 4's `occupation_since_year` stays Gregorian and keeps that check.

#### Photograph handling

- **FR-088**: The system MUST accept only image files, in a stated set of formats, up to a stated maximum size, and MUST reject anything else with a clear message.
- **FR-089**: The system MUST verify that an uploaded file is genuinely an image of an accepted format rather than relying on its name or declared type.
- **FR-090**: A member's photograph MUST be retrievable only by that member and by explicitly authorised administrators, never by an unauthenticated or unrelated request.
- **FR-091**: Replacing or removing a photograph MUST leave no previously stored image retrievable.

#### Lookup data

- **FR-092**: Zone, Party and Mohallah selections MUST draw on the data the system already holds, and MUST NOT introduce a second copy of that data.
- **FR-093**: Lists the system does not yet hold — Title, Sharaf, Halqa, Moze, the Tab 8 places, Marital Status, Skills, Tamreen frequencies and Tamreen methods — MUST be newly established as maintained lists rather than fixed into the screens.
- **FR-094**: Every value supplied as an initial filling of a new list MUST be marked as a draft awaiting review, and MUST be correctable without changing the screens.
- **FR-095**: A list that is empty MUST be presented to the member with an explanation, and MUST NOT prevent the rest of the profile from being saved.
- **FR-096**: No value shown in any list MUST be attributed to an external source unless that source is real and identified.

#### Data protection and isolation

- **FR-097**: A member MUST be able to read and change their own profile and no other member's.
- **FR-098**: Every request for profile data MUST be answered on the basis of the signed-in identity, and MUST ignore any member identifier supplied by the caller.
- **FR-099**: An attempt by one member to read or change another member's profile, photograph or any repeatable record MUST be refused, and MUST reveal nothing about whether that profile exists.
- **FR-100**: Member profile data MUST NOT be readable by Party, Zonal Head or Coordinator users through any existing or new route.
- **FR-101**: Personal contact details, health values and photographs MUST NOT be included in existing exports or reports unless that is separately specified and authorised.
- **FR-101a** *(authorised 2026-10-30)*: `GET /api/v1/import-export/database-backup` is the separately authorised exception. It iterates `SHOW TABLES`, so it necessarily carries `member_profiles` and `member_photos` in full. This is intended: a backup that omits tables cannot restore the system, and this endpoint is the rollback tool the release runbook depends on. It is admin-only. FR-101 continues to apply in full to the CSV entity exports and to any report, which is what it was aimed at.

#### No regression to existing behaviour

- **FR-102**: Party sign-in MUST continue to authenticate by ITS Number and password against party accounts, with the same outcome, the same destination screen and the same permissions as before.
- **FR-103**: Admin, Zonal Head and Coordinator sign-in MUST be unchanged.
- **FR-104**: The password change available to existing users MUST be unchanged in behaviour for those users.
- **FR-105**: Schedule generation, publishing, manual editing, ratings, reporting and import or export MUST be unchanged in behaviour and in the data they produce.
- **FR-106**: No existing record MUST be altered or removed in order to introduce the Membership Module.
- **FR-107**: The four existing user types MUST NOT be offered, or be able to reach, any member-only screen.

### Key Entities

- **Member Account**: the means by which a person signs in as a member. Identified by ITS Number; carries a securely held password, whether a password change is still required, whether the account is active, and when it was last used. Separate from the accounts used by Admin, Zonal Head, Party and Coordinator, so that neither can authenticate as the other.
- **Member Profile**: the single set of personal particulars belonging to one Member Account — the Tab 1 identity and contact details, the derived Hijri date of birth, and the one-per-member answers from Tabs 3, 4, 5, 6, 10, 11 and 12. One profile per member.
- **Member Photograph**: the image attached to a Member Profile, retrievable only by its owner and authorised administrators.
- **Member Title**: one Title held by a member in one year. A member may have many.
- **Member Sharaf**: one Sharaf received by a member in one year. A member may have many.
- **Member Place Visit**: one place a member has visited, with the number of times and the years concerned. A member may have many, each covering several years, and each place appears at most once per member.
- **Member Ashara Attendance**: one Ashara Mubaraka a member attended, with whom it was attended, the Hijri year, the Moze and optionally the Mohallah. A member may have many.
- **Member Skill**: one skill claimed by a member, drawn from the maintained skills list. A member may claim several.
- **Maintained List**: a named set of selectable values — Title, Sharaf, Halqa, Moze, Place, Marital Status, Skills, Tamreen frequency, Tamreen method — each value correctable without altering the screens, and each initially supplied value marked as a draft awaiting review.
- **Existing Master Data**: Zones, Parties and Mohallahs, already held by the system and used as-is by the profile, with Parties related to the Zone they belong to.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All four existing user types complete their current primary task successfully after the change, with no observable difference from before — verified by the same scripted walkthrough run before and after.
- **SC-002**: 100% of attempts by one member to read or change another member's profile, photograph or repeatable records are refused.
- **SC-003**: A member completes first sign-in and the mandatory password change in under 2 minutes.
- **SC-004**: 0% of members can reach the profile form or any profile data before completing the mandatory password change.
- **SC-005**: A member can enter data across all 12 tabs and save once with no loss of entered values, on a phone, a tablet and a desktop.
- **SC-006**: 95% of members who begin the profile complete Tab 1 and Tab 3 in a single session without needing help.
- **SC-007**: Every value a member saves is still present and unchanged when they next sign in.
- **SC-008**: Every invalid entry is refused with a message that identifies the field and the rule, and leaves the previously stored profile intact.
- **SC-009**: No password, health value or photograph appears in any log, error message or general-purpose export.
- **SC-010**: Repeated failed sign-in attempts are throttled within a stated number of attempts, and the response reveals nothing about whether the account exists.
- **SC-011**: A roster of 500 member accounts can be provisioned in one operation, with every rejected row individually reported.
- **SC-012**: Dependent selections behave correctly in 100% of cases: the Party list never offers a Party outside the chosen Zone, and the Hijri year list never offers a year beyond the current Hijri year.
- **SC-013**: No existing record is altered or removed by introducing the module, confirmed by comparing record counts and checksums of existing data before and after.

---

## Assumptions

Each of these is a decision taken in order to produce a complete specification. They are
listed separately **because they need your sign-off**; correcting any of them changes the
requirements above rather than the implementation.

**Confirmed with you during this session**

1. **Account provisioning** happens by administrator upload of a roster, reusing the pattern the system already uses for bulk data, with a temporary password per member and a forced change at first use. Members do not self-register.
2. **Member accounts are new and separate.** The system contains an unused member table that is referenced by no application code and has no password fields. It is left untouched, so there is no risk to existing data and no second source of truth for ITS Numbers.
3. **Photographs are held inside the database** and served through an authenticated request, rather than written to the server's filesystem or a third-party store. The application runs on a host whose filesystem is discarded on each deployment, so files written there would not survive.
4. **Missing lists are newly created and seeded with draft values** marked as awaiting review, so the module is testable immediately while the authoritative values are confirmed.

**Proposed by me, where the request asked for a proposal or gave no default**

5. **Tab 3 Zone and Party are declared by the member**, not inherited from an administrator's assignment. The request has the member choosing both, and no member-to-party assignment exists to inherit from.
6. **Tab 11 Party Tamreen Frequency and Solo Tamreen Frequency** are offered as: Daily, Weekly, Fortnightly, Monthly, Occasionally, Never.
7. **Tab 11 Method Used for Tamreen** is offered as: Self Study, With a Group, With an Ustad, Audio Recording, Video Recording, Written Notes, Other.
8. **Tab 12 Since is a year**, not a full date, matching the Since Year on Tab 4.
9. **Tab 8 consistency rule**: the Number of Times must equal the count of years listed for that place. The request asked for ambiguity here to be flagged rather than guessed; this is the rule proposed, and FR-073 enforces it.
10. **Tab 6 units are centimetres for Height and kilograms for Weight**, with BMI as weight divided by height in metres squared.
11. **Tab 1 phone numbers** accept Pakistani national and international formats; one stated format is applied to all five number fields.
12. **Password policy**: at least 12 characters, or at least 8 with a mix of character types; the previous password may not be reused.
13. **Sign-in throttling**: a cooling-off period after a small number of consecutive failures per ITS Number and per origin.
14. **Skills list**: supplied as a clearly marked initial seed list for review. No external source is claimed for it, as the request requires.
15. **Marital Status list** is offered as: Single, Married, Widowed, Divorced.
16. **A member need not belong to a Party.** Tab 3 is completable but not mandatory, so a member with no current Hizb affiliation can still hold a profile.

**Corrected after your clarification (2026-10-29)**

17. **Tab 8 is named "Places Visited", not "Miqaat".** It records the places a member has visited, with how many times and in which years. The word "Miqaat" is deliberately not used anywhere in this module, because the existing `miqaats` table means something else entirely — the scheduling calendar of majlis sessions for a single Hijri year. Dropping the word removes the ambiguity at the source rather than relying on everyone remembering the distinction.
18. **Tab 9's `Moze` and Tab 8's places are kept as two separate lists**, because the requirement lists them as separate fields. If they draw on the same real-world set of places they should be merged into one lookup — **needs your decision**.

---

## Dependencies

- **Zones, Parties and Mohallahs** must already be populated for Tabs 3 and 9 to be usable. They are.
- **The authoritative values** for Title, Sharaf, Halqa, Moze and the Tab 8 place list had to be supplied before the module could collect real data, because all five shipped empty. **Satisfied** — supplied via the Member Lists admin screen and now carried in `database/sources/membership_seed.sql`, so a live apply creates them populated and reviewed. See T018 in [tasks.md](./tasks.md).
- **The roster of people who should become members**, with their ITS Numbers, must be supplied before any member can sign in.
- **The project's existing Hijri conversion logic** is depended on for the derived Hijri date of birth and the Tab 9 year range. It currently produces a formatted date for display only and does not expose a year on its own; making a Hijri year available is a dependency for FR-076.
- **A stated retention position** for member personal data, health values and photographs is needed before the module collects real data.

## Out of Scope

- Implementation of any of the above. This document is Stage 1; no code, schema or script is produced by it.
- Reporting, searching or analysis across member profiles by administrators or Zonal Heads.
- Any change to scheduling, publishing, ratings, reporting, or import and export behaviour.
- Self-service password recovery for members. As with existing users, a forgotten password is handled by an administrator.
- Supplying the authoritative religious and organisational list values.
- Rotating the credentials that remain outstanding in `CHANGELOG.md`. That is a separate, pre-existing task and is not addressed here.
