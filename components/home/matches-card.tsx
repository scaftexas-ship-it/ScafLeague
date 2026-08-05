import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Versus } from "@/components/ui/versus";
import { MatchScore } from "@/components/ui/match-score";
import { formatStatusLabel } from "@/lib/format";
import type { DivisionEntryRow, DivisionRow, MatchRow, MatchSetRow } from "@/lib/admin-data";

export function MatchesCard({
  divisions,
  entries,
  matches,
  matchSets = []
}: {
  divisions: DivisionRow[];
  entries: DivisionEntryRow[];
  matches: MatchRow[];
  matchSets?: MatchSetRow[];
}) {
  return (
    <div className="card">
      <div className="section-title">
        <h2>All Games</h2>
        <span className="pill orange">weekly windows</span>
      </div>
      {matches.length > 0 ? (
        <div className="match-list">
          {matches.map((match) => {
            const division = divisions.find((item) => item.id === match.division_id);
            const entryA = entries.find((entry) => entry.id === match.entry_a_id);
            const entryB = entries.find((entry) => entry.id === match.entry_b_id);

            return (
              <article className="match-card" key={match.id}>
                <div className="match-meta">
                  <span className="pill blue">{division?.name || "Division"}</span>
                  <span className="pill">{match.round_label || `Round ${match.round}`}</span>
                  <span className="pill">To {match.target_score}</span>
                </div>
                <Versus awayLabel={entryB?.label} homeLabel={entryA?.label} />
                <MatchScore
                  sets={matchSets.filter((set) => set.match_id === match.id)}
                  status={match.status}
                  winnerLabel={match.winner_entry_id === match.entry_a_id ? entryA?.label : match.winner_entry_id === match.entry_b_id ? entryB?.label : undefined}
                />
                <div className="score-line">
                  <span className="subtle">
                    {match.schedule_week_start} to {match.extension_week_end}
                  </span>
                  <span className="pill orange">{formatStatusLabel(match.status)}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<ClipboardList size={24} aria-hidden />}
          title="No matches scheduled"
          body="Once an admin creates divisions, adds entries, and generates a schedule, tournament games will appear here."
        />
      )}
    </div>
  );
}
