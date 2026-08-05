import type { MatchSetRow } from "@/lib/admin-data";
import type { MatchStatus } from "@/lib/types";

/**
 * The recorded result, shown wherever a match is listed. Scores are stored
 * positionally as entry_a/entry_b, and entry_a is the home side, so each pair
 * reads home-away to match the Home/Away labels on the same card.
 *
 * Renders nothing for a match with no result yet, so a scheduled fixture stays
 * as clean as it was before.
 */
export function MatchScore({ sets, status, winnerLabel }: { sets: MatchSetRow[]; status: MatchStatus; winnerLabel?: string }) {
  if (status === "forfeit") {
    // A bare "Won by forfeit" would only repeat the status pill; naming the
    // winner is the part that isn't on the card anywhere else.
    return (
      <div className="match-score">
        <span className="match-score-label">Result</span>
        <span className="subtle">{winnerLabel ? `${winnerLabel} won by forfeit` : "Won by forfeit"}</span>
      </div>
    );
  }

  const ordered = [...sets].sort((a, b) => a.set_number - b.set_number);
  if (ordered.length === 0) return null;

  const homeSets = ordered.filter((set) => set.entry_a_score > set.entry_b_score).length;
  const awaySets = ordered.filter((set) => set.entry_b_score > set.entry_a_score).length;

  return (
    <div className="match-score">
      <span className="match-score-label">Score</span>
      <span className="match-score-sets">
        {ordered.map((set) => (
          <span className="match-score-set" key={set.id ?? set.set_number}>
            <span className={set.entry_a_score > set.entry_b_score ? "match-score-win" : undefined}>{set.entry_a_score}</span>
            <span className="match-score-dash">-</span>
            <span className={set.entry_b_score > set.entry_a_score ? "match-score-win" : undefined}>{set.entry_b_score}</span>
          </span>
        ))}
      </span>
      <span className="subtle">
        ({homeSets}-{awaySets} sets)
      </span>
    </div>
  );
}
