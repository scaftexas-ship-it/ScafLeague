"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import type { DivisionEntryRow, DivisionRow, StandingRow } from "@/lib/admin-data";
import { EmptyState } from "@/components/ui/empty-state";
import { formatGamesRating, gamesRating } from "@/lib/league-rules";

type AggregateRow = {
  identity: string;
  label: string;
  divisionCount: number;
  played: number;
  wins: number;
  losses: number;
  points: number;
  gamesWon: number;
  gamesLost: number;
};

function entryIdentity(entry: DivisionEntryRow) {
  if (entry.player_id) return `player:${entry.player_id}`;
  if (entry.team_id) return `team:${entry.team_id}`;
  return `entry:${entry.id}`;
}

/** Ranks players/teams across every division of a tournament combined, instead of the one-table-per-division view. A player or doubles team entered in multiple divisions of the same tournament gets one combined row. */
export function TournamentLeaderboard({
  divisions,
  entries,
  standings
}: {
  divisions: DivisionRow[];
  entries: DivisionEntryRow[];
  standings: StandingRow[];
}) {
  const [excludedDivisionIds, setExcludedDivisionIds] = useState<Set<string>>(new Set());

  function toggleDivision(divisionId: string) {
    setExcludedDivisionIds((current) => {
      const next = new Set(current);
      if (next.has(divisionId)) next.delete(divisionId);
      else next.add(divisionId);
      return next;
    });
  }

  const includedDivisionIds = new Set(divisions.filter((division) => !excludedDivisionIds.has(division.id)).map((division) => division.id));

  const totals = new Map<string, AggregateRow>();
  for (const standing of standings) {
    if (!includedDivisionIds.has(standing.division_id)) continue;
    const entry = entries.find((item) => item.id === standing.entry_id);
    if (!entry) continue;

    const identity = entryIdentity(entry);
    const row = totals.get(identity) || {
      identity,
      label: entry.label,
      divisionCount: 0,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
      gamesWon: 0,
      gamesLost: 0
    };
    row.divisionCount += 1;
    row.played += standing.played + standing.forfeits_won + standing.forfeits_lost;
    row.wins += standing.wins + standing.forfeits_won;
    row.losses += standing.losses + standing.forfeits_lost;
    row.points += standing.points;
    row.gamesWon += standing.games_won;
    row.gamesLost += standing.games_lost;
    totals.set(identity, row);
  }

  // Points decide the order; the games rating breaks ties beneath them.
  const rows = Array.from(totals.values()).sort(
    (a, b) => b.points - a.points || gamesRating(b.gamesWon, b.gamesLost) - gamesRating(a.gamesWon, a.gamesLost) || b.wins - a.wins
  );

  return (
    <div className="card">
      <div className="section-title">
        <h2>Tournament Leaderboard</h2>
        <Trophy size={22} aria-hidden />
      </div>
      {divisions.length > 1 ? (
        <div className="toolbar" role="group" aria-label="Divisions included in this leaderboard">
          {divisions.map((division) => {
            const included = includedDivisionIds.has(division.id);
            return (
              <button
                aria-pressed={included}
                className={`pill blue pill-button ${included ? "on" : ""}`}
                key={division.id}
                onClick={() => toggleDivision(division.id)}
                type="button"
              >
                {division.name}
              </button>
            );
          })}
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="points-table-scroll" role="region" aria-label="Tournament leaderboard">
          <table className="points-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player / team</th>
                <th scope="col">Div</th>
                <th scope="col">M</th>
                <th scope="col">W</th>
                <th scope="col">L</th>
                <th scope="col">P</th>
                <th scope="col" title="Rating: games won out of games played">R</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.identity}>
                  <td>{index + 1}</td>
                  <th scope="row">{row.label}</th>
                  <td>{row.divisionCount}</td>
                  <td>{row.played}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.points}</td>
                  <td>{formatGamesRating(row.gamesWon, row.gamesLost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<Trophy size={24} aria-hidden />} title="No results yet" />
      )}
    </div>
  );
}
