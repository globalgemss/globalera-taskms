# Global Era TaskMS V3 — Time Tracking & Kanban Release

**Target:** https://globalera-taskms.vercel.app

## Implemented

- Server-side atomic timer transitions, authored by Admin/authorized Unit Manager to start, staff (own session) to pause/resume, Manager to stop/verify.
- Database-level one-running-timer-per-person rule, audit events and idempotent request UUIDs; browser clock only renders time.
- Submit-for-review automatically and atomically stops all running/paused task timers. Approval is still a separate manager action.
- Task creation estimated minutes; timer sessions, pause reasons, time review records, business-unit RLS.
- Mobile Staff dashboard inspired by the provided bright blue reference; Desktop white/sidebar and Kanban board inspired by second reference.
- Board, Table and Card views; legal transitions respected on drag/drop, tasks route to details for privileged timer/review actions.
- Time Tracking screen, live metrics, unit filtering, CSV exports, task detail timer control, time logs, and verified corrections.
- V2 business units, QR login, projects, follow-ups, notices, recurring scheduler preserved.

## Database smoke test performed

Used transaction and rollback against the dedicated GlobalEra-TaskMS Supabase project:
- Admin start -> Running
- Prevent second Running timer for same Staff -> rejected
- Staff pause -> Paused; resume -> Running
- Submit for review -> task Review, timer Stopped, four audit events
- Rollback left no test tasks or sessions.

## Limitations / production acceptance

- Live website build is validated by Vercel deployment; browser logged-in multi-user QR flow must still be tested on real phones.
- The existing Staff QR reset/refresh-token revocation limitation described in README has **not** been fully resolved; use caution until server-side refresh-session invalidation is implemented and tested.
- Vercel's Vite build validates compilation but does not fully TypeScript typecheck (`npm run typecheck`); local npm installation was unavailable in the preparation sandbox.
- Time tracking is accumulated elapsed time after manager starts, **not** proof a staff member worked continuously; verify work and corrections.
- Drag-and-drop cannot bypass manager timer start or manager completion review.
- CSV works through browser. True downloadable XLSX/PDF exports and file uploads are not part of this V3 release.
- Supabase leaked-password protection should be enabled; authentication settings can be reviewed in Supabase Dashboard.