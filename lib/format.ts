import type { DivisionFormat } from "./types";

/** "3.5 Singles" / "4.0 Doubles" -- used whenever we need to auto-name a division. */
export function formatDivisionName(skillLevel: string, format: DivisionFormat) {
  const label = format === "singles" ? "Singles" : "Doubles";
  return `${skillLevel.trim() || "All Levels"} ${label}`;
}

/** "Player A / Player B" -- used whenever we auto-name a doubles team. */
export function formatTeamName(playerAName: string, playerBName: string) {
  return `${playerAName} / ${playerBName}`;
}

export function formatShortDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

export function formatWeekday(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-US", { weekday: "short" });
}

export function formatLongDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

/** Normalizes a US-style phone number to E.164 digits (no "+") for wa.me / sms: links. Returns "" if not usable. */
export function normalizePhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

/**
 * The league runs on US Central time, so every date decision is made there --
 * not in UTC and not in whatever zone the viewer's device happens to be set to.
 *
 * toISOString() gave the UTC date, which rolls over at 7pm Central in summer
 * and 6pm in winter. An evening match was told its window had closed hours
 * before the day was actually over, and the nightly expiry job cancelled games
 * on the same early clock.
 *
 * Named as a zone rather than a fixed -6 offset on purpose: America/Chicago
 * moves between CST and CDT by itself, where a hardcoded offset would be wrong
 * for eight months of the year.
 */
export const LEAGUE_TIME_ZONE = "America/Chicago";

export function todayIso() {
  // en-CA formats as YYYY-MM-DD, which is exactly the ISO date shape.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

/** Joins first/last name into the single display_name string every player is stored and shown as. */
export function combineName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

/** Best-effort split of a stored display_name back into first/last name inputs for editing -- splits on the first space, so a name with no space becomes first-name-only. */
export function splitName(displayName: string) {
  const trimmed = displayName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}
