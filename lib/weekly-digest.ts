import type { DivisionEntryRow, DivisionRow, MatchRow, PlayerProfileRow, StandingRow, TournamentRow } from "./admin-data";
import { sportLabel } from "./types.ts";

/**
 * Builds the weekly points email, one per player.
 *
 * Pure on purpose: given the league's rows it returns the text to send and
 * nothing else. The sending lives in scripts/send-weekly-digest.mjs, so this
 * can be tested exhaustively without a mail account, and reading the tests
 * tells you exactly what lands in someone's inbox.
 */

/** How many division blocks one email carries before it stops being a glance. */
const MAX_STANDINGS = 4;

export type DigestInput = {
  players: PlayerProfileRow[];
  tournaments: TournamentRow[];
  divisions: DivisionRow[];
  entries: DivisionEntryRow[];
  matches: MatchRow[];
  standings: StandingRow[];
  teamMembers: Array<{ team_id: string; player_id: string }>;
};

export type DigestStanding = {
  divisionName: string;
  tournamentName: string;
  sport: string;
  rank: number;
  outOf: number;
  points: number;
  wins: number;
  losses: number;
  top: Array<{ label: string; points: number; isMe: boolean }>;
};

export type DigestMatch = {
  opponent: string;
  divisionName: string;
  playBy: string;
  isHome: boolean;
};

export type PlayerDigest = {
  playerId: string;
  email: string;
  displayName: string;
  standings: DigestStanding[];
  upcoming: DigestMatch[];
  subject: string;
  text: string;
  html: string;
};

/** Entry ids belonging to this player, singles and through any team. */
function entryIdsForPlayer(playerId: string, input: DigestInput) {
  const teamIds = input.teamMembers.filter((member) => member.player_id === playerId).map((member) => member.team_id);
  return input.entries
    .filter((entry) => entry.player_id === playerId || (entry.team_id && teamIds.includes(entry.team_id)))
    .map((entry) => entry.id);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Ranks a division by points, then by games won as a share of games played --
 * the same order the app's own points table uses, so the email never disagrees
 * with what a player sees when they open it.
 */
function rankDivision(divisionId: string, input: DigestInput) {
  const rows = input.standings.filter((standing) => standing.division_id === divisionId);
  const rate = (row: StandingRow) => (row.games_won + row.games_lost === 0 ? 0 : row.games_won / (row.games_won + row.games_lost));
  return [...rows].sort((a, b) => b.points - a.points || rate(b) - rate(a) || b.wins - a.wins);
}

export function buildPlayerDigest(player: PlayerProfileRow, input: DigestInput, todayIso: string): PlayerDigest | null {
  if (!player.email) return null;

  const myEntryIds = entryIdsForPlayer(player.id, input);
  if (myEntryIds.length === 0) return null;

  const label = (entryId: string) => input.entries.find((entry) => entry.id === entryId)?.label || "Entry";

  const standings: DigestStanding[] = [];
  for (const entryId of myEntryIds) {
    const entry = input.entries.find((item) => item.id === entryId);
    if (!entry) continue;
    const division = input.divisions.find((item) => item.id === entry.division_id);
    if (!division) continue;
    const tournament = input.tournaments.find((item) => item.id === division.tournament_id);
    if (!tournament) continue;
    // A season that has finished stops mailing by itself.
    if (tournament.end_date < todayIso) continue;

    const ranked = rankDivision(division.id, input);
    const index = ranked.findIndex((row) => row.entry_id === entryId);
    if (index === -1) continue;
    const mine = ranked[index];

    standings.push({
      divisionName: division.name,
      tournamentName: tournament.name,
      sport: sportLabel(tournament.sport),
      rank: index + 1,
      outOf: ranked.length,
      points: mine.points,
      wins: mine.wins + mine.forfeits_won,
      losses: mine.losses + mine.forfeits_lost,
      top: ranked.slice(0, 3).map((row) => ({ label: label(row.entry_id), points: row.points, isMe: row.entry_id === entryId }))
    });
  }

  // Only what is still to play, soonest first -- a digest full of matches that
  // have already been and gone is worse than no digest.
  const upcoming: DigestMatch[] = input.matches
    .filter((match) => match.status === "scheduled")
    .filter((match) => myEntryIds.includes(match.entry_a_id) || myEntryIds.includes(match.entry_b_id))
    .filter((match) => match.extension_week_end >= todayIso)
    .sort((a, b) => a.schedule_week_end.localeCompare(b.schedule_week_end))
    .slice(0, 5)
    .map((match) => {
      const mine = myEntryIds.includes(match.entry_a_id) ? match.entry_a_id : match.entry_b_id;
      const other = mine === match.entry_a_id ? match.entry_b_id : match.entry_a_id;
      const division = input.divisions.find((item) => item.id === match.division_id);
      return {
        opponent: label(other),
        divisionName: division?.name || "Division",
        playBy: match.schedule_week_end,
        isHome: mine === match.entry_a_id
      };
    });

  // Best-placed first, then capped: the point is a glance, not a report.
  standings.sort((a, b) => a.rank - b.rank || b.points - a.points);
  const shownStandings = standings.slice(0, MAX_STANDINGS);
  const hiddenStandings = standings.length - shownStandings.length;

  // Nothing to report is a reason not to send, not a reason to send an empty
  // email. A player between seasons should simply hear nothing.
  if (shownStandings.length === 0 && upcoming.length === 0) return null;

  const first = player.display_name.split(" ")[0] || player.display_name;
  const subject =
    shownStandings.length > 0
      ? `Your league week: ${shownStandings[0].rank}${ordinal(shownStandings[0].rank)} in ${shownStandings[0].divisionName}`
      : "Your league week";

  return {
    playerId: player.id,
    email: player.email,
    displayName: player.display_name,
    standings: shownStandings,
    upcoming,
    subject,
    text: renderText(first, shownStandings, upcoming, hiddenStandings),
    html: renderHtml(first, shownStandings, upcoming, hiddenStandings)
  };
}

export function pluralPoints(points: number) {
  return `${points} ${points === 1 ? "point" : "points"}`;
}

export function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] || "th";
}

function renderText(first: string, standings: DigestStanding[], upcoming: DigestMatch[], hidden: number) {
  const lines = [`Hi ${first},`, ""];

  for (const standing of standings) {
    lines.push(`${standing.divisionName} - ${standing.tournamentName}`);
    lines.push(`  ${standing.rank}${ordinal(standing.rank)} of ${standing.outOf} - ${pluralPoints(standing.points)} (${standing.wins}-${standing.losses})`);
    lines.push("");
    lines.push("  Top of your division");
    standing.top.forEach((row, index) => {
      lines.push(`    ${index + 1}. ${row.label}${row.isMe ? " (you)" : ""} - ${row.points} ${row.points === 1 ? "pt" : "pts"}`);
    });
    lines.push("");
  }

  if (upcoming.length > 0) {
    lines.push(upcoming.length === 1 ? "Your next match" : "Your next matches");
    for (const match of upcoming) {
      lines.push(`  vs ${match.opponent} (${match.isHome ? "home" : "away"}) - play by ${match.playBy} - ${match.divisionName}`);
    }
    lines.push("");
  }

  if (hidden > 0) lines.push(`You are in ${hidden} more division${hidden === 1 ? "" : "s"} -- see them all on league.scaftexas.org.`, "");

  lines.push("You can turn this email off from your schedule page on league.scaftexas.org.");
  return lines.join("\n");
}

function renderHtml(first: string, standings: DigestStanding[], upcoming: DigestMatch[], hidden: number) {
  const parts: string[] = [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#171b26;line-height:1.5">`,
    `<p>Hi ${escapeHtml(first)},</p>`
  ];

  for (const standing of standings) {
    parts.push(
      `<div style="margin:0 0 20px;padding:14px 16px;border:1px solid #e2e6ee;border-radius:14px">`,
      `<div style="font-weight:700">${escapeHtml(standing.divisionName)}</div>`,
      `<div style="color:#5b6474;font-size:13px;margin-bottom:8px">${escapeHtml(standing.tournamentName)} &middot; ${escapeHtml(standing.sport)}</div>`,
      `<div style="font-size:20px;font-weight:800">${standing.rank}${ordinal(standing.rank)} of ${standing.outOf}</div>`,
      `<div style="color:#5b6474;font-size:13px;margin-bottom:10px">${pluralPoints(standing.points)} &middot; ${standing.wins}-${standing.losses}</div>`,
      `<table style="border-collapse:collapse;font-size:14px">`
    );
    standing.top.forEach((row, index) => {
      const weight = row.isMe ? "700" : "400";
      parts.push(
        `<tr><td style="padding:2px 10px 2px 0;color:#5b6474">${index + 1}.</td>` +
          `<td style="padding:2px 12px 2px 0;font-weight:${weight}">${escapeHtml(row.label)}${row.isMe ? " (you)" : ""}</td>` +
          `<td style="padding:2px 0;font-weight:${weight}">${row.points} ${row.points === 1 ? "pt" : "pts"}</td></tr>`
      );
    });
    parts.push(`</table></div>`);
  }

  if (upcoming.length > 0) {
    parts.push(`<div style="font-weight:700;margin-bottom:6px">${upcoming.length === 1 ? "Your next match" : "Your next matches"}</div><ul style="margin:0 0 20px;padding-left:18px">`);
    for (const match of upcoming) {
      parts.push(
        `<li style="margin-bottom:4px">vs <strong>${escapeHtml(match.opponent)}</strong> ` +
          `<span style="color:#5b6474">(${match.isHome ? "home" : "away"})</span> &mdash; play by ${escapeHtml(match.playBy)}</li>`
      );
    }
    parts.push(`</ul>`);
  }

  if (hidden > 0) {
    parts.push(`<p style="color:#5b6474;font-size:13px">You are in ${hidden} more division${hidden === 1 ? "" : "s"} &mdash; see them all on the site.</p>`);
  }

  parts.push(
    `<p style="color:#5b6474;font-size:12px">You can turn this email off from your schedule page on ` +
      `<a href="https://league.scaftexas.org/player/">league.scaftexas.org</a>.</p></div>`
  );
  return parts.join("");
}

/** Everyone who should get an email this week. Opted-out players are dropped here, once. */
export function buildDigests(input: DigestInput, todayIso: string): PlayerDigest[] {
  return input.players
    .filter((player) => (player as PlayerProfileRow & { weekly_email_enabled?: boolean }).weekly_email_enabled !== false)
    .flatMap((player) => {
      const digest = buildPlayerDigest(player, input, todayIso);
      return digest ? [digest] : [];
    });
}
