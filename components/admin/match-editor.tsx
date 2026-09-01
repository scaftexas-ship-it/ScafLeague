"use client";

import { useState } from "react";
import { ArrowLeftRight, ListPlus, Pencil } from "lucide-react";
import { addDays } from "@/lib/league-rules";
import { buildSetsFromForm, canSubmitScoreInWindow, setScoreFormFromSets, validateMatchSets } from "@/lib/match-scoring";
import type { SetScoreForm } from "@/lib/match-scoring";
import { formatStatusLabel, todayIso } from "@/lib/format";
import type { DivisionEntryRow, MatchRow, MatchSetRow } from "@/lib/admin-data";
import type { MatchStatus, Sport } from "@/lib/types";
import { ScoreGrid } from "@/components/ui/score-grid";
import { Versus } from "@/components/ui/versus";
import { MatchScore } from "@/components/ui/match-score";
import { StatusPill } from "@/components/ui/status-pill";

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
  // Shown as context, not enforced. This pane is admin-only, and correcting the
  // record after the window has closed -- or after a match was auto-cancelled
  // for going unplayed -- is exactly the job it exists to do. Players are still
  // held to the window on their own card.
  const pastWindow = !canSubmitScoreInWindow(match, today, addDays);

  // Scores belong on any match that could still be played, not just one an
  // admin has already flipped to "completed" by hand. Hiding the grid behind
  // that dropdown meant opening a scheduled match showed nothing but dates --
  // there was no visible way to add a score at all. Cancelled is included
  // because a game called off and then played anyway still needs its result.
  const scoreEntryApplies =
    status === "scheduled" || status === "score_submitted" || status === "completed" || status === "cancelled";
  const hasEnteredScores = buildSetsFromForm(scoreForm).length > 0;

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

    // Typing a score into a scheduled match is how an admin records a result;
    // making them also remember to change the status dropdown just invites a
    // finished match that still reads "scheduled".
    const effectiveStatus: MatchStatus =
      (status === "scheduled" || status === "cancelled") && hasEnteredScores ? "completed" : status;

    const patch: MatchEditPatch = {
      round_label: roundLabel.trim() || null,
      target_score: Number(targetScore) || match.target_score,
      schedule_week_start: scheduleWeekStart,
      schedule_week_end: scheduleWeekEnd,
      extension_week_start: extensionWeekStart,
      extension_week_end: extensionWeekEnd,
      status: effectiveStatus,
      winner_entry_id: null,
      forfeit_by_entry_id: null
    };

    let nextSets: ReturnType<typeof buildSetsFromForm> = [];

    if (effectiveStatus === "completed" || effectiveStatus === "score_submitted") {
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
    } else if (effectiveStatus === "forfeit") {
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
        <StatusPill status={match.status} />
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
        <span className="match-card-actions">
          {/* Named outright, because "Edit" gave no hint that scoring lived
              behind it -- an admin looking for a score button found none. */}
          {!open && scoreEntryApplies ? (
            <button className="link-button" onClick={() => setOpen(true)} type="button">
              <ListPlus size={14} aria-hidden /> {sets.length > 0 ? "Edit score" : "Add score"}
            </button>
          ) : null}
          <button className="link-button" onClick={() => setOpen((current) => !current)} type="button">
            <Pencil size={14} aria-hidden /> {open ? "Close" : "Edit"}
          </button>
        </span>
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

          {scoreEntryApplies ? (
            <>
              {pastWindow ? (
                <p className="subtle">
                  This match is past its schedule window. As an admin you can still record the result.
                </p>
              ) : null}
              <div className="spread">
                <strong>{sets.length > 0 ? "Score" : "Add score"}</strong>
                {status === "scheduled" || status === "cancelled" ? (
                  <span className="subtle">Entering a score marks this match completed.</span>
                ) : null}
              </div>
              <ScoreGrid
                aLabel={entryA?.label || "A"}
                bLabel={entryB?.label || "B"}
                numberOfSets={match.number_of_sets}
                scoreForm={scoreForm}
                setScoreForm={setScoreForm}
                sport={sport}
                targetScore={Number(targetScore) || match.target_score}
              />
            </>
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
            disabled={saving}
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
