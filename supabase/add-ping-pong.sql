-- Adds ping pong to the sports a tournament can be run in.
--
-- NON-DESTRUCTIVE: one statement, and it only ADDS a value to an existing
-- enum. No table is altered, no row is touched, nothing is dropped. Existing
-- tournaments keep whatever sport they already have.
--
-- "if not exists" makes it safe to re-run. Note that ALTER TYPE ... ADD VALUE
-- cannot be used by a query in the same transaction that adds it, so run this
-- on its own rather than bundled with a migration that inserts ping pong rows.
alter type public.sport_type add value if not exists 'ping_pong';
