"use client";

import { isValidCompletedSet } from "@/lib/match-scoring";
import type { SetScoreForm } from "@/lib/match-scoring";
import type { Sport } from "@/lib/types";

const ALL_COLUMNS: Array<{ set: string; a: keyof SetScoreForm; b: keyof SetScoreForm }> = [
  { set: "1", a: "set1A", b: "set1B" },
  { set: "2", a: "set2A", b: "set2B" },
  { set: "3", a: "set3A", b: "set3B" }
];

/** How many set columns to actually show: capped by numberOfSets, and cut short as soon as an earlier majority already decides the match. */
function visibleColumnCount(scoreForm: SetScoreForm, numberOfSets: number, targetScore: number, sport: Sport) {
  const configured = Math.min(Math.max(numberOfSets, 1), ALL_COLUMNS.length);
  const majorityNeeded = Math.ceil(configured / 2);
  let winsA = 0;
  let winsB = 0;

  for (let index = 0; index < configured; index += 1) {
    const column = ALL_COLUMNS[index];
    const aRaw = scoreForm[column.a];
    const bRaw = scoreForm[column.b];
    if (aRaw === "" || bRaw === "") return configured;

    const a = Number(aRaw);
    const b = Number(bRaw);
    if (!isValidCompletedSet(a, b, targetScore, sport)) return configured;

    if (a > b) winsA += 1;
    else winsB += 1;

    if (Math.max(winsA, winsB) >= majorityNeeded) return index + 1;
  }

  return configured;
}

/** Shared set-score entry grid for both the player and admin match editors. Hides further set columns once a prior majority already decides the match. */
export function ScoreGrid({
  aLabel,
  bLabel,
  numberOfSets,
  scoreForm,
  setScoreForm,
  sport,
  targetScore
}: {
  aLabel: string;
  bLabel: string;
  numberOfSets: number;
  scoreForm: SetScoreForm;
  setScoreForm: React.Dispatch<React.SetStateAction<SetScoreForm>>;
  sport: Sport;
  targetScore: number;
}) {
  const columns = ALL_COLUMNS.slice(0, visibleColumnCount(scoreForm, numberOfSets, targetScore, sport));
  const majorityNeeded = Math.ceil(columns.length / 2);

  return (
    <div className="score-grid" aria-label="Set scores">
      <div />
      {columns.map((column) => (
        <strong key={column.set}>{column.set}</strong>
      ))}
      <span className="score-player-label">{aLabel}</span>
      {columns.map((column, index) => (
        <input
          key={column.a}
          min="0"
          onChange={(event) => setScoreForm((current) => ({ ...current, [column.a]: event.target.value }))}
          required={index < majorityNeeded}
          type="number"
          value={scoreForm[column.a]}
        />
      ))}
      <span className="score-player-label">{bLabel}</span>
      {columns.map((column, index) => (
        <input
          key={column.b}
          min="0"
          onChange={(event) => setScoreForm((current) => ({ ...current, [column.b]: event.target.value }))}
          required={index < majorityNeeded}
          type="number"
          value={scoreForm[column.b]}
        />
      ))}
    </div>
  );
}
