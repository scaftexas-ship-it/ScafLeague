"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { rankEntriesByStandings } from "@/lib/league-rules";
import { toDomainMatch } from "@/lib/match-scoring";
import type { DivisionEntryRow, DivisionRow, MatchRow, MatchSetRow } from "@/lib/admin-data";
import { SCORING_RULES } from "@/lib/types";
import type { DivisionFormat, ScoringRules } from "@/lib/types";

type Qualifier = {
  entryId: string;
  refId: string; // player_id or team_id, matching `format`
  label: string;
  divisionId: string;
  divisionName: string;
  rank: number; // 1-based position within that division's standings
};

/** Ranks a division's entries best-to-worst using its actual match results. */
function rankedEntriesForDivision(divisionId: string, divisionEntries: DivisionEntryRow[], matches: MatchRow[], matchSets: MatchSetRow[], rules: ScoringRules) {
  const entries = divisionEntries
    .filter((entry) => entry.division_id === divisionId)
    .map((entry) => ({ id: entry.id, divisionId: entry.division_id, label: entry.label, playerIds: [] as string[] }));
  const domainMatches = matches
    .filter((match) => match.division_id === divisionId)
    .map((match) => toDomainMatch(match, matchSets.filter((set) => set.match_id === match.id).map((set) => ({ setNumber: set.set_number, entryAScore: set.entry_a_score, entryBScore: set.entry_b_score }))));
  return rankEntriesByStandings(entries, domainMatches, rules);
}

/**
 * Auto-fills a playoff bracket's entries from group-stage standings instead
 * of picking one at a time: top N from a single division for a same-group
 * semifinal, or top N from each of several divisions (concatenated block by
 * block in rank order) for a cross-group quarterfinal -- which, paired with
 * generateEliminatorSchedule's seeded index-vs-mirror bracketing, keeps
 * same-division entries apart in the first round as long as each division
 * contributes an equal count. Each qualifier can be individually swapped out
 * for the next-ranked entry from its own division still not selected, for
 * when a promoted player isn't actually available.
 */
export function QualifierPicker({
  divisions,
  divisionEntries,
  matches,
  matchSets,
  format,
  excludeDivisionId,
  onApply,
  rules = SCORING_RULES
}: {
  divisions: DivisionRow[];
  divisionEntries: DivisionEntryRow[];
  matches: MatchRow[];
  matchSets: MatchSetRow[];
  format: DivisionFormat;
  excludeDivisionId: string;
  onApply: (refIdsInSeedOrder: string[]) => void;
  rules?: ScoringRules;
}) {
  const [sourceDivisionIds, setSourceDivisionIds] = useState<string[]>([]);
  const [topN, setTopN] = useState("4");
  const [qualifiers, setQualifiers] = useState<Qualifier[]>([]);

  const sourceOptions = divisions.filter((division) => division.format === format && division.id !== excludeDivisionId);

  function toggleSourceDivision(divisionId: string) {
    setSourceDivisionIds((current) => (current.includes(divisionId) ? current.filter((id) => id !== divisionId) : [...current, divisionId]));
  }

  function refIdFor(entryId: string) {
    const entry = divisionEntries.find((item) => item.id === entryId);
    if (!entry) return undefined;
    return format === "doubles" ? entry.team_id || undefined : entry.player_id || undefined;
  }

  function autoFill() {
    const n = Math.max(1, Number(topN) || 1);
    const next: Qualifier[] = [];
    for (const divisionId of sourceDivisionIds) {
      const division = divisions.find((item) => item.id === divisionId);
      const ranked = rankedEntriesForDivision(divisionId, divisionEntries, matches, matchSets, rules);
      ranked.slice(0, n).forEach((entry, index) => {
        const refId = refIdFor(entry.id);
        if (!refId) return;
        next.push({ entryId: entry.id, refId, label: entry.label, divisionId, divisionName: division?.name || "Division", rank: index + 1 });
      });
    }
    setQualifiers(next);
    onApply(next.map((qualifier) => qualifier.refId));
  }

  function removeAndPromoteNext(target: Qualifier) {
    const ranked = rankedEntriesForDivision(target.divisionId, divisionEntries, matches, matchSets, rules);
    const stillInFromSameDivision = new Set(
      qualifiers.filter((qualifier) => qualifier.divisionId === target.divisionId && qualifier.entryId !== target.entryId).map((qualifier) => qualifier.entryId)
    );
    const replacementIndex = ranked.findIndex((entry) => !stillInFromSameDivision.has(entry.id) && entry.id !== target.entryId);
    const replacement = replacementIndex === -1 ? undefined : ranked[replacementIndex];
    const replacementRefId = replacement && refIdFor(replacement.id);

    const updated =
      replacement && replacementRefId
        ? qualifiers.map((qualifier) =>
            qualifier.entryId === target.entryId
              ? { entryId: replacement.id, refId: replacementRefId, label: replacement.label, divisionId: target.divisionId, divisionName: target.divisionName, rank: replacementIndex + 1 }
              : qualifier
          )
        : qualifiers.filter((qualifier) => qualifier.entryId !== target.entryId);

    setQualifiers(updated);
    onApply(updated.map((qualifier) => qualifier.refId));
  }

  return (
    <div className="card stack">
      <strong>Auto-fill from standings</strong>
      <p className="subtle">
        Pulls the top players/teams from each selected division's current standings. Pick one division for a same-group bracket (e.g. semifinals
        within a level), or several for a cross-group bracket (e.g. quarterfinals combining two divisions) -- their picks are seeded so same-division
        entries land on opposite sides of the bracket instead of meeting in round one.
      </p>

      {sourceOptions.length === 0 ? (
        <p className="subtle">No other {format} divisions with recorded matches yet.</p>
      ) : (
        <div className="toolbar" role="group" aria-label="Source divisions">
          {sourceOptions.map((division) => {
            const selected = sourceDivisionIds.includes(division.id);
            return (
              <button
                aria-pressed={selected}
                className={`pill blue pill-button ${selected ? "on" : ""}`}
                key={division.id}
                onClick={() => toggleSourceDivision(division.id)}
                type="button"
              >
                {division.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="field-row">
        <label className="field">
          <span>Top N per division</span>
          <input min={1} onChange={(event) => setTopN(event.target.value)} type="number" value={topN} />
        </label>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="button secondary small" disabled={sourceDivisionIds.length === 0} onClick={autoFill} type="button">
            Auto-fill qualifiers
          </button>
        </div>
      </div>

      {qualifiers.length > 0 ? (
        <div className="stack">
          <strong>Qualifiers ({qualifiers.length})</strong>
          {sourceDivisionIds.map((divisionId) => {
            const division = divisions.find((item) => item.id === divisionId);
            const rows = qualifiers.filter((qualifier) => qualifier.divisionId === divisionId).sort((a, b) => a.rank - b.rank);
            if (rows.length === 0) return null;
            return (
              <div className="stack" key={divisionId}>
                <span className="subtle">{division?.name || "Division"}</span>
                <div className="toolbar">
                  {rows.map((qualifier) => (
                    <span className="pill" key={qualifier.entryId}>
                      #{qualifier.rank} {qualifier.label}
                      <button aria-label={`Remove ${qualifier.label} and promote the next qualifier`} className="icon-link" onClick={() => removeAndPromoteNext(qualifier)} type="button">
                        <X size={12} aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
