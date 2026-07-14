"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { buildSetsFromForm, getWinnerEntryId, setScoreFormFromSets } from "@/lib/match-scoring";
import type { SetScoreForm } from "@/lib/match-scoring";
import { formatStatusLabel } from "@/lib/format";
import type { DivisionEntryRow, MatchRow, MatchSetRow } from "@/lib/admin-data";
import type { MatchStatus } from "@/lib/types";

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
  saving
}: {
  divisionName: string;
  entryA?: DivisionEntryRow;
  entryB?: DivisionEntryRow;
  match: MatchRow;
  sets: MatchSetRow[];
  onSave: (match: MatchRow, sets: ReturnType<typeof buildSetsFromForm>, patch: MatchEditPatch) => Promise<void>;
  saving: boolean;
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

  async function handleSave() {
    setLocalMessage("");
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
      nextSets = buildSetsFromForm(scoreForm);
      const winnerEntryId = getWinnerEntryId(match, nextSets);
      if (!winnerEntryId) {
        setLocalMessage("Enter a valid score with a clear winner.");
        return;
      }
      patch.winner_entry_id = winnerEntryId;
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
      <div className="versus">
        <span>{entryA?.label || "Entry A"}</span>
        <span className="subtle">vs</span>
        <span>{entryB?.label || "Entry B"}</span>
      </div>
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
            <div className="score-grid" aria-label="Set scores">
              <div />
              <strong>1</strong>
              <strong>2</strong>
              <strong>3</strong>
              <span className="score-player-label">{entryA?.label || "A"}</span>
              <input min={0} onChange={(event) => setScoreForm((current) => ({ ...current, set1A: event.target.value }))} type="number" value={scoreForm.set1A} />
              <input min={0} onChange={(event) => setScoreForm((current) => ({ ...current, set2A: event.target.value }))} type="number" value={scoreForm.set2A} />
              <input min={0} onChange={(event) => setScoreForm((current) => ({ ...current, set3A: event.target.value }))} type="number" value={scoreForm.set3A} />
              <span className="score-player-label">{entryB?.label || "B"}</span>
              <input min={0} onChange={(event) => setScoreForm((current) => ({ ...current, set1B: event.target.value }))} type="number" value={scoreForm.set1B} />
              <input min={0} onChange={(event) => setScoreForm((current) => ({ ...current, set2B: event.target.value }))} type="number" value={scoreForm.set2B} />
              <input min={0} onChange={(event) => setScoreForm((current) => ({ ...current, set3B: event.target.value }))} type="number" value={scoreForm.set3B} />
            </div>
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

          {localMessage ? <p className="status-banner" data-tone="error">{localMessage}</p> : null}

          <button className="button" disabled={saving} onClick={handleSave} type="button">
            {saving ? "Saving..." : "Save match"}
          </button>
        </div>
      ) : null}
    </article>
  );
}
