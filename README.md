# Global Era TaskMS V2 — Multiple Business Operations

**Current upgrade:** Multi-business workspace layout, SQL unit isolation, backend authorization, project milestones, staff task checklists, evidence HTTPS links, calendar, recurring tasks (pg_cron daily 01:00 UTC = 06:45 Nepal), unit member management, roles, task lifecycle / notes / reviews / notices / follow-ups / reports.

**Production resources:** Private GitHub `globalgemss/globalera-taskms`, Supabase TaskMS project `usmpjxbhrxlmlrxfnhhh` ONLY, Vercel `globalera-taskms.vercel.app`. **NEVER** apply migration to RikshaMS.

## Deployment order (required)
1. SQL migrations 001,002,003 already live before this upgrade. Run `202610080004_v2_business_units.sql` and `202610080005_v2_recurring_scheduler.sql` in order. Both additive; old records get default Training workspace.
2. Deploy `task-api` with JWT verification enabled; deploy `staff-auth` with JWT disabled due to its separate token+PIN gate. Set `ACCESS_LINK_SECRET` server-only where possible.
3. Deploy React/Vite from GitHub through Vercel, with existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Check deployed site and fresh login.
4. Test Admin create staff, generate QR/PIN, staff login, assign task, progress, checklist, evidence link, submit for review, manager approval, multi-unit isolation and recurring cron.

## V2 security boundaries
- Global Admin can see all 5 seeded units; other users only access units in their active `unit_memberships`. Unit roles: `unit_admin`, `manager`, `staff`, `viewer`.
- Row Level Security controls projects, tasks, departments, teams, notices, profiles and new tables. Direct authenticated client mutations remain prohibited; mutations pass through `task-api`.
- Existing Admin/Manager/Staff account role lives in `profiles.role` for backward compatibility. V2 unit role governs unit management *inside the API*; Global Admin handles user provisioning. Unit-scoped user provisioning and detailed custom permission editor are still future work.
- Staff QR uses a server-only secret; refresh token revocation and temporary credential sessions are **not production-verified**. Disable public user signup in Supabase Auth settings; use MFA/leaked-password protection where available.
- `task_evidence` stores safe HTTPS document links, **not uploaded binary attachments**. A secure Storage bucket, signed uploads/downloads and antivirus scanning are not yet implemented.
- Recurring daily scheduling uses `pg_cron` on the new project. Admin may also run due rules manually; duplicate protection uses unique `(rule_id,run_date)` ledger. Check `cron.job_run_details` to verify next scheduled execution.
- Client screens query max 300 recent rows. Add pagination / cursor and full-table aggregates before scaling beyond that.
- Last-mile e2e tests require real logged-in account/Staff QR and a working browser. Deployment READY alone is not proof those workflows passed.

## Test plan
- Admin: all-unit switcher, create unit, assign user to Unit, project & milestone, task, notice, recurring rule; CSV report.
- Manager: own-unit task assignment and review; cannot read or assign other unit IDs.
- Staff: QR/PIN, own unit tasks, checklist & progress, evidence HTTPS, note, follow-up, review submission; deny cross-unit operations.
- Scheduling: manually create Daily rule (future date), verify cron at 06:45 Nepal and exactly one task generated.
- Security: no cross-unit read with forged requests or guessed IDs; inactive unit membership/QR blocked; public signup disabled; verify refresh revocation scenario separately.

---

## V1.1 live user onboarding and Admin setup

- The bootstrap Admin account is `globaleramultiservice@gmail.com` in the NEW `GlobalEra-TaskMS` project. Its `public.profiles.role` is now `admin`; password remains managed by Supabase Auth.
- Add a staff member from Admin → Team & Users → Add User. Staff email is optional: an internal, non-deliverable Auth identity (`@example.invalid`) is generated when missing. Staff signs in exclusively using personal QR URL and a 4-digit PIN.
- Admin/Manager accounts require actual email and receive a one-time generated password. Share secrets separately from QR.
- HMAC signing uses `ACCESS_LINK_SECRET` when configured. For immediate onboarding on freshly deployed Supabase projects, the hosted service-role key is used as a server-only fallback. Configure a dedicated `ACCESS_LINK_SECRET` later with care: changing HMAC secret invalidates existing QR links until they are regenerated.
- Apply migration `supabase/migrations/202610080003_user_profile_upgrade.sql` (address/joining date) and deploy updated `task-api`, `staff-auth`, and `_shared/core.ts`.
- QR/PIN and user creation MUST be tested with a real staff account before launch; Auth email validation and refresh session invalidation depend on live service configuration.

# Global Era TaskMS — React + Supabase V1

A dedicated Task Management System for Global Era: **Admin / Manager / Staff**, secure Staff **QR + 4-digit PIN**, task assignments, projects, follow-ups, notes, timelines, reviews, notices, user management, profile notes/timeline, reports and notifications.

> **IMPORTANT:** This is the new `globalera-taskms` project, **NOT** your existing RikshaMS Supabase project. Never apply its SQL to the RikshaMS database. The repository/project/hosting resources are not automatically created by the ZIP.

## Architecture

- React 19, TypeScript, Vite, Tailwind CSS v4 (base utility support), custom responsive design system, Radix Dialog
- Supabase Auth for Admin/Manager email/password and for Staff authenticated identities
- Staff token + PIN verified by Supabase Edge Function; one-time Auth token hash exchanged for a real Supabase session
- PostgreSQL with RLS select policies; privileged writes only through `task-api` Edge Function
- Private staff QR tokens derived via HMAC SHA-256 server secret, with hashed token and PBKDF2 PIN hash in DB
- Vercel hosting, GitHub source control, realtime notifications/tasks/notice invalidation

## Project contents

```
src/
  components/      Reusable UI, responsive dialogs, application shell
  pages/           Login, Dashboard, Tasks, Users/QR, Projects, Followups,
                   Notices, Reports, Activity, Settings
  lib/             Supabase client, auth, data queries, roles, helpers
supabase/
  migrations/      202610080001_initial.sql
  functions/
    _shared/       Edge Function authentication/crypto/authorization helpers
    staff-auth/    Public QR identification and PIN login
    task-api/      Authorized admin/staff/task mutations
  config.toml      JWT verification settings
vercel.json        SPA route fallback (deep links like /u/:token)
.env.example       Vite public-only environment variables
```

## 1. Create NEW Supabase project

1. Login to Supabase Dashboard. Choose the correct organization (e.g. `globalera`); review the **new project cost** before confirming.
2. Create a **new** project named `GlobalEra-TaskMS`, region suited to Nepal (for example `ap-south-1`). Do **not** select or reuse your RikshaMS project.
3. From the new project's **SQL Editor**, run `supabase/migrations/202610080001_initial.sql` as one migration. Use the SQL Editor only on this new database.
4. From **Authentication → Providers / Signups**, disable unauthorized public user registration (no public sign-up form exists in the app). Admin provisions users via secure Edge Function.
5. From **Authentication → Users → Add user**, create your first Admin identity with an email and strong password. Confirm the email or mark it as confirmed using the dashboard. The trigger creates a default Staff profile.
6. Promote ONLY that new Auth user manually in SQL Editor, replacing the email:

```sql
update public.profiles set role='admin', full_name='Administrator'
where email='YOUR_INITIAL_ADMIN_EMAIL';
```

7. Test with the same Admin email/password. **No default `admin/1234` exists in this Supabase build.**

## 2. Deploy Edge Functions

Install Supabase CLI, authenticate, link the **new** project:

```powershell
npx supabase login
npx supabase link --project-ref NEW_TASKMS_PROJECT_REF
npx supabase functions deploy task-api
npx supabase functions deploy staff-auth --no-verify-jwt
```

Generate a secret of at least 32 unpredictable characters using a cryptographic generator. In Windows PowerShell, if OpenSSL is installed:

```powershell
openssl rand -hex 32
```

Set this as a dedicated secret (NOT a public Vite variable):

```powershell
npx supabase secrets set ACCESS_LINK_SECRET=PASTE_RANDOM_64_HEX_HERE
```

Edge Functions require environment variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` supplied by Supabase hosted Edge runtime. Never put any service-role/secret key in the frontend or GitHub.

**Edge Function JWT settings:** `task-api` requires authenticated JWT. `staff-auth` must allow anonymous invocation (`supabase/config.toml` or `--no-verify-jwt`).

## 3. Local React development (Windows + VS Code)

1. Extract ZIP to a new folder, e.g. `Desktop\globalera-taskms`.
2. Open the folder in VS Code.
3. Open Terminal → PowerShell:

```powershell
npm.cmd install
Copy-Item .env.example .env.local
```

4. In `.env.local`, insert **NEW** TaskMS project values from Supabase → Project settings → API:

```
VITE_SUPABASE_URL=https://NEW_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

5. Start:

```powershell
npm.cmd run dev
```

6. Check build:

```powershell
npm.cmd run build
npm.cmd run test
```

Use `npm.cmd` in PowerShell if `npm.ps1` execution is restricted.

## 4. GitHub: NEW repository

Create a new private repo in GitHub account `globalgemss`, named `globalera-taskms`. Do not initialize with a README if pushing this downloaded project. From terminal inside the new folder:

```powershell
git init
git branch -M main
git add .
git commit -m "Initial Global Era TaskMS React Supabase V1"
git remote add origin https://github.com/globalgemss/globalera-taskms.git
git push -u origin main
```

Do NOT commit `.env.local`. `.gitignore` ignores it.

## 5. Vercel Hosting

1. Vercel → Add New → Project → Import `globalgemss/globalera-taskms`.
2. Framework: **Vite**. Build command: `npm run build`; output: `dist`.
3. Add environment variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` using **new** TaskMS credentials.
4. Deploy. `vercel.json` supports deep links `/dashboard`, `/tasks/:id`, `/u/:token`.
5. Create a test staff user from Admin → Users; copy private temporary PIN and access QR separately, scan QR and verify login from phone.
6. `git push` to `main` triggers a new Vercel deployment when connected.

## Admin and staff operations

- **Admin/Manager:** Login with email + strong password.
- **Staff:** Admin → Users → Add User → Staff. Email is required to provision Supabase Auth identity, but staff normally never type it during QR login.
- QR generated from a 256-bit HMAC-derived per-user token; PIN never embedded inside QR.
- On creation the private temporary PIN is shown once in a *non-printable* panel. Share QR and PIN via separate secure channels.
- Admin can View QR, Regenerate QR, Reset PIN, Deactivate/Activate. QR regeneration invalidates the old URL immediately.
- Five incorrect PIN attempts lock the account's QR access for 15 minutes. Access reset may unlock.
- Existing short-lived JWTs are checked against `profiles.token_valid_after` in RLS and task-api; see session limitation below.

## Important scope and limitations

- This is a **functional implementation starter** designed for a dedicated production deployment, but has **not been end-to-end tested against your new live Supabase project**, because the new project and keys are not yet provisioned. Run the acceptance tests below before inviting staff.
- **Session revocation caveat:** Resetting PIN/QR sets a per-user JWT issuance cutoff and immediately denies old access tokens in RLS/API. However, Supabase Auth refresh tokens may remain valid and can issue newer JWTs after rotation. **Before production**, implement and test server-side revocation of all refresh sessions for that target user through a supported Supabase Auth admin mechanism and verify auto-refresh cannot restore access. Do not claim hard remote logout until that test passes. Deactivation blocks access using status checks even across refresh.
- `staff-auth` identification is public to anyone holding the 256-bit QR token (name and UserID only, never PIN).
- V1 lists display up to 300 authorized recent records. For very large teams implement cursor-based server pagination and dashboard aggregate SQL.
- Realtime relies on `supabase_realtime` publication + authenticated RLS; test the real events in your project. On reconnect, queries are refreshed on focus.
- V1 notifications are app-internal. Browser push/email/WhatsApp are not enabled.
- File attachments, recurring tasks, calendar Kanban, Nepali Bikram Sambat UI, rich team hierarchy and automated external reminders are planned V2.
- Cross-table writes in `task-api` are sequential; task creation marks a task Cancelled if assignment fails. For strict atomic transactions, move create/assign/log steps into transaction-safe SQL RPC and add integration tests.
- Browser/keyboard behavior in Android/iPhone must be tested on actual devices; desktop simulated responsive CSS is not proof of physical keyboard behavior.
- Access validation must be tested on all roles before live use; the API is designed to check roles but human review of business rules remains required.

## Acceptance test checklist

| Test | Expected result |
|---|---|
| Admin login, incorrect password | Auth rejects login |
| Admin create Staff | Profile + QR token + private PIN |
| Staff scan QR, enter PIN | Staff dashboard and RLS-scoped tasks |
| Five incorrect PIN tries | Temporary lockout |
| Staff accesses `/users` | Redirected; RLS blocks profile enumeration |
| Manager assigns own subordinate | Task appears to assigned staff |
| Manager assigns outside team | Denied by server |
| Staff requests admin-only note | Denied by server |
| Staff updates their task | Task progress and timeline update |
| Staff sends task for Review | Manager can approve/return |
| Invalid Task status transition | Denied |
| Duplicate create request ID | Existing task returned, no second task |
| New notice targeted to user | Only target sees notice |
| QR regeneration | Old QR rejected; new QR works |
| Staff deactivation | Future access rejected |
| Session expiration, retry, mobile keyboard | Verify on real browser and device |

## Troubleshooting

- **Setup screen only:** `.env.local` missing or invalid. Restart Vite after editing env.
- **404 on QR URL:** Check `vercel.json` SPA fallback and your Vercel deployment.
- **Function not found:** Deploy both Edge Functions to the NEW Supabase project.
- **Unauthorized:** Ensure you are signed in, initial admin was promoted and `task-api` JWT verify setting is enabled.
- **QR login failed:** Check `ACCESS_LINK_SECRET`, latest migration, `staff-auth --no-verify-jwt`, and user status.
- **TypeScript / npm install error:** Use Node 20+ and working registry DNS, run `npm.cmd install` then `npm.cmd run build`.

## Security guidance

Do not print PIN on QR cards. Use private repo, environment variables, HTTPS and backups. Restrict initial Admin provisioning to a secure setup procedure. Avoid third-party plugins that inject scripts or expose access tokens. Password/PIN flows and RLS should undergo independent review before storing real staff personal information.