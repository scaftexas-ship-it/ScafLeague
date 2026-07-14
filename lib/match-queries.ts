/**
 * Single source of truth for the columns we select off `public.matches`.
 *
 * The previous version of this app shipped several matches columns as
 * incremental, optional SQL migrations (add-match-round-label.sql,
 * add-match-scheduler-options.sql, add-match-target-score.sql) and then had
 * to sprinkle "does this column exist yet?" fallback branches through every
 * component that queried matches. This rebuild's supabase/schema.sql creates
 * every column up front, so that fallback layer is gone -- there is exactly
 * one query shape.
 */
export const matchSelect =
  "id, division_id, round, round_label, entry_a_id, entry_b_id, target_score, number_of_sets, " +
  "restrict_score_updates, score_update_before_days, score_update_after_days, allow_forfeit, " +
  "forfeit_before_days, forfeit_after_days, schedule_week_start, schedule_week_end, " +
  "extension_week_start, extension_week_end, status, winner_entry_id, forfeit_by_entry_id";

export const matchSetSelect = "id, match_id, set_number, entry_a_score, entry_b_score";
