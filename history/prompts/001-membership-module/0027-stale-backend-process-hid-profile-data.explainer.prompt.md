---
id: 0027
title: Stale Backend Process Hid Profile Data
stage: explainer
date: 2026-11-02
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["members", "admin-panel", "debugging", "stale-build", "dev-environment"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - (none modified — diagnosis only; code from PHR 0026 is correct as written)
tests:
 - live DB query reproducing the route SQL (returns all fields correctly)
 - dist module smoke-load (loads clean, contains both joins)
---

## Prompt

in Admin Panel-> Members, list should be Picture, ITS No,  full name (First Prefix, Name, Father Name, Surname), Zone, Party, Whatsapp No. Mobile No.
Data already save by member but its still show like this in admin panel members page
[screenshot: row shows avatar "4", ITS 40480241, name "Fakhruddin", and em dashes for Zone, Party, WhatsApp No. and Mobile No.]

## Response snapshot

Not a code defect. The data is in the database and the query returns it; the running backend
process is executing a build made before the change.

Evidence gathered:
1. Database holds complete data — `member_accounts` id 870 (ITS 40480241), `member_profiles`
   id 527 with first_prefix "Mulla", name "Fakhruddin", father_name "Shabbir Hussain",
   surname "Kaukawala", zone_id 1, party_id 20, whatsapp_no_1 and mobile_no_1 "03351525152".
   `member_photos` id 141 exists and is `approved`.
2. Running the route's exact SQL against that live database returns every field, including
   zone_name "City Saddar" and party_name "Hizbe Emadi". The query is correct.
3. The backend runs `node dist/server.js` (the `start` script), NOT `tsx watch`. Source edits
   therefore require `npm run build` followed by a real restart.
4. `dist/` was rebuilt at 14:59:25. The process serving port 4000 (PID 5288) started at
   12:18:28 — 2h41m earlier. Node resolves and caches modules at require time and never
   re-reads them, so that process cannot be running the current code.
5. A second `node dist/server.js` (PID 31684) was started at 14:51:41 — the user's own restart
   attempt. `Get-NetTCPConnection -LocalPort 4000` shows port 4000 still owned by PID 5288, so
   the newer instance failed to bind (EADDRINUSE) and sat idle. The restart silently did nothing.
6. The fresh `dist/routes/memberAdminRoutes.js` smoke-loads cleanly and contains both
   `LEFT JOIN zones` and `LEFT JOIN parties`.

The frontend is NOT stale — it runs under Vite with HMR, which is why the screenshot already
shows the new Zone and Party column headers while the cells are empty. New columns, old API.

Could not complete the restart: `Stop-Process` was denied by the auto-mode permission
classifier ("Interfere With Workloads"), so the user must restart the backend themselves.

## Outcome

- ✅ Impact: Root cause identified as a stale serving process plus a silently failed restart, not a defect in the Zone/Party change.
- 🧪 Tests: Route SQL verified against the live database (all fields resolve). Compiled module verified to load and to contain both joins. No test changes needed.
- 📁 Files: None modified.
- 🔁 Next prompts: Restart the backend (kill BOTH node processes holding/attempting port 4000, then `npm run build && npm start`). Consider using `npm run dev` locally so source changes take effect without a manual build.
- 🧠 Reflection: The symptom pointed at the new columns, but the empty name/photo/phone cells — fields that predate this change — were the tell that the whole profile join was absent, which a code defect in the new joins could not explain. Checking process start time against build time settled it without guesswork.

## Evaluation notes (flywheel)

- Failure modes observed: A failed restart that produces no visible error is indistinguishable from a successful one; the orphaned second process is the only trace. Worth checking port ownership whenever "my change didn't take effect".
- Graders run and results (PASS/FAIL): live SQL reproduction PASS, dist content check PASS, dist module load PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Have the `start` script fail loudly on EADDRINUSE, or print the build timestamp at boot so a stale process is obvious in the log.
