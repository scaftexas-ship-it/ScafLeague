# SCAF League

Mobile-first sports league management MVP for one club running tournaments across pickleball, badminton, tennis, or volleyball.

## Run Locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add Supabase credentials.
3. Apply `supabase/schema.sql` in your Supabase project.
4. Start the app with `npm run dev`.

The UI starts with empty backend-ready states. Connect Supabase data by applying `supabase/schema.sql` and creating an admin user.

## Included

- Admin tournament, division, registration, match, and standings views.
- Player-focused "My Matches" view.
- Deterministic weekly round-robin scheduler.
- Forfeit eligibility and scoring rules.
- Supabase schema with row-level security policies.
- Node tests for scheduler, scoring, and forfeit logic.
