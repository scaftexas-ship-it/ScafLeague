export const matchSelectBasic =
  "id, division_id, round, entry_a_id, entry_b_id, schedule_week_start, schedule_week_end, extension_week_start, extension_week_end, status";

export const matchSelectWithRoundLabel = `${matchSelectBasic}, round_label`;
export const matchSelectWithTargetScore = `${matchSelectWithRoundLabel}, target_score`;

export function isMissingTargetScoreColumn(error: { message?: string } | string | null | undefined) {
  const message = (typeof error === "string" ? error : error?.message || "").toLowerCase();
  return message.includes("target_score") || message.includes("round_label") || message.includes("schema cache");
}
