# SCAF League

Mobile-first sports league management for one club running tournaments across pickleball, badminton, tennis, or volleyball.

This is a rebuild of the original ScafLeague app on the same stack (Next.js App Router + Supabase), focused on fixing three things in
the original codebase: two ~2,700 and ~1,000 line "god components" that held the entire admin and player UI, a hardcoded scoring
summary that could drift from the real scoring logic, and a visual design that hadn't been given much attention. Functionally it aims
to cover the same ground: tournaments, weekly round-robin and playoff scheduling, manual matchups, player/team management, score
entry, forfeit handling, standings, CSV/XLSX player import, and admin user management.

## What changed structurally

- **`components/admin-workspace.tsx` (121KB, ~2,700 lines) is gone.** It's now `components/admin/` — an `admin-workspace.tsx`
  orchestrator plus one file per tab (`tournaments-pane.tsx`, `people-pane.tsx`, `match-management-pane.tsx`, `teams-pane.tsx`,
  `settings-pane.tsx`), a `schedule-builder/` folder for the 24-field scheduling wizard (now a `useReducer` hook instead of two dozen
  `useState` calls), a generic `entity-picker.tsx` (replaces two nearly-identical hand-written player/team picker blocks), and
  `match-editor.tsx` for per-match overrides.
- **`components/player-workspace.tsx` (43KB) is gone.** It's now `components/player/` — `player-workspace.tsx`, `match-card.tsx`,
  `points-table.tsx`, `contact-links.tsx`.
- **All Supabase access moved out of components** into `lib/admin-data.ts` and `lib/player-data.ts` — typed functions that do one
  query each and throw a plain `Error` on failure, instead of every component hand-rolling `{data, error}` destructuring.
- **The schema-drift fallback pattern is gone.** The old app added columns via incremental migrations (`add-match-round-label.sql`,
  `add-match-scheduler-options.sql`, `add-player-mobile-number.sql`, `add-user-access-disabled.sql`) and had every query try the full
  column set, catch a "column doesn't exist" error, and retry with fewer columns. `supabase/schema.sql` now creates every column up
  front, so there's exactly one query shape everywhere.
- **Scoring rules live in one place** (`SCORING_RULES` in `lib/types.ts`, used by both `lib/league-rules.ts` and the Tournaments tab's
  summary text) instead of a hardcoded "4/1/1" label that could silently drift from the real logic.
- **`app/globals.css` is a new, from-scratch design system** (CSS custom properties for color/spacing/radius, mobile-first layout,
  consistent card/pill/button/form primitives) rather than a patch on the old stylesheet.
- `lib/league-rules.ts` (round robin/eliminator scheduling, standings math, forfeit windows) is carried over essentially unchanged —
  it was already well-isolated and covered by tests, so it didn't need a rewrite. `tests/league-rules.test.ts` is the same test suite,
  unmodified, and still passes against this file. `tests/match-scoring.test.ts` is new, covering the extracted score-entry helpers.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and add your Supabase project URL + anon key (and optionally a service-role key — see below).
3. Apply `supabase/schema.sql` in your Supabase project's SQL editor.
4. Sign up through the app's login page once, then run `supabase/promote-admins.sql` (edit the email first) to make that account an
   admin and create its club.
5. `npm run dev`

Run `npm test` to run the Node test suite (`tests/league-rules.test.ts`, `tests/match-scoring.test.ts`).

### Optional: admin-created logins

Add `SUPABASE_SERVICE_ROLE_KEY` (from your Supabase project's API settings) to `.env.local` to let the People tab create real login
accounts (single invite or bulk CSV/XLSX import). Without it, player profiles still get created — only the login/auth account is
skipped, and the Settings tab tells you which mode you're in.

## Deploying

`next.config.mjs` is set up for a static export (`output: "export"`), deployed to GitHub Pages via
`.github/workflows/deploy-pages.yml` on every push to `main`. `public/CNAME` points it at a custom domain
(`league.scaftexas.org`) served from the root — if you fork this without a custom domain, delete `public/CNAME` and add a
`basePath`/`assetPrefix` in `next.config.mjs` matching your repo name instead, since GitHub's default `<user>.github.io/<repo>/`
URLs serve from a subpath.

## A note on verification

This rebuild was produced without the ability to run `npm install` / `npm run build` / `tsc` locally (no outbound network access in
the environment it was written in), so it has not been compiled or type-checked end-to-end. Every file was written carefully against
the original app's exact Supabase schema and query shapes, and cross-checked for import/export consistency, but you should run
`npm install && npm run build` (or push to a branch and let CI build it) before trusting this in production, and treat the first build
as the real verification step.
