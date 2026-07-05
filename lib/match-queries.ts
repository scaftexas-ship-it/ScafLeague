export const matchSelectBasic =
  "id, division_id, round, entry_a_id, entry_b_id, schedule_week_start, schedule_week_end, extension_week_start, extension_week_end, status, winner_entry_id, forfeit_by_entry_id";

export const matchSelectWithRoundLabel = `${matchSelectBasic}, round_label`;
export const matchSelectWithTargetScore = `${matchSelectWithRoundLabel}, target_score, number_of_sets, restrict_score_updates, score_update_before_days, score_update_after_days, allow_forfeit, forfeit_before_days, forfeit_after_days`;

export function isMissingTargetScoreColumn(error: { message?: string } | string | null | undefined) {
  const message = (typeof error === "string" ? error : error?.message || "").toLowerCase();
  return (
    message.includes("target_score") ||
    message.includes("round_label") ||
    message.includes("number_of_sets") ||
    message.includes("restrict_score_updates") ||
    message.includes("score_update_before_days") ||
    message.includes("score_update_after_days") ||
    message.includes("allow_forfeit") ||
    message.includes("forfeit_before_days") ||
    message.includes("forfeit_after_days") ||
    message.includes("schema cache")
  );
}
