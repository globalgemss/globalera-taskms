# Global Era TaskMS V3.3 — Work Updates & Role-Based UI

Date: 2026-10-08 (Nepal). Base: V3.2, same GitHub/Supabase/Vercel deployment.

## Features
- Admin-only Holiday Management, Recurring/Automation, Business Unit and Users management; Manager Team Management and read-only My Team page; Staff task-focused clean navigation. Routes protected by role, with permission enforcement retained in Supabase Edge Functions and RLS.
- Work Updates feed: approved task completions, review queue, admin-created achievements. Today/Week/Month/All Time, Business Unit selector, Staff/Type search and CSV. Manual achievement archive/restore and optional task/project/evidence HTTPS links. Realtime update publication.
- Color-coded Kanban: slate To Do, blue In Progress, orange In Review, green Completed, red overdue indicators; desktop drag/drop and mobile Move to control. Sensitive Start Work and Review Approval remain gated by Task Details and backend transitions, not unrestricted drag/drop.
- Task Notes & Activity Timeline: chronological feed, filter Notes/Timer/Follow-up/Review, note type, Team/Manager/Admin visibility, HTTPS attachment links, pinned important notes, edit history, author display, old notes preserved. Staff profile Activity/Notes filters added.
- Dashboard recent completed approvals preview.
- Preserves V3.2 existing business units, dual clocks, holiday-aware calendar, work planning, recurring tasks and notes.

## Verification
- 36 TS/TSX parse tests passed locally via global TypeScript compiler API.
- SQL migrations applied using Supabase migration management; Edge Function deployed separately.
- Actual browser login/QR/touch interaction requires verification with staff credentials; currently no headless authenticated browser session.
- Dependency installation unavailable in isolated container, so Vercel production build is source-of-truth for Vite bundling.

## Scope note
- Existing API role design remains; Manager is team-scoped for new task assignment and Admin-only holidays/automations in UI. Not all unit-wide legacy manager RLS read rules have been redesigned for strict reporting-manager-only isolation; audit these before treating manager data as hard tenant partitioning.
- Notes attachments accept HTTPS links; direct Supabase Storage uploads are not yet added.