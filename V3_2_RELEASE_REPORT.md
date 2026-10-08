# Global Era TaskMS V3.2 — Work Planning, Holidays & Dual Timer

## Status

Supabase migrations `202610080008`, `009` and `010` applied. Frontend and Edge API release is tracked in GitHub and verified through Vercel production deployment status after push.

## New features

- **Admin elapsed clock:** Starts automatically when the first assignee is attached to a task. Stops only when task status becomes `Completed` / `Cancelled`. Review submission does not stop this clock. Reopen starts a new cycle.
- **Staff work clock:** The assigned staff member presses **Start Work**; Staff can Pause/Resume with mandatory pause reason. Active time excludes paused duration. Existing per-staff `task_timers` and `task_timer_events` are reused.
- **Break history:** Each pause creates a break interval, each resume/stop closes it; historical V3 pause events are backfilled without deleting prior events.
- **Holiday management:** Default Saturday holiday for all five business units, editable weekly days, Admin-added holiday date ranges, manager authorization to work on particular tasks/dates. Unauthorized holiday Start/Resume rejected by database RPC.
- **Holiday rollover:** A recurring rule can defer to the next business day or skip holiday occurrences. Supabase recurring cron runs daily at 06:45 Nepal time.
- **Planning:** Draft/Published/Archived Daily/Weekly/Monthly plans, attach tasks and targets, compare planned/approved/in-review/missed tasks, carry incomplete task into another plan while preserving historical plan rows.
- **Reporting:** Work plan CSV, Staff vs Admin timer and break CSV, Manager dashboard summaries, idempotent daily/weekly/monthly snapshots at 17:00 Nepal time.
- **Notifications:** Due/overdue notifications hourly on working days, alerts for approved holiday work, daily summary notification to Unit managers.

## Server background jobs

- Recurring generator: UTC 01:00 each day = 06:45 Nepal.
- Deadline notices: hourly; idempotent event keys.
- Auto-pause staff work without holiday authorization: every 15 minutes; recording work seconds only until holiday day boundary.
- Planning summary snapshots: UTC 11:15 each day = 17:00 Nepal.

## Testing performed

- Transactional test asserted automatic Admin clock, rejected unauthorized holiday timer, staff start, pause, closed break interval on resume, staff stop on submit, Admin clock continuity through review, Admin clock stop on approval and approved-plan snapshot. **Passed** within rollback transaction; no test records retained.
- Staff simulated JWT/RLS saw just its authorized business unit and calendar.
- Frontend syntactic TS/TSX checks via global TypeScript compiler (excluding declaration-only files). Production Vercel build status confirms bundling after GitHub update.

## Not yet fully audited

- No real-world cross-device end-to-end QR/PIN or Admin browser interactions were exercised with credentials.
- Email/WhatsApp delivery and external n8n integration are outside this V3.2 scope; only in-app notices.
- CSV export and browser print styles are available; standalone server-generated PDF is not implemented.
- Time reports reflect logged sessions and approval status, **not** proof of productivity.
- Existing Supabase Auth leaked-password protection warning must be configured in Auth settings; one intentional RLS-no-policy notice applies to private credential material table.