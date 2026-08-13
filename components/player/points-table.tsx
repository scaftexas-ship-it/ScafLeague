import { Medal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatGamesRating, gamesRating } from "@/lib/league-rules";
import type { DivisionEntryRow, DivisionRow, StandingRow } from "@/lib/admin-data";

function matchesPlayed(standing: StandingRow) {
  return standing.played + standing.forfeits_won + standing.forfeits_lost;
}

function bonusPoints(standing: StandingRow) {
  return Math.max(standing.points - standing.wins * 4 - standing.losses, 0);
}

/**
 * R used to be the share of MATCHES won, which ignored how close any of them
 * were -- a 2-0 sweep and a 2-1 scrap both read as one win. It is now the
 * share of GAMES won, so the margin inside each match counts.
 */
function rating(standing: StandingRow) {
  return formatGamesRating(standing.games_won, standing.games_lost);
}

export function PointsTable({ divisions, entries, standings }: { divisions: DivisionRow[]; entries: DivisionEntryRow[]; standings: StandingRow[] }) {
  const tables = divisions
    .map((division) => ({
      division,
      rows: standings
        .filter((standing) => standing.division_id === division.id)
        .map((standing) => ({ standing, entry: entries.find((entry) => entry.id === standing.entry_id) }))
        // Points decide the table; the games rating breaks ties beneath them.
        .sort(
          (a, b) =>
            b.standing.points - a.standing.points ||
            gamesRating(b.standing.games_won, b.standing.games_lost) - gamesRating(a.standing.games_won, a.standing.games_lost) ||
            b.standing.wins - a.standing.wins
        )
    }))
    .filter((table) => table.rows.length > 0);

  return (
    <div className="card">
      <div className="section-title">
        <h2>Points</h2>
        <Medal size={22} aria-hidden />
      </div>
      {tables.length > 0 ? (
        <div className="points-board-list">
          <p className="subtle">M played &middot; W won &middot; L lost &middot; B bonus &middot; P points &middot; R rating (games won out of games played)</p>
          {tables.map(({ division, rows }) => (
            <div className="points-board" key={division.id}>
              <h3>{division.name}</h3>
              <div className="points-table-scroll" role="region" aria-label={`${division.name} points table`}>
                <table className="points-table">
                  <thead>
                    <tr>
                      <th scope="col">Player</th>
                      <th scope="col">M</th>
                      <th scope="col">W</th>
                      <th scope="col">L</th>
                      <th scope="col">B</th>
                      <th scope="col">P</th>
                      <th scope="col" title="Rating: games won out of games played">R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ entry, standing }) => (
                      <tr key={`${standing.division_id}-${standing.entry_id}`}>
                        <th scope="row">{entry?.label || "Entry"}</th>
                        <td>{matchesPlayed(standing)}</td>
                        <td>{standing.wins}</td>
                        <td>{standing.losses + standing.forfeits_lost}</td>
                        <td>{bonusPoints(standing)}</td>
                        <td>{standing.points}</td>
                        <td>{rating(standing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Medal size={24} aria-hidden />} title="No points yet" />
      )}
    </div>
  );
}
