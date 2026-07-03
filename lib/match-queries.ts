export const matchSelectBasic =
  "id, division_id, round, entry_a_id, entry_b_id, schedule_week_start, schedule_week_end, extension_week_start, extension_week_end, status";

export const matchSelectWithTargetScore = `${matchSelectBasic}, target_score`;

export function isMissingTargetScoreColumn(error: { message?: string } | string | null | undefined) {
  const message = (typeof error === "string" ? error : error?.message || "").toLowerCase();
  return message.includes("target_score") || message.includes("schema cache");
}
