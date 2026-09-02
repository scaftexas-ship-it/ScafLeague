import type { DivisionEntryRow, MatchRow, MatchSetRow, PlayerProfileRow, TeamMemberRow } from "./admin-data";

/**
 * Builds the CSV DUPR accepts for bulk match upload.
 *
 * The two headers are reproduced byte for byte from the templates DUPR issued,
 * including the singles one's stray playerB1ExternalId / playerB2DuprId /
 * playerB2ExternalId columns. They look like leftovers from the doubles
 * template, but an upload is validated against the header it expects, so they
 * are emitted (empty) rather than tidied away.
 */
export const DUPR_SINGLES_HEADER =
  "date,playerA1,playerA1DuprId,playerB1,playerB1DuprId,playerB1ExternalId,playerB2DuprId,playerB2ExternalId,teamAGame1,teamBGame1,teamAGame2,teamBGame2,teamAGame3,teamBGame3";

export const DUPR_DOUBLES_HEADER =
  "date,playerA1,playerA1DuprId,playerA2,playerA2DuprId,playerB1,playerB1DuprId,playerB2,playerB2DuprId,teamAGame1,teamBGame1,teamAGame2,teamBGame2,teamAGame3,teamBGame3";

export type DuprKind = "singles" | "doubles";

export type DuprExportInput = {
  matches: MatchRow[];
  matchSets: MatchSetRow[];
  entries: DivisionEntryRow[];
  players: PlayerProfileRow[];
  teamMembers: TeamMemberRow[];
};

export type DuprExportResult = {
  csv: string;
  rowCount: number;
  /** Matches left out, with the reason, so an admin can see what didn't make it. */
  skipped: Array<{ label: string; reason: string }>;
  /** Exported players whose DUPR id is missing, so DUPR has only a name to match on. */
  missingDuprIds: string[];
};

/**
 * A DUPR id is six alphanumeric characters. The club stores them in the
 * dupr_rating column, which also holds the odd genuine rating ("4.25") and
 * placeholder ("No") -- neither is an id, and sending one would have DUPR
 * reject the row, so anything not matching the shape is left blank and the
 * player is reported back instead.
 */
export function duprIdOf(player: PlayerProfileRow | undefined) {
  const value = (player?.dupr_rating || "").trim();
  return /^[A-Za-z0-9]{6}$/.test(value) ? value : "";
}

/** RFC 4180 quoting: wrap in quotes when the value holds a comma, quote or newline. */
function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function playersForEntry(entry: DivisionEntryRow | undefined, input: DuprExportInput) {
  if (!entry) return [];
  if (entry.player_id) {
    const player = input.players.find((item) => item.id === entry.player_id);
    return player ? [player] : [];
  }
  if (!entry.team_id) return [];
  const memberIds = input.teamMembers.filter((member) => member.team_id === entry.team_id).map((member) => member.player_id);
  // Ordered by the team roster rather than by name, so partners stay in a
  // stable order between exports.
  return memberIds.flatMap((id) => input.players.filter((player) => player.id === id));
}

export function buildDuprCsv(kind: DuprKind, input: DuprExportInput): DuprExportResult {
  const wanted = kind === "singles" ? 1 : 2;
  const rows: string[] = [];
  const skipped: DuprExportResult["skipped"] = [];
  const missing = new Set<string>();

  const ordered = [...input.matches].sort(
    (a, b) => a.schedule_week_end.localeCompare(b.schedule_week_end) || a.round - b.round
  );

  for (const match of ordered) {
    const entryA = input.entries.find((entry) => entry.id === match.entry_a_id);
    const entryB = input.entries.find((entry) => entry.id === match.entry_b_id);
    const label = `${entryA?.label || "?"} vs ${entryB?.label || "?"}`;

    const sideA = playersForEntry(entryA, input);
    const sideB = playersForEntry(entryB, input);
    if (sideA.length !== wanted || sideB.length !== wanted) continue; // belongs in the other file

    if (match.status === "forfeit") {
      // A forfeit is a real result, but no games were played, so there is
      // nothing for DUPR to rate.
      skipped.push({ label, reason: "won by forfeit, no games played" });
      continue;
    }
    if (match.status !== "completed" && match.status !== "score_submitted") {
      skipped.push({ label, reason: `no result yet (${match.status.replace(/_/g, " ")})` });
      continue;
    }

    const sets = input.matchSets.filter((set) => set.match_id === match.id).sort((a, b) => a.set_number - b.set_number);
    if (sets.length === 0) {
      // A forfeit is a real result with no games played, and DUPR has nothing
      // to rate without scores.
      skipped.push({ label, reason: "result has no game scores" });
      continue;
    }

    for (const player of [...sideA, ...sideB]) {
      if (!duprIdOf(player)) missing.add(player.display_name);
    }

    const games: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const set = sets[index];
      games.push(set ? String(set.entry_a_score) : "", set ? String(set.entry_b_score) : "");
    }

    // The played-on date is not recorded anywhere, so the deadline the match
    // had to be played by is the closest thing to it.
    const date = match.schedule_week_end;

    const cells =
      kind === "singles"
        ? [date, sideA[0].display_name, duprIdOf(sideA[0]), sideB[0].display_name, duprIdOf(sideB[0]), "", "", "", ...games]
        : [
            date,
            sideA[0].display_name,
            duprIdOf(sideA[0]),
            sideA[1].display_name,
            duprIdOf(sideA[1]),
            sideB[0].display_name,
            duprIdOf(sideB[0]),
            sideB[1].display_name,
            duprIdOf(sideB[1]),
            ...games
          ];

    rows.push(cells.map(csvCell).join(","));
  }

  const header = kind === "singles" ? DUPR_SINGLES_HEADER : DUPR_DOUBLES_HEADER;
  // Leading BOM as an escape rather than a literal character: the templates
  // DUPR supplied carry one, and Excel needs it to read the file as UTF-8.
  // Written literally it does not survive every editor and toolchain intact.
  return {
    csv: `\uFEFF${[header, ...rows].join("\r\n")}\r\n`,
    rowCount: rows.length,
    skipped,
    missingDuprIds: Array.from(missing).sort()
  };
}
