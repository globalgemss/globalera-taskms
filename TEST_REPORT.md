# TaskMS V1 validation status

This file distinguishes source-level checks from unperformed runtime tests.

- [x] New React/TypeScript/Vite project files generated.
- [x] Dedicated SQL migration defines 18 application tables and multiple RLS policies.
- [x] Edge Functions for Staff QR/PIN and authenticated task mutations written.
- [x] Staff access link token is never stored or placed in a QR with its PIN.
- [x] Built-in role UI separation and server-side role/record checks.
- [x] Form busy states, notes persistence on server failures, mobile full-height forms and short bottom sheets in source.
- [x] Client request idempotency key for task creation.
- [ ] `npm install` / `vite build` not completed in this environment (npm registry DNS unavailable).
- [ ] Real Supabase migration/application not executed (new project not created).
- [ ] Edge Function runtime integration with Supabase Auth not executed.
- [ ] GitHub repository push not performed (new repository must be created).
- [ ] Vercel deploy not performed (no Vercel connection was provided).
- [ ] Physical mobile keyboard and browser tests not performed.
- [ ] Full security review and auth refresh-token revocation test remain mandatory before live use.

Run README acceptance tests in a fresh isolated project.
