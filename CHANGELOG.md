# Changelog — Claude Migration Baseline

## 2026-11-12 — Added: the Need Help chat for members

A **Need Help** button sits at the bottom right of every member screen. It opens a chat that
answers questions about filling in the profile, asks for a five-star rating, then "Do you
need further help?" — Yes returns to the question box with the conversation still above, No
replies "Thanks from Anjuman e Zakereen Hussain AS." and closes.

**The answers are a knowledge base, not a language model.** Every one restates a rule this
application actually enforces — 1375 AH for the Zikr e Hussain year and 1401 for the others,
why BMI stays blank, why the Hizb list needs a Zone first, that a rejected photograph is
removed. A member told the wrong range loses a save and makes a phone call, and an answer
that merely sounds right is worse than none. It also needs no API key, costs nothing per
message, and works when the network does not.

- A question matching nothing is answered honestly: it says so and lists what can be asked.
  Nothing is guessed, and **one weak keyword will not produce an answer** — "a question about
  my year" reaches a person rather than a confident paragraph about titles.
- The steps are a state machine, not a set of flags: the stars cannot appear before an
  answer, the Yes/No cannot appear before a rating, and a second question cannot be typed
  while the first is unrated. Tests assert each of those absences.
- Every exchange is stored with ITS Number, Name, Question, Agent Reply and Star Rating. The
  ITS number and name are **copied onto the row**, so the log says who asked at the time
  rather than being rewritten by a later name change. An unrated answer stays NULL — the
  member closed the window or is still reading, which is not a score of zero.
- **Admin → Help Chats** lists every exchange with its rating, the average, and how often the
  agent had no answer at all. That last number is the one worth acting on: each is a gap a
  member actually hit.
- The widget is mounted on the member shell rather than the profile page, so it is reachable
  from every member screen — including the forced password change, where someone who cannot
  get in is most likely to want it.

FR-110 added. 293 frontend tests pass (12 new); the knowledge base has 22 tests of its own,
which found two wrong answers before they shipped.


## 2026-11-12 — Fixed: the test suite is runnable again, and green

The previous entry said verification was incomplete because the suite kept collapsing. It is
now **281 tests passing across all 18 files**, stable over repeated runs, and the five
changes above are covered.

- **`pool: "vmThreads"`** in `vitest.config.ts`. On the default pool the suite intermittently
  failed to *collect* — every file, including ones untouched for weeks, reporting "Vitest
  failed to find the current suite". That is a worker dying rather than a test failing, and
  it is easy to misread as a code problem: the same tree would pass minutes later, and single
  files passed while the full run did not. `vmThreads` reuses one jsdom per worker instead of
  building eighteen, which Vitest's own output had been suggesting. Per-file isolation is
  unchanged, and removing the one line is the whole revert.
- Dropped the two **Place Visited Year** cases from the Hijri-year dropdown tests. That
  dropdown no longer exists — the years came off Tab 8 in the previous entry.
- The LoginPage test asserted a **"Zakereen Scheduling System"** subtitle that is commented
  out in `LoginPage.tsx`. The assertion followed the UI rather than being left red; the
  heading above it is the branding the page actually shows. This one predates today's work —
  it was the single failure the suite already carried.


## 2026-11-12 — Five changes across the member profile

**1. The full name is all five parts.** First Prefix, Name, Father Prefix, Father Name,
Surname — the profile header was showing Name and Surname only. It was being composed four
different ways in four files; there is now one function, and the Party Members page, which
already did it correctly, is what the others were brought to match. "None" on either prefix
is treated as absent.

**2. Years are gone from Maqamaat Muqaddasah.** Only the place and the number of times are
asked for now. **FR-073 went with them** — the rule that Number of Times had to equal the
number of years listed has nothing left to compare against, so it is removed from the form
*and* the server. Years already stored are left untouched rather than deleted; they are
simply no longer shown or required.

**3. "Not attended" is gone from Ashara Mubaraka.** A year nobody has answered now shows no
choice selected, which is the same thing it always meant. That radio was *also* the only way
to take an answer back, so an **answered** year gets a Clear control — without it a wrong
answer would have been permanent.

**4. Method Used for Tamreen takes several answers.** A new `member_tamreen_methods` table,
and the single `tamreen_method_id` is kept and no longer written. The migration carries an
existing answer across once, so nobody re-enters what they already said.

**5. A rejected photograph is deleted.** It used to be flagged `rejected` and left in place,
so the member went on seeing it on their profile and in the admin list — the one thing a
rejection is for did not happen. `has_photo` comes from the row existing, so removing the row
is what actually clears it. The reason is returned to the administrator and not retained;
nothing ever showed it to the member.

FR-034a, FR-072a (superseding FR-073), FR-075a, FR-084a and FR-058a added.

**Verification is incomplete and I am not claiming otherwise.** Both typechecks and both
builds are clean, and the generated SQL has the expected 24 tables with the backfill ordered
after its CREATE. The frontend test suite could not be run reliably: workers kept dying
during collection, taking files I never touched with them. One run that did complete showed
5 failures, all stale assertions, which are fixed here. **Please run `npm test` in
`frontend/` yourself** — ideally when the `hrms` dev stack is not running, since that is the
likeliest cause.


## 2026-11-11 — Changed: three lists keep their own order; the prefixes go alphabetical

Yesterday's blanket A-Z was too wide in one direction and too narrow in another.

- **Titles, Hifz Sanads and Halqas** follow `display_order` again — the column an
  administrator sets on the Dropdown Lists page. These three carry a sequence the alphabet
  does not know: titles and sanads rank, and halqas run in the organisation's own order.
  So `display_order` is meaningful again, for these three.
- **First Prefix and Father Prefix** are now alphabetical: None, Mulla, Sheikh.

**"None" stays at the top** rather than taking its alphabetical place between Mulla and
Sheikh. It is not a prefix — it is this field's way of saying there isn't one, which every
other dropdown here expresses with a "Select..." placeholder, and placeholders belong first.
Say the word if you want it strictly alphabetical instead.

The ordering is now stated at each call site (`"name"` or `"display"`) rather than inferred,
because nothing about a list's contents says which rule it wants — a silent default is how
Titles got alphabetised in the first place. Everything else stays A-Z per FR-093a.

FR-093b added.


## 2026-11-09 — Changed: every dropdown of names is A-Z, active and inactive together

Sorting is now case-insensitive alphabetical, applied to the stored name rather than the
rendered label — so a "(DRAFT — NEEDS REVIEW)" suffix cannot file a value under the wrong
letter.

- `lookupOptions` sorts, which covers ten dropdowns at once: Titles, Sharaf, Halqas, Mozes,
  Maqamaat Muqaddasah, Hifz Sanads, Marital Statuses, both Tamreen lists and Zones.
- **Hizb and Venue lose their active-first grouping.** A member looking for a named Hizb was
  searching two lists and had to know which half it was in before the alphabet helped.
- **The "— INACTIVE" suffix is gone from both**, following the change already made in the
  working tree. Inactive values are still *offered* — a member whose own Hizb was
  deactivated must still find it — they are simply no longer distinguished.
- Skills (45 of them, on Tab 4) now sorted too; it was taking the server's order.

**Two things deliberately left alone**, because "text dropdown" does not describe them:

- **Year lists** stay numeric and newest-first. Alphabetising 1448, 1447, 1446 would be
  nonsense.
- **Fixed enumerations** keep the order their requirement gives them — Education Level runs
  Primary → Middle → Secondary → Intermediate → Bachelors → Masters → PhD, which is a
  progression the alphabet would shred. Same for Prefix, Hizb Role, Education Status, Blood
  Group, Asbaq Level and Khidmat Type. Say the word if you want those alphabetical too.

**One consequence worth knowing:** `display_order` on the Dropdown Lists page no longer
affects what a member sees. It is still editable and still shown; it just does not order
anything any more.

FR-093a added; FR-048a and FR-077c amended where they required the marking and grouping.


## 2026-11-08 — Added: an administrator can reset a member's password

**Reset password** against each row on Admin → Members, opening a panel that names the
member. Administrators only — the server refuses a Zonal Head, so the control is not shown
to one.

A reset does five things in one transaction, and the third is the one that matters:

1. Stores the new hash under the same policy as a member's own password change.
2. Sets `must_change_password` — the administrator now knows this value, so it is a
   one-time credential exactly like a provisioned one.
3. Sets `password_changed_at` to **now, and not NULL**. `requireMember` compares that column
   to the token's stamp for *equality*, so writing NULL — which is what the create route
   does — would have left every token minted while it was already NULL still valid. Whoever
   was signed in as that member would have stayed signed in, through the very reset meant to
   lock them out.
4. Revokes the member's refresh tokens. Access tokens are stateless and die by (3); refresh
   tokens are rows, and would otherwise mint new ones straight past it.
5. Clears their failed sign-in attempts. A lockout is the commonest reason to reset, and
   leaving it would mean the reset appeared to work and changed nothing the member could see.

- The panel warns that the member will be signed out everywhere, because an administrator
  who does not know that will not understand why the person they were helping dropped off
  the call.
- `member_password_resets` records who reset it, for whom, and when. No password material —
  the question an audit has to answer is who gave somebody else access to this account.
- The response echoes nothing of the password (FR-015). The administrator already has it.
- FR-005a added, narrowing FR-005.


## 2026-11-08 — Added: two Idarat al Zakereen fields on Tab 3

- **Registered with Idarat al Zakereen** — Yes/No.
- **When were the recordings of 5 Kalam uploaded on the Idarat al Zakereen website?** — free
  text, 150 characters, optional.

Two choices worth stating:

- **Radios, not a checkbox.** You asked for a checkbox, and a checkbox cannot express "not
  answered yet" — it would read as "No" from the moment the form opened, and nobody could
  tell a member who answered no from one who has not been asked. Tab 11 settled the same
  question the same way, and the column is nullable so the distinction survives a save.
  Say the word if you want a true checkbox and I will change it.
- **Free text, not a date.** The question asks *when*, but the answer a member actually holds
  is often "last Ashara" or "not yet". A date control would reject the honest answer.

Both columns arrive via `ensureSchema()` at boot and via a new section 4e of
`MEMBERSHIP_LIVE_INSTALL.sql`, ordered after the BMI repair that makes any `ALTER` on
`member_profiles` safe. FR-049b and FR-049c added.


## 2026-11-07 — Changed: height is entered in feet and inches

Tab 6 asks for height as **feet and inches** instead of a single centimetre box, and shows
the centimetre value it will save underneath.

- **Stored as centimetres still.** BMI is a generated column computed from `height_cm`;
  changing the stored unit would mean rewriting that expression and migrating every row to
  record the same measurement differently. Feet and inches are how it is asked, centimetres
  how it is kept. No schema change, no migration.
- **Inches are not whole numbers.** 174 cm is 5 ft 8.5 in. Rounding it to 5 ft 9 would move a
  stored height by 1.26 cm every time a member opened the tab and saved anything at all —
  so the half inch is kept, and a round-trip test holds it to under 0.1 cm.
- 12 inches carries into the next foot, or 182.8 cm would display as "5 ft 12 in".
- The two boxes keep their own typed state, so entering feet before inches does not renumber
  the other box, and clearing one does not wipe both.
- This also closes the unit confusion behind yesterday's outage from the other side: a single
  "Height (cm)" field invited 1.75, whereas 5 and 9 cannot be mistaken for anything else.
- FR-063b added.


## 2026-11-07 — Fixed: the server would not start — "Out of range value for column 'bmi'"

A member had typed their height in **metres** — 1.75 rather than 175. Nothing refused it:
`bmi` is a **VIRTUAL** column, computed on read and never stored, so nothing evaluated
`70 / 0.0175²  = 228,571` against its `DECIMAL(5,2)` ceiling of 999.99 at the time of the
save. The row was fine; the derived value was not.

It surfaced when yesterday's `ALTER TABLE member_profiles ADD COLUMN` rebuilt the table —
a rebuild materialises every virtual column for every row. The ALTER failed, `ensureSchema()`
threw, and the server stopped booting entirely. One member's typo, detonated months later by
an unrelated migration.

**Three places now refuse it, because one is not enough:**

- **The column.** `bmi` is `DECIMAL(6,2)` and its expression yields NULL unless *both* inputs
  are plausible for a person. Widening alone would not have closed this: the old `> 0` test
  still allowed a height of 0.01 cm, where BMI reaches 1e11. The guard is the fix; the width
  only has to fit what the guard allows, which tops out at 500 / 0.5² = 2000.00.
- **The server.** `height_cm` must be 50–300 cm and `weight_kg` 2–500 kg. The old bound was
  "whatever `DECIMAL(5,2)` holds", which is a storage fact, not a fact about people. The
  error names the unit, because the unit is the mistake worth catching.
- **The browser.** The same bounds on the inputs, and `computeBmi` applies the same guard, so
  the live preview can no longer show a BMI the database will store as NULL. It previously
  displayed 228,571 without comment, which is how the value came to look acceptable going in.

**Recovery is automatic.** `ensureSchema()` repairs the column *before* any other ALTER on
`member_profiles`, so the next boot fixes itself. `MEMBERSHIP_LIVE_INSTALL.sql` carries the
same repair as section 4b2, ordered ahead of 4c and 4d for the same reason.

The member's stored 1.75 is left as it is: their BMI now reads blank, and the next time they
touch the field they will be asked for centimetres. Guessing that they meant 175 would be
putting a number in someone's medical record on an assumption.


## 2026-11-07 — Added: Nationality and Mohallah on Tab 1

- **Nationality**, before Marital Status. **Free text**, because the request named a dropdown
  only for Mohallah and drew that distinction itself. 100 characters, optional. If you would
  rather it were a managed list, that is a lookup table and an entry on the Dropdown Lists
  page — say so and it is a small change, but it would need agreed values first.
- **Mohallah**, beside Residence Address, from the existing `mohallahs` master list. No copy
  of that list is made (FR-092) — it is the same 18 Mohallahs the rest of the system uses.
- The foreign key is `ON DELETE RESTRICT`, not `SET NULL`. `mohallahs` is maintained from a
  different panel, and silently erasing a member's own answer because somebody deleted a row
  there is worse than refusing the delete.
- Both columns are added by `ensureSchema()` at boot **and** by a new section 4d of
  `MEMBERSHIP_LIVE_INSTALL.sql` (now 22 tables). The script alone would not be enough:
  production already has `member_profiles`, so `CREATE TABLE IF NOT EXISTS` skips it.
- FR-040a and FR-040b added.


## 2026-11-06 — Changed: the Ashara grid starts at the Zikr e Hussain year

Tab 9 listed every year from the current Hijri year down to a fixed 1404 AH. It now starts at
the member's **Zikr e Hussain year from Tab 3**, because a member cannot have attended Ashara
Mubaraka before they began doing Zikr — listing those years asks a question with only one
possible answer.

- A Zikr year **earlier than 1404 AH, or not given at all**, falls back to 1404 as before.
  Without that floor an answer of 1375 would produce seventy-odd rows nobody will fill.
- It follows the **unsaved** value: change the year on Tab 3, come back, and the range has
  already moved. A cross-tab rule like Tab 2 taking its prefix from Tab 1.
- A record already saved below where the grid now starts is **still shown and still
  correctable**, marked "(earlier)" — including one saved before the member shortened their
  own Zikr year. A value they can see nowhere is a value they can change never.
- **Presentation only.** The server still accepts 1400 AH upwards (FR-076). Tightening it
  would reject historical records that are already valid, and would fight the rule above.
- Fixed two stale comments and FR-076b, which still said the grid started at 1405 after the
  constant moved to 1404 in `fedb903`.
- FR-076c added.


## 2026-11-06 — Fixed: "Could not load this profile" when an admin opened a member

The profile itself loaded fine. `GET /api/v1/members/lookups` did not: it was guarded by
`requireMember()`, which **403s every non-member role**, so the dropdown lists behind the
twelve tabs were refused and the page fell into its error state.

Reference data, refused to the role that most needs it to render the same form.

- The lookups now accept member, administrator and Zonal Head. The two paths stay apart: a
  member still goes through `requireMember()`, which reads their account row to enforce
  FR-007, FR-018 and FR-022, while the other roles skip it — that query is for a
  `member_accounts` row they do not have, and FR-103 keeps it off their routes by design.
- **The error message was part of the problem.** "Could not load this profile" sent the
  reader to the profile endpoint, the one thing that had worked. The page now says when it
  was the dropdown lists that failed, with a test holding that distinction.
- Fixed a stale test of my own from 2026-11-04: `memberRouteMounting` still expected a Zonal
  Head to get 403 from the admin member list, which FR-006 stopped being true when it was
  amended to admit them. It would have failed on the first local run. Four tests added for
  the lookups guard across all three roles plus the anonymous case.


## 2026-11-06 — Added: Admin and Zonal Head can open a member's profile

**View profile** on the Members list opens all twelve tabs for one member. Both roles read;
only an administrator can change anything.

Two permissions that are easy to conflate, so they are separate throughout:

- **Read** — administrator and Zonal Head, **including Tab 6's health values**. FR-065 already
  allowed "explicitly authorised administrators"; a Zonal Head is not an administrator, so
  extending it to them for their own zone was authorised explicitly and FR-065 is amended with
  its previous wording recorded.
- **Write** — administrator only. The Zonal Head's view is read-only, every field disabled.

- **The server decides who may edit.** `can_edit` is sent in the payload and the page obeys it;
  the browser never works it out from the signed-in role. A client that guessed wrong would
  show a Save button the server then refuses, which is worse than not offering one. The `PUT`
  is guarded independently, so the flag is a courtesy and not the control.
- **Every administrator edit is recorded** in a new `member_profile_edits` table: who, when,
  and **which fields changed — names only, never values**. Tab 6 is medical data and FR-066
  says health values appear in no log, so an audit row saying `blood_group` changed gives a
  disputed value its provenance without copying the value somewhere new that would then need
  protecting just as carefully. A member editing their own profile writes no row.
- A Zonal Head is confined to their own zone exactly as the list and photo endpoints confine
  them. A 403 is explained as a zone boundary, not as an error to retry.
- The twelve-branch tab switch moved to `profileTabs.tsx` and is shared by both pages. Two
  copies would have meant the admin view silently missing a tab added later.
- `Tab01Personal`'s photo props are now optional and its fetch path is a parameter. It
  hardcoded `members/me/photo`, which on an admin view would have shown the **administrator's**
  own photograph on every member they opened.
- The member list itself is unchanged and still carries no profile answers: a page of fifty
  members should not be a page of fifty medical records (FR-101).
- `globalSetup` now runs `ensureSchema()` before the suite, so a developer's local database
  gains new columns instead of failing with "unknown column".
- FR-047a added; FR-065 amended.


## 2026-11-06 — Added: Zikr e Hussain year on Tab 3; Venue replaces Mohallah on Tab 9

**Tab 3** gains "Since when have you been doing Zikr e Hussain AS?", a Hijri year from
**1375 AH** to the current Hijri year — 1375–1448 today, exactly as asked, and rolling so it
never goes stale. The floor is deliberately lower than the 1401 AH that governs the title,
sharaf, place-visit and Sansta years: a member may have been doing Zikr since long before they
held any of those. `hijriYearError` now takes the floor as an argument rather than being
duplicated.

**Tab 9** replaces the Mohallah dropdown with a **Venue** one, showing **all 51 venues, active
and inactive**, with the inactive ones marked `— INACTIVE` and sorted last. A venue already
names its Mohallah, so this is the more specific answer to the same question; and an Ashara
recorded for a past year may have been held somewhere since closed, which a filtered list
would make impossible to record.

- The venue lookup selects **only** `id`, `venue_name`, `mohallah_id` and `is_active`.
  `venues` holds `password_hash` and `last_login_at` — venues sign in to this system — and a
  `SELECT *` would have published both to every member (FR-101). A test asserts the exact key
  set, not merely the absence of one field.
- The server checks a venue **exists** but not that it is active, because Tab 9 deliberately
  offers inactive ones; checking the flag would refuse exactly what the form invites.
- `mohallah_id` is kept on the table so existing rows survive, and is no longer collected.
- Both columns are added by `ensureSchema()` at boot **and** by a new section 4c of
  `MEMBERSHIP_LIVE_INSTALL.sql`. The script alone would not have been enough: production
  already has both tables, so `CREATE TABLE IF NOT EXISTS` skips them entirely.
- Fixed a test that was already failing on master: `ASHARA_GRID_YEAR_MIN` moved from 1405 to
  1404 in `fedb903` and the year-grid test was not updated with it. The code is the intent;
  the test now expects 1404.
- FR-049a and FR-077c added.


## 2026-11-05 — Changed: an Aqa Moula place can be entered for more than one year

Admin → Dropdown Lists → "Ashara with Aqa Moula" now accepts the same place name again, so a
place that hosted Ashara in several years gets one entry per year. The **year** stays unique:
two places for one year are still refused.

- `uq_aqa_moula_asharas_name` removed from the CREATE, and dropped where it exists by the
  backfill in `MEMBERSHIP_LIVE_INSTALL.sql` and at boot by `ensureSchema`. Dropping an index
  deletes no data.
- The other ten lists keep their unique names. FR-077c added.

## 2026-11-05 — Renamed: "Places Visited" is now "Maqamaat Muqaddasah"

Tab 8's name on the member profile, its section heading, and the matching list in Admin →
Dropdown Lists. Display text only: the tab id, API fields (`places`, `places_visited`) and
tables are unchanged, so no migration and no saved data affected.

## 2026-11-05 — Changed: Tab 9 is a year grid, and the Aqa Moula place follows the year

Tab 9 (Ashara Mubaraka) no longer asks the member to add records one at a time. Every Hijri
year from the current one down to 1405 AH is listed, newest first, and each is answered Not
attended, With Aqa Moula TUS or With Aamil with a single click.

- **With Aqa Moula TUS asks nothing more.** Aqa Moula TUS holds Ashara in one place a year, so
  each "Ashara with Aqa Moula" entry in Admin now has a **Hijri Year** (one place per year,
  enforced by a unique key). The grid shows that year's place; the server looks it up again on
  save and overrides whatever the client sent. A year with no place entered yet still saves and
  says so.
- **With Aamil** shows Moze and the optional Mohallah inline on that row. Changing the answer
  still clears the other answer's fields, on the client and on the server (FR-077a).
- **Saved data keeps its shape**: Not attended is simply no record, so existing records load
  into the grid unchanged. The server still accepts 1400 to 1404 AH; a record saved for one of
  those years appears as an extra row rather than vanishing.
- **Schema**: `aqa_moula_asharas.hijri_year` (nullable) and `uq_aqa_moula_asharas_year`, added by
  the backfill in `MEMBERSHIP_LIVE_INSTALL.sql` and at boot by `ensureSchema`. Additive only.
- FR-076b and FR-077b added.

## 2026-11-05 — Changed: Tab 3 offers inactive Hizbs, marked

The Party dropdown on the member profile returned only `is_active = 1` parties. It now returns
all of them, with inactive ones labelled `— INACTIVE` and sorted after the active ones.

On the live database that is **23 of 80 Hizbs** — 21 in City Saddar and 2 in Hyderi — which
were simply not offered to members.

- Hiding them had a failure mode beyond the obvious one. A member whose own Hizb had been
  deactivated would find their saved value missing from the list: the select renders blank and
  the save is refused with nothing on screen to explain it. That is the same silent shape as
  the save bug fixed on 2026-11-04.
- `GET /api/v1/members/lookups` now returns `is_active` on every party, so the form can mark
  them. Marking is half the requirement — an unmarked inactive Hizb reads as an ordinary
  choice and a member cannot tell it is no longer running.
- Zone filtering is unchanged: an inactive Hizb is still confined to its own Zone, and a test
  pins that it does not leak into another Zone's list.
- FR-048a added.


## 2026-11-05 — Applied to live: the Aqa Moula lookup migration

`MEMBERSHIP_LIVE_INSTALL.sql` run against production. The admin Dropdown Lists page and the
member profile form both work again.

- 34 tables now, up from 33. `aqa_moula_asharas` created with `utf8mb4_general_ci`, and
  `INFORMATION_SCHEMA` reports **0 collation deviations** across the whole database — the
  utf8mb3 default did not leak in.
- `member_ashara_attendances.aqa_moula_ashara_id` present and nullable, with its index and its
  `ON DELETE RESTRICT` foreign key.
- **All 13 pre-existing tables byte-for-byte unchanged** — the BEFORE and AFTER blocks diff
  clean, so FR-106 holds. Full backup taken first and verified complete.
- Re-run end to end against the already-migrated database: no errors, counts unchanged. The
  "safe to re-run" claim is now demonstrated rather than asserted.
- Fixed a stale verification query: `module_tables_present` still listed 20 table names and so
  reported 20 against a correct database. It was in `build_live_update.mjs`, not the SQL
  sources, which is why updating the schema's own count missed it. Both checks now read 21.


## 2026-11-05 — Fixed: the backend now creates the Aqa Moula lookup at boot

"Could not load the lists" on Admin → Member Dropdown Lists, and — less visibly but more
seriously — "Could not load your profile" for every member.

The backend was released with `aqa_moula_asharas` in both lookup registries before the
migration had been run against live, so two endpoints queried a table that did not exist:

- `GET /api/v1/member-lookups` (admin index) loops every entity and counts its rows, so ONE
  missing table took down all eleven lists.
- `GET /api/v1/members/lookups` (the member form) loops the same way, so the twelve-tab profile
  could not load at all.

Neither was a bug in the new feature. The code was simply ahead of its own schema.

- `ensureSchema()` now creates `aqa_moula_asharas` and adds
  `member_ashara_attendances.aqa_moula_ashara_id` with its index and foreign key, each only if
  absent. It already ran at boot for three other columns; this is the same mechanism. The code
  can no longer be ahead of its schema, whichever order the deploy happens in.
- It does the same work as section 4b of `MEMBERSHIP_LIVE_INSTALL.sql` and is idempotent in the
  same way, so whichever runs first makes the other a no-op. Running the install script is
  still the right thing to do — it is what keeps a fresh database correct — but it is no longer
  the only thing standing between a deploy and a broken admin page.
- `COLLATE=utf8mb4_general_ci` is stated explicitly. The live database defaults to
  `utf8mb3_general_ci`, so a table created without it would inherit the wrong collation and
  fail every join.
- The column is added only when `member_ashara_attendances` already exists, so a database
  without the membership module is left alone.


## 2026-11-05 — Fixed: the build broke on the new Ashara field

`npm run build` failed with five TS2741 errors: Tab 9's older test fixtures still built
`ashara_attendances` literals without `aqa_moula_ashara_id`, which the previous change made
required.

The reason it was not caught before the push is worth recording. `frontend/tsconfig.json` is a
solution-style config — `"files": []` plus two project references — so **`tsc --noEmit` against
it checks nothing and exits 0**. The real check is `tsc -b`, which is what `npm run build` runs.
Every "typecheck clean" claimed for the frontend before this entry was vacuous.

- The five fixtures now carry `aqa_moula_ashara_id: null`.
- Added `npm run typecheck` (`tsc -b`) so the honest check has a name and nobody has to
  remember that `--noEmit` is the wrong one here.
- `backend/tsconfig.json` has the same shape of blind spot for a different reason: it
  `exclude`s `src/__tests__`, so `tsc` there has never covered the test files. Vitest
  transpiles without typechecking them. Left as it is — it is pre-existing and no test file is
  currently broken by it — but it is now written down rather than assumed.


## 2026-11-05 — Added: "Ashara with Aqa Moula" master dropdown

An eleventh lookup list, maintained in Admin → Member Dropdown Lists alongside the other ten.
It names where Aqa Moula TUS held Ashara Mubaraka in a given year.

**It is deliberately separate from Mozes.** A Moze is where the member's own Jamaat is, which
answers "where did you attend with your Aamil". Where Aqa Moula held Ashara that year is a
different question with a much shorter list of answers. One list could not serve both without
offering every member's city as somewhere Aqa Moula had been.

- **Tab 9 now swaps its location fields to match the answer** (FR-077a). "With Aqa Moula TUS"
  shows the new dropdown and hides Moze and Mohallah; "With Aamil" shows Moze and the optional
  Mohallah and hides the new one. Changing the answer clears the fields the other answer owns —
  on the client *and* again on the server, so a value cannot survive in a field the form no
  longer shows and nobody could then correct.
- The empty-list warning follows the list a record on screen actually needs, rather than
  warning about both.
- `aqa_moula_asharas` ships **empty**, like the other five domain lists. Filling it would mean
  stating a religious calendar the organisation has not confirmed. The Dropdown Lists page
  already flags an empty list, and Tab 9 explains itself rather than appearing broken.
- `member_ashara_attendances.aqa_moula_ashara_id` is a new nullable column with `ON DELETE
  RESTRICT`, matching `moze_id`: a value still in use cannot be deleted out from under a
  member's record.
- `MEMBERSHIP_LIVE_INSTALL.sql` regenerated — **21 tables now, not 20**. It carries a new
  backfill (section 4b) for the same reason section 3b exists: production already has
  `member_ashara_attendances`, so `CREATE TABLE IF NOT EXISTS` skips it entirely, column and
  all. Without the backfill the script would report success while leaving the database missing
  the column the application reads. Column, index and foreign key are each added only if
  absent, so it stays safe to re-run.
- FR-077 amended to say Moze and Mohallah are the With Aamil case only; FR-077a added.


## 2026-11-05 — Changed: profile tabs show only their heading

The tab strip printed the position in front of each label — `1 Personal`, `3 Hizb`. The tabs
now show the heading alone.

- The number was decoration that also leaked into the accessible name, so a screen reader
  announced "1 Personal" and an exact-string `getByRole("tab", { name: "Personal" })` could
  not match. The Tabs test now asserts the number's absence rather than its presence.
- The Members page told administrators that contact numbers are on "Tab 1 Personal" and Zone
  and Party on "Tab 3 Hizb". Those numbers are no longer on screen for the member to find, so
  that sentence now names the tabs — the **Personal** tab and the **Hizb** tab.
- Nothing else depended on the number. The server still reports a tab number with each
  validation error and the page still opens the right tab from it; that mapping is internal
  and was never shown.


## 2026-11-04 — Changed: five profile year fields are now Hijri, not Gregorian

Prefix Year, Title Year, Sharaf Year, Place Visited Year and the Other Sansta "Since" year
offered Gregorian 1950–2026. They are Hijri years. They now run from **1401 AH to the current
Hijri year**, and each label says `(AH)`.

This was a silent fault, not a visible one: a Hijri year sits inside 1950–2026 as comfortably
as a Gregorian one, so whichever the member picked was stored without complaint and the column
could hold both calendars at once.

- The ceiling is `lookups.current_hijri_year`, computed on the server, so the list extends
  itself at each Hijri new year and a browser with a wrong clock cannot widen it. The old
  bounds were a hard-coded `2026` and, on two tabs, `new Date().getFullYear()`.
- The server enforces the same window through one shared `hijriYearError` helper, so the five
  fields cannot drift apart. It replaces three different rules that had grown up separately:
  1950–2026 for prefix and title years, and 1900–2100 for sharaf and visit years.
- **`khidmat_since_year` was removed from the Gregorian birth-year check.** It had been
  compared against the member's Gregorian year of birth; now that it is Hijri, `1447 < 2006`
  would have rejected every valid value with a message about their date of birth.
  `occupation_since_year` is still Gregorian and keeps that check.
- Tab 9's Ashara year is unchanged — it was always Hijri, with its own floor of 1400 AH that
  FR-076 names explicitly.
- `database/convert_profile_years_to_hijri.sql` converts values already stored in the wrong
  calendar, using the mid-year approximation checked against the application's own converter.
  Applied to live: `prefix_year` 2006 → 1427 and a `title_year` 2005 → 1426. It is safe to
  re-run — a converted value is never converted twice — so run it on any other environment.
- FR-044, FR-046, FR-068, FR-072 and FR-087 amended, each recording its previous wording.


## 2026-11-04 — Fixed: only the first two profile saves in a session were accepted

A member could select their Zone and Party, press Save Profile, and have nothing reach the
database — while the form went on showing the selections, so the loss was invisible until an
administrator looked at the Members list and saw a dash.

The profile form sends `if_unmodified_since` so a concurrent edit is reported rather than
silently overwritten. After a successful save the page cleared the draft but **not** the
version stamp it was based on, and the effect that seeds that stamp only runs while it is
null — so every later save in the same page session still carried the version from the
original read. The server compared it against its own completed write, concluded another
session had edited the profile, and answered 409.

The first save was always correct, which is why this went unnoticed: it only bites from the
second save onwards, and a page reload reset it. The live profile shows exactly the
signature — two saves landed (01:41:03, 01:43:17) and Tab 3 never did.

- `onSave` now re-bases on the `updated_at` the save itself returned. The response is the
  saved profile, so this costs no extra request and cannot race a refetch.
- Two regression tests, both verified to fail without the fix: one asserts the **second**
  save's `if_unmodified_since` is the version the first save returned, the other reproduces
  the member's actual path — save Tab 1, then choose a Zone and Party on Tab 3 and save again.
- The profile test's PUT stub now returns a fresh `updated_at` per save, as the real server
  does. Echoing the original hid this entire class of bug.


## 2026-11-04 — Added: Admin and Zonal Head can create a member account

Both roles can now add a member from three fields — ITS No, Full Name, Password — instead of
only through a roster CSV under Import/Export.

- `POST /api/v1/members` creates one account. ITS number must be 6–20 digits (the same rule
  the import route applies), the name is stored on `member_accounts.member_name`, and the
  password goes through `validateMemberPassword` — the member policy (FR-020, FR-021) — then
  bcrypt at cost 10. `must_change_password = 1` and `password_changed_at = NULL`, so a
  provisioned password is a one-time credential however it was issued (FR-004, FR-005). A
  duplicate ITS number is a 409 naming the number, not a silent update.
- `/api/v1/members` is no longer admin-only. It now accepts `admin` and `zonal_head`, and a
  Zonal Head is **scoped to their own zone** on the list, the photo endpoint and the
  activate/deactivate toggle. The toggle reads the member's zone *before* writing, so a
  refusal cannot be preceded by an update. A `zonal_head` token carrying no usable `zoneId` is
  refused rather than falling through to an unscoped query.
- The Members page is shared by both roles, with the `Add member` form collapsed by default.
  The password can be revealed, because a typo there cannot be corrected from this page — the
  member simply cannot sign in. A confirm field would only prove the same typo twice.

**A Zonal Head cannot see the account they just created.** Zone lives on `member_profiles`,
which does not exist until the member fills Tab 2, so a new account is in no zone. The chosen
design records no zone at creation, which leaves this gap; the alternative — showing every
zone-less account to every Zonal Head — would leak one zone's new members into another's list.
The form and the empty state both say so plainly rather than leaving it to be discovered, and
a test pins it so that making creation set a zone has to be a deliberate rewrite. Recording a
provisioning zone on `member_accounts` would close it with one nullable column.

## 2026-11-04 — Fixed: the test suite can no longer run against a live database

`npm test` in `backend/` writes. `ensureFixtures` inserts into `admins`, `zones`, `mohallahs`,
`venues`, `parties`, `miqaats`, `schedules` and `member_accounts`; teardown then deletes by
marker, and `clearMemberLoginAttempts` deletes every row whose ITS number starts with `999`.
Nothing distinguished a local database from production: both come from `DB_HOST` in the same
`.env` the application uses, so pointing the app at live pointed the tests there too.

This was not hypothetical — it happened while applying the membership module. The suite was
run with `.env` holding live credentials and created fixture rows in seven production tables.
Teardown removed them and the 13 pre-existing tables returned to their exact baseline counts,
so nothing persisted; but survival depended on teardown completing, which is luck, not a
safeguard.

`src/__tests__/globalSetup.ts` now refuses to run unless `DB_HOST` is local, printing which
host and database it declined and why. The check runs before any statement is sent. Override
with `MPSS_ALLOW_REMOTE_TEST_DB=1` for a genuinely disposable remote database.

## 2026-11-04 — Changed: `database/` reorganised so one file is obviously the one to run

Asked which script to run against live, because the folder held several. It held eleven files,
exactly one of which should ever reach production — and the four most similar names differed by
a single word: `membership_live_update.sql`, `membership_schema.sql`, `membership_seed.sql`,
`membership_rollback.sql`. One installs, one destroys all member data, two are sources that
should never be run directly. That is a hazard, not a naming preference.

No SQL changed. The script applied to a scratch database still produces a schema identical to
the working development database — 192 columns, 70 index columns — verified again after the
move.

- The one file to run is now **`database/MEMBERSHIP_LIVE_INSTALL.sql`**. Uppercase, names the
  action, and sorts to the top of a directory listing. Its header now opens by saying it is the
  only file to run and what each other file is for.
- `database/sources/` holds the two maintained sources, `membership_schema.sql` and
  `membership_seed.sql`, away from the generated output so they cannot be mistaken for it.
- `database/already-applied/` holds the four `add_*.sql` scripts and the superseded
  `membership_schema_update_photo_approval.sql`. These were applied to live long ago — party
  sign-in by ITS Number depends on them and is live, and all 11 of their columns are present —
  so they are history, not pending work. Re-running one now fails with error 1060, since
  `ADD COLUMN` has no `IF NOT EXISTS` in MySQL.
- **`database/README.md`** is new and answers "which file do I run?" in its first line, then
  explains every other file and why it is not the one. `DATABASE.md` points at it.
- `mpss_mysql.sql` stays where it is, now documented as never to be run against live: it resets
  the admin password and declares a collation the real database does not use.

Moves were made with `git mv`, so history follows the files. Live references were updated —
generator, guard test, `DATABASE.md`, `quickstart.md`, the local-dev docs, and the markdown
links in `plan.md` and `tasks.md` that would otherwise have 404'd. Dated CHANGELOG entries and
PHRs were left alone: they record what was true when written.

## 2026-11-04 — Changed: the migration script now matches the running schema

Branch `001-membership-module`. Prepares the membership module for its live apply. No
application code changed; this is the migration script, its seed, and the tests that guard
them.

The script was verified by applying it to a scratch database holding only the 13 pre-existing
tables, then diffing the result against the working development database. It now reproduces it
exactly: **192 columns, 70 index columns, 22 foreign keys and 87 lookup values, all
identical.** Before these changes that diff showed five missing columns, two missing indexes
and six wrong lookup values.

### Fixed: the script created `member_photos` without the approval columns

The photo approval workflow was added to the development database with a standalone
`ALTER TABLE` (`database/membership_schema_update_photo_approval.sql`) and the migration script
was never updated to match. `membership_live_update.sql` would therefore have created a
`member_photos` with no `approval_status`, `approved_by`, `approved_by_role`, `approved_at` or
`rejection_reason`, and every photo approval query on production would have failed with error
1054, unknown column.

`node database/build_live_update.mjs --check` did not catch this: it compares the generated
file against its two sources, and both sources were equally out of date.

- The five columns and their two indexes are now declared in the `member_photos`
  `CREATE TABLE`, in the same column positions the development database has.
- A conditional backfill (`mm_backfill_photo_approval`) adds them to a database that created
  the table before they existed. `CREATE TABLE IF NOT EXISTS` skips an existing table
  entirely, columns and all, so without this a re-run would silently leave such a database
  five columns short while reporting success.
- A new test asserts both, so the next schema change to this table cannot drift the same way.

### Changed: all ten lookup lists ship populated and reviewed

Five lists previously shipped empty because seeding them would have meant inventing Dawoodi
Bohra religious and organisational terms. Those values have since been supplied through the
Member Lists admin screen, so the seed now carries them and a live apply gets the same lists
the module has been used with: `titles` (2), `sharafs` (3), `halqas` (2), `mozes` (5),
`places` (5). This closes **T018**.

`tamreen_methods` changed in substance, not just in flag: the seven values this file once
proposed were **not** adopted. The four real ones are `Self`, `With Party`, `With an Ustad`
and `SatulIman`. Because the unique key is on the name, inserting the four could not have
displaced the seven — a database that received the earlier seed would have offered members all
eleven. Section 4b of the seed deactivates the six rejected names with `is_active = 0` rather
than deleting them, so they leave the pickers while any profile that referenced one stays
readable.

Every seeded value now ships `is_draft = 0`, and `is_draft` is written on conflict. That
reverses an earlier, deliberate choice not to touch the flag — correct while the file shipped
drafts, since writing it could only ever re-flag something a human had approved. Now that
every value ships reviewed, writing it can only ever *clear* the flag, and not writing it
caused the bug it was meant to prevent: a value in both lists, such as `With an Ustad`, would
have kept `is_draft = 1` forever and gone on displaying `DRAFT — NEEDS REVIEW`.

### Changed: the additive-only test now asserts the actual rule

It asserted that `membership_schema.sql` contains no `ALTER`, `UPDATE`, `DELETE` or
`TRUNCATE` at all — a convenient proxy for FR-106 while that happened to be true, and no
longer true now the schema backfills a column and the seed deactivates six values. Both target
tables this module owns, which FR-106 has nothing to say about: it governs the 13 tables that
were here first.

The proxy is replaced by the rule itself, which is also stricter: every mutating statement in
either source is parsed for its target table, and that target must be one of the 20 module
tables and must not be one of the 13 pre-existing ones.

### Verified

- Fresh apply to a scratch database, then re-apply: identical counts, no errors, no leftover
  stored procedures.
- Upgrade path: a database regressed to the old shape (approval columns dropped, old seven
  `tamreen_methods` restored) is healed by one run — 5 columns and 2 indexes restored, the four
  adopted methods active and reviewed, the six rejected ones deactivated.
- `membership_rollback.sql` against the updated schema: 33 tables down to the 13 pre-existing,
  no membership table or procedure left behind.
- 461 backend tests, 175 frontend tests, both typechecks clean, both builds clean.

## 2026-10-30 — Membership module: member login and the twelve-tab member profile

Branch `001-membership-module`. **Not yet released to production.** Specification, plan,
tasks, data model and migration scripts are under `specs/001-membership-module/`.

### Added

A fifth role, `member`, signing in with an ITS Number and a password, reaching exactly one
thing: their own profile. Accounts are provisioned by an admin from a roster through the
existing CSV import path; the first sign-in forces a password change before the profile is
reachable.

The profile is one responsive page of twelve tabs — Personal, Title & Prefix, Hizb,
Occupation, Education/Hifz, Health & Fitness, Sharaf, Places Visited, Ashara Mubaraka, Asbaq,
Tamreen, Other Sansta Khidmat — saved in one transaction.

New endpoints under `/api/v1/members`: profile read and save, photo get/put/delete, a single
lookups response, and admin account listing and activation. See `API_DOCUMENTATION.md`.

**Twenty new database tables, nothing altered or dropped.** `zones`, `parties` and
`mohallahs` are reused as they are. The scripts are `database/membership_schema.sql`,
`database/membership_seed.sql` and `database/membership_rollback.sql`; none of it runs through
`ensureSchema.ts`. See `DATABASE.md` for the table list and the two conventions that are easy
to get wrong (explicit `utf8mb4_general_ci` on every table, and `bmi` being a generated
column that rejects writes).

### Added: admin maintenance of the member dropdown lists

**Member Lists** in the admin navigation (`/member-lookups`), backed by
`/api/v1/member-lookups`. All ten lookup lists the member profile depends on — Titles, Sharaf,
Halqas, Mozes, Places Visited, Hifz Sanads, Marital Statuses, Tamreen Frequencies, Tamreen
Methods, Skills — with add, edit, reorder, activate/deactivate, and a one-click "mark reviewed"
that clears the `DRAFT — NEEDS REVIEW` warning members see on seeded starter values.

This is what closes the gap that five lists shipped empty: the values can now be entered by
someone who knows them, with no developer and no SQL.

**Deleting a value in use is refused**, for all ten lists, with a message saying how many
member records use it and to deactivate instead. This does not delegate to the database on
purpose: five of the ten foreign keys are `ON DELETE SET NULL`, so for half of these lists the
database would have allowed the delete and silently blanked that answer on every member who had
chosen it. The UI withholds the Delete button entirely for a value in use, rather than offering
an action that will fail.

### Security

- **Login throttling, which did not previously exist anywhere.** Applied to the member role
  **only**: 5 failed attempts per account and 20 per IP in a 15-minute window, counted
  independently so a shared connection cannot lock out an account and one account cannot lock
  out a shared connection. Client IPs are stored as salted SHA-256 hashes, never in the clear.
  The four existing roles' login path is unchanged.
- **A password policy, also member-only.** The existing roles have no policy today and
  imposing one as a side effect of this module would be a change nobody asked for.
- Changing a member's password invalidates every token minted before it, including refresh
  tokens, and returns a fresh pair so the member is not signed out mid-flow. The access token
  carries a `pwdAt` claim compared for equality, because `iat` and `password_changed_at` are
  both second-resolution and an ordering comparison lets a token minted in the same second
  survive the change.
- Member photos are stored in the database and served only through an authenticated endpoint
  marked `Cache-Control: private`. Uploads are validated on magic bytes rather than the
  declared content type, and capped at 2MB.
- Health values and photographs appear in no export, no error message and no log line. The
  backend contains no `console.*` call outside its tests, and a test now asserts that.
- Text and numeric inputs are bounded to their storage widths, so an over-long value is a
  named field error rather than a database failure returned as a generic 500.

### Fixed: a disallowed CORS origin returned 500

A browser calling from an origin outside the allow-list hit
`callback(new Error("CORS_NOT_ALLOWED"))`, which `cors` hands to Express, which routed it to the
terminal handler as **"Internal server error"**. Wrong twice: nothing had failed on the server,
and the message gave nobody a way to fix it. It now returns 403, naming the origin and the
variable to add it to.

`http://127.0.0.1:5173` added to the default allow-list alongside `http://localhost:5173`. A
browser treats them as different origins and Vite serves both.

Why this was hard to find: curl sends no `Origin` header, so the check never fired and the
endpoint looked healthy from the command line. And a browser sends `Origin` on a POST even
same-origin, but not on a same-origin GET — so pages loaded fine and only *signing in* failed,
which presented as an authentication bug.

The CORS options and the terminal error handler moved from inline in `server.ts` to
`middleware/httpBoundary.ts`. They were the only middleware with no tests, because `server.ts`
binds a port at module scope and cannot be imported from a test. Both are now covered.

### Added: traceable 500s

Every HTTP 500 now carries a short reference (`data.ref`, and in the message), with exactly one
matching stderr line: the reference, method, path, driver error code and error class. Nothing
more — no message, no SQL, no stack, no request body, because a `mysql2` error carries the
values it was writing and those can include health data.

This replaced a bare `"Internal server error"` that two unrelated faults produced identically,
which made a real user report untraceable. Asking for the reference now identifies the exact
failure; `ER_NO_SUCH_TABLE` on a named route, for instance, is a complete diagnosis.

`requireMember` no longer answers its own 500 — it hands the error to the terminal handler, so
there is one path and one format.

### Changed

- `POST /api/v1/auth/login` accepts `role: "member"`. The member branch sits **above** the
  unguarded venue/coordinator fallthrough in `authenticate()`, so it cannot affect the four
  existing roles.
- `POST /api/v1/auth/change-password` accepts the member role, with its own branch.
- The login page has a Member option. Party login is untouched.
- `POST /api/v1/auth/refresh` is now actually called: the frontend gained a 401
  refresh-and-retry interceptor. It existed on the server but no client ever used it, so a
  session long enough to fill in twelve tabs could expire mid-save and strand unsaved work
  behind a login screen.

### Tests

**The project previously had no test runner and no tests at all.** This branch adds Vitest to
both packages, 16 backend suites and 10 frontend suites. The backend suites include a
regression net for the four existing roles' sign-in and password paths, written and verified
*before* the member branch was added, so "Party login still works exactly as it does now" is
a checked claim rather than an assertion.

### Added: one script for the live database update

`database/membership_live_update.sql` — a single self-contained script for applying the module
to a live database, generated from `membership_schema.sql` and `membership_seed.sql` by
`node database/build_live_update.mjs`. It carries each source's SHA-256 and a test fails if it
drifts, so the convenience of one file does not create a second source of truth.

What it adds over running the two sources by hand:

- **It refuses to run against the wrong database.** Aborts with SQLSTATE 45000 unless `parties` and `zones` exist, before creating anything. Verified: run against an empty schema it exits non-zero and creates nothing.
- **BEFORE and AFTER row counts** of all 13 existing tables in one output, so "nothing existing changed" is something the operator reads rather than takes on trust.
- Collation, generated-column and empty-lookup checks at the end.
- Idempotent, and it reports how many module tables were already present, so an interrupted run can be repeated and resumed.

Rehearsed on a throwaway database restored from a production copy and rolled back to the
pre-module state: clean install, a second run, and the wrong-database guard. Every BEFORE
figure matched its AFTER.

Also corrected: the three scripts' headers still said
`*** DRAFT — NOT EXECUTED. DO NOT RUN AGAINST PRODUCTION. ***` and that they lived under
`specs/`. Both stale since the scripts were approved, moved and rehearsed — and actively
misleading to anyone opening the file to run it.

### Release note: the committed backend build artifact

`backend/dist` is a **committed** build artifact and `npm start` runs `node dist/server.js`,
so whatever is in `dist` at deploy time is what production runs. It has been rebuilt on this
branch (`cd backend && npm run build`). Without that rebuild the deploy would have shipped the
previous build and the membership module would have been **entirely absent from production** —
the login page offering Member while every `/api/v1/members` route returned 404.

Verified by running `node dist/server.js` and confirming `/api/v1/members/lookups` answers 401
rather than 404. `frontend/dist` needs no equivalent step: it is gitignored and built by Vercel.

Still unconfirmed: whether Render's build command runs `npm run build`. If it does, the commit
is belt-and-braces; if it does not, it is the difference between a release and a silent no-op.

### Outstanding before release

- The spec's 18 assumptions need sign-off; items 5 to 18 are proposals.
- ~~Five lookups — `titles`, `sharafs`, `halqas`, `mozes`, `places` — ship **empty**.~~
  **Resolved 2026-11-04.** All ten lookup lists are now seeded with reviewed values; see
  "Changed: the migration script now matches the running schema" below.
- ~~Everything seeded except `sanads` is marked `is_draft = 1`.~~ **Resolved 2026-11-04** —
  every seeded value now ships `is_draft = 0`. The flag still governs values an admin adds
  later, which default to `1` and display as `DRAFT — NEEDS REVIEW` until signed off.
- `GET /api/v1/import-export/database-backup` builds its whole dump as one in-memory string,
  and `mysql.escape` renders a BLOB as hex, roughly doubling it. With photo blobs in the
  database this scales badly; it should stream. Not changed in this branch.

### Decided

- **Member data retention: deactivate and retain indefinitely.** A departed member's account
  is deactivated and all profile data is kept, with no automatic purge. The privacy cost of
  holding health data with no end date is accepted knowingly; the alternative risks losing a
  record nobody knew was needed, and is not reversible. Deletion on request is a manual
  database operation today. See `BUSINESS_RULES.md`.
- **The admin database backup is authorised to contain everything** (FR-101a), including
  health values and photographs. A backup that omits tables cannot restore the system. FR-101
  continues to apply in full to the CSV entity exports and to reports.

## 2026-09-17 — Fixed `.env` lookup depending on the working directory

Follow-up to the 2026-09-13 credential change.

`dotenv.config()` resolves `.env` against `process.cwd()`, so starting the backend from
the repository root (rather than from `backend/`) found no file and aborted with
`Missing required environment variable(s): ...` even though `backend/.env` was present
and complete. The old hardcoded fallbacks had masked this; removing them exposed it.

- `backend/src/config/env.ts` now resolves `backend/.env` from the module's own location
  (`__dirname/../..`, which is the backend package root for both `src/` under tsx and the
  compiled `dist/`), so the load no longer depends on where the process was started.
- Real environment variables still take precedence — dotenv does not overwrite values
  already present in `process.env`, so deployed configuration is unaffected.
- The startup error now names the exact path that was checked and whether a file was found.

Verified loading from the repository root, `backend/`, an unrelated directory and a
different drive root; and verified that a genuinely missing `.env` still aborts startup.
`npm run dev:backend` was already unaffected, as `npm run --prefix backend` changes the
working directory.

## 2026-09-13 — Removed hardcoded credentials from source

### Security
Resolved the finding recorded as item 3 in the 2026-09-12 baseline below.

`backend/src/config/env.ts` previously supplied the live database host, name, user and
password, plus a `change_me` JWT secret, as fallback defaults. Any checkout of the
repository exposed working production credentials, and an unset `JWT_SECRET` in a
deployed environment would have signed tokens with a publicly known value.

Changes:
- `requireEnv` no longer accepts a fallback. `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`
  and `JWT_SECRET` are mandatory; startup aborts listing every missing variable at once.
- Non-secret settings (`PORT`, `DB_PORT`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN_DAYS`,
  `CORS_ALLOWED_ORIGINS`) keep their previous defaults via a separate `optionalEnv` helper,
  so effective behaviour is unchanged when the variables are set.
- Startup rejects known placeholder JWT secrets and warns when the secret is under 32 characters.
- Added `backend/.env.example` documenting every variable. `backend/.env` stays gitignored.
- 14 `tmp_*.js` debug scripts embedded their own copies of the credentials; they now read
  `env.db.*` from `./dist/config/env`, matching the scripts that already did so.
- Rebuilt `backend/dist` so the committed build no longer carries the values.
- Redacted the database host from `debug-schedule-duplicates.md`.

### Required follow-up (not performed here)
1. **Rotate the database password and the admin account password.** The old values remain
   in Git history and must be assumed compromised.
2. **Set the five required variables in the backend hosting environment before the next
   deploy.** The service will not start without them.
3. Setting a new `JWT_SECRET` invalidates all issued access tokens; every user must log in
   again. The frontend does not refresh tokens automatically, so this surfaces as a forced logout.

## 2026-09-12 — Claude Code Context Baseline

Created a Claude-oriented project context based on the supplied Trae AI project.

### Current Stack
- React 18 + TypeScript + Vite
- Redux Toolkit
- React Router
- Tailwind CSS
- Node.js + Express + TypeScript
- MySQL2
- JWT + bcryptjs

### Current Domains
- Authentication
- Zones
- Mohallahs
- Parties
- Venues
- Miqaats
- Schedules
- Reports
- Ratings
- Import/Export

### Existing Documentation
The project already contains developer, process, UI/UX and user documentation under `Documentation/`.

### Important Existing Work
The repository contains substantial scheduling logic and historical debugging artifacts around duplicate assignments/schedule generation. Preserve these when working on scheduling.

### Known Technical Findings
1. Current source uses MySQL2 directly, while older documentation mentions Prisma.
2. `ensureSchema.ts` can alter selected database columns during startup.
3. Environment configuration contains fallback credential/secret values in source; this is a security risk and should be addressed deliberately.
4. Generated `dist` directories are present; source under `src` should be treated as the editable source.
5. Temporary/debug scripts are present under the backend and should not be removed without checking their purpose.

### Migration Rule

This baseline documents the existing system. It does not authorize fixes to the above issues. Fixes must be separately requested/planned and tested.
