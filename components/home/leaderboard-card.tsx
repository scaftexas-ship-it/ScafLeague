import { Medal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { DivisionEntryRow, StandingRow } from "@/lib/admin-data";

export function LeaderboardCard({ entries, standings }: { entries: DivisionEntryRow[]; standings: StandingRow[] }) {
  const sorted = [...standings].sort((a, b) => b.points - a.points || b.wins - a.wins);

  return (
    <div className="card">
      <div className="section-title">
        <h2>Leaderboards</h2>
        <Medal size={22} aria-hidden />
      </div>
      {sorted.length > 0 ? (
        <div className="leaderboard">
          <div className="table-row header">
            <span>#</span>
            <span>Entry</span>
            <span>W</span>
            <span>Pts</span>
          </div>
          {sorted.map((standing, index) => {
            const entry = entries.find((item) => item.id === standing.entry_id);
            return (
              <div className="table-row" key={`${standing.division_id}-${standing.entry_id}`}>
                <span>{index + 1}</span>
                <strong>{entry?.label || "Entry"}</strong>
                <span>{standing.wins}</span>
                <strong>{standing.points}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Medal size={24} aria-hidden />} title="No standings yet" body="Leaderboards are calculated from posted match results and forfeits." />
      )}
    </div>
  );
}
