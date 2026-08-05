"use client";

import { useState } from "react";
import { ArrowLeftRight, Pencil } from "lucide-react";
import { addDays } from "@/lib/league-rules";
import { buildSetsFromForm, canSubmitScoreInWindow, setScoreFormFromSets, validateMatchSets } from "@/lib/match-scoring";
import type { SetScoreForm } from "@/lib/match-scoring";
import { formatStatusLabel, todayIso } from "@/lib/format";
import type { DivisionEntryRow, MatchRow, MatchSetRow } from "@/lib/admin-data";
import type { MatchStatus, Sport } from "@/lib/types";
import { ScoreGrid } from "@/components/ui/score-grid";
import { Versus } from "@/components/ui/versus";
import { MatchScore } from "@/components/ui/match-score";

const STATUS_OPTIONS: MatchStatus[] = ["scheduled", "score_submitted", "completed", "forfeit", "cancelled"];

export type MatchEditPatch = {
  round_label: string | null;
  target_score: number;
  schedule_week_start: string;
  schedule_week_end: string;
  extension_week_start: string;
  extension_week_end: string;
  status: MatchStatus;
  winner_entry_id: string | null;
  forfeit_by_entry_id: string | null;
};

export function MatchEditor({
  divisionName,
  entryA,
  entryB,
  match,
  sets,
  onSave,
  onSwapHomeAway,
  saving,
  swapping,
  sport
}: {
  divisionName: string;
  entryA?: DivisionEntryRow;
  entryB?: DivisionEntryRow;
  match: MatchRow;
  sets: MatchSetRow[];
  onSave: (match: MatchRow, sets: ReturnType<typeof buildSetsFromForm>, patch: MatchEditPatch) => Promise<void>;
  onSwapHomeAway: (match: MatchRow) => Promise<void>;
  saving: boolean;
  swapping: boolean;
  sport: Sport;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MatchStatus>(match.status);
  const [roundLabel, setRoundLabel] = useState(match.round_label || "");
  const [targetScore, setTargetScore] = useState(String(match.target_score));
  const [scheduleWeekStart, setScheduleWeekStart] = useState(match.schedule_week_start);
  const [scheduleWeekEnd, setScheduleWeekEnd] = useState(match.schedule_week_end);
  const [extensionWeekStart, setExtensionWeekStart] = useState(match.extension_week_start);
  const [extensionWeekEnd, setExtensionWeekEnd] = useState(match.extension_week_end);
  const [scoreForm, setScoreForm] = useState<SetScoreForm>(
    setScoreFormFromSets(sets.map((set) => ({ setNumber: set.set_number, entryAScore: set.entry_a_score, entryBScore: set.entry_b_score })))
  );
  const [forfeitWinnerId, setForfeitWinnerId] = useState(match.winner_entry_id || "");
  const [localMessage, setLocalMessage] = useState("");

  const today = todayIso();
  const canScoreUpdate = canSubmitScoreInWindow(match, today, addDays);

  async function handleSave() {
    setLocalMessage("");

    // The matches table enforces these as check constraints, and Postgres only
    // reports them as "violates check constraint matches_check2" -- meaningless
    // to an admin, and it surfaces at the top of the pane, far from the Save
    // button they just pressed. Catching them here explains what's wrong right
    // where they're looking. The extension week is the most common trip-up:
    // pushing a match back means moving BOTH weeks, not just the schedule one.
    if (scheduleWeekEnd < scheduleWeekStart) {
      setLocalMessage("The schedule week can't end before it starts. Check the schedule week dates.");
      return;
    }
    if (extensionWeekStart <= scheduleWeekEnd) {
      setLocalMessage(
        `The extension week has to start after the schedule week ends (${scheduleWeekEnd}). To move this match later, shift the extension week dates too.`
      );
      return;
    }
    if (extensionWeekEnd < extensionWeekStart) {
      setLocalMessage("The extension week can't end before it starts. Check the extension week dates.");
      return;
    }

    const patch: MatchEditPatch = {
      round_label: roundLabel.trim() || null,
      target_score: Number(targetScore) || match.target_score,
      schedule_week_start: scheduleWeekStart,
      schedule_week_end: scheduleWeekEnd,
      extension_week_start: extensionWeekStart,
      extension_week_end: extensionWeekEnd,
      status,
      winner_entry_id: null,
      forfeit_by_entry_id: null
    };

    let nextSets: ReturnType<typeof buildSetsFromForm> = [];

    if (status === "completed" || status === "score_submitted") {
      if (!canScoreUpdate) {
        setLocalMessage("Score updates are outside the allowed schedule window for this match. Adjust the schedule dates above to allow it.");
        return;
      }
      nextSets = buildSetsFromForm(scoreForm);
      const result = validateMatchSets(nextSets, {
        entryAId: match.entry_a_id,
        entryBId: match.entry_b_id,
        numberOfSets: match.number_of_sets,
        targetScore: Number(targetScore) || match.target_score,
        sport
      });
      if (!result.ok) {
        setLocalMessage(result.error);
        return;
      }
      patch.winner_entry_id = result.winnerEntryId;
    } else if (status === "forfeit") {
      if (!forfeitWinnerId) {
        setLocalMessage("Choose which entry gets the forfeit win.");
        return;
      }
      patch.winner_entry_id = forfeitWinnerId;
      patch.forfeit_by_entry_id = forfeitWinnerId;
    }

    await onSave(match, nextSets, patch);
    setOpen(false);
  }

  return (
    <article className="match-card">
      <div className="match-meta">
        <span className="pill blue">{divisionName}</span>
        <span className="pill">{match.round_label || `Round ${match.round}`}</span>
        <span className="pill orange">{formatStatusLabel(match.status)}</span>
      </div>
      <Versus awayLabel={entryB?.label} homeLabel={entryA?.label} />
      <MatchScore
        sets={sets}
        status={match.status}
        winnerLabel={match.winner_entry_id === match.entry_a_id ? entryA?.label : match.winner_entry_id === match.entry_b_id ? entryB?.label : undefined}
      />
      <div className="score-line">
        <span className="subtle">
          {match.schedule_week_start} to {match.extension_week_end}
        </span>
        <button className="link-button" onClick={() => setOpen((current) => !current)} type="button">
          <Pencil size={14} aria-hidden /> {open ? "Close" : "Edit"}
        </button>
      </div>

      {open ? (
        <div className="form-grid">
          <label className="field">
            <span>Status</span>
            <select onChange={(event) => setStatus(event.target.value as MatchStatus)} value={status}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatStatusLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Round label</span>
              <input onChange={(event) => setRoundLabel(event.target.value)} value={roundLabel} />
            </label>
            <label className="field">
              <span>Target score</span>
              <input onChange={(event) => setTargetScore(event.target.value)} type="number" value={targetScore} />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Schedule week start</span>
              <input onChange={(event) => setScheduleWeekStart(event.target.value)} type="date" value={scheduleWeekStart} />
            </label>
            <label className="field">
              <span>Schedule week end</span>
              <input onChange={(event) => setScheduleWeekEnd(event.target.value)} type="date" value={scheduleWeekEnd} />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Extension week start</span>
              <input onChange={(event) => setExtensionWeekStart(event.target.value)} type="date" value={extensionWeekStart} />
            </label>
            <label className="field">
              <span>Extension week end</span>
              <input onChange={(event) => setExtensionWeekEnd(event.target.value)} type="date" value={extensionWeekEnd} />
            </label>
          </div>

          {status === "completed" || status === "score_submitted" ? (
            !canScoreUpdate ? (
              <p className="subtle">Score updates are outside the allowed schedule window for this match. Adjust the schedule dates above to allow it.</p>
            ) : (
              <ScoreGrid
                aLabel={entryA?.label || "A"}
                bLabel={entryB?.label || "B"}
                numberOfSets={match.number_of_sets}
                scoreForm={scoreForm}
                setScoreForm={setScoreForm}
                sport={sport}
                targetScore={Number(targetScore) || match.target_score}
              />
            )
          ) : null}

          {status === "forfeit" ? (
            <label className="field">
              <span>Forfeit winner</span>
              <select onChange={(event) => setForfeitWinnerId(event.target.value)} value={forfeitWinnerId}>
                <option value="">Select winner</option>
                <option value={match.entry_a_id}>{entryA?.label || "Entry A"}</option>
                <option value={match.entry_b_id}>{entryB?.label || "Entry B"}</option>
              </select>
            </label>
          ) : null}

          <div className="spread">
            <span className="subtle">
              Home: {entryA?.label || "Entry A"} &middot; Away: {entryB?.label || "Entry B"}
            </span>
            <button className="button secondary small" disabled={saving || swapping} onClick={() => onSwapHomeAway(match)} type="button">
              <ArrowLeftRight size={14} aria-hidden />
              {swapping ? "Swapping..." : "Swap home/away"}
            </button>
          </div>

          {localMessage ? <p className="status-banner" data-tone="error">{localMessage}</p> : null}

          <button
            className="button"
            disabled={saving || ((status === "completed" || status === "score_submitted") && !canScoreUpdate)}
            onClick={handleSave}
            type="button"
          >
            {saving ? "Saving..." : "Save match"}
          </button>
        </div>
      ) : null}
    </article>
  );
}
