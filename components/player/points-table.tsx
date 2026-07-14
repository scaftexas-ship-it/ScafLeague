import { Medal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { DivisionEntryRow, DivisionRow, StandingRow } from "@/lib/admin-data";

function matchesPlayed(standing: StandingRow) {
  return standing.played + standing.forfeits_won + standing.forfeits_lost;
}

function bonusPoints(standing: StandingRow) {
  return Math.max(standing.points - standing.wins * 4 - standing.losses, 0);
}

function winRate(standing: StandingRow) {
  const played = matchesPlayed(standing);
  if (played === 0) return "0.00";
  return ((standing.wins / played) * 100).toFixed(2);
}

export function PointsTable({ divisions, entries, standings }: { divisions: DivisionRow[]; entries: DivisionEntryRow[]; standings: StandingRow[] }) {
  const tables = divisions
    .map((division) => ({
      division,
      rows: standings
        .filter((standing) => standing.division_id === division.id)
        .map((standing) => ({ standing, entry: entries.find((entry) => entry.id === standing.entry_id) }))
        .sort((a, b) => b.standing.points - a.standing.points || b.standing.wins - a.standing.wins || matchesPlayed(b.standing) - matchesPlayed(a.standing))
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
                      <th scope="col">R</th>
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
                        <td>{winRate(standing)}</td>
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
