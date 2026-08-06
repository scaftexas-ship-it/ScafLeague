"use client";

import { useState } from "react";
import { CalendarDays, Check, Send } from "lucide-react";
import { addDays, canClaimForfeit } from "@/lib/league-rules";
import { buildSetsFromForm, canSubmitScoreInWindow, emptySetScoreForm, getForfeitUnavailableReason, toDomainMatch } from "@/lib/match-scoring";
import type { SetScoreForm } from "@/lib/match-scoring";
import { formatShortDate, formatWeekday, todayIso } from "@/lib/format";
import type { DivisionEntryRow, DivisionRow, MatchRow, MatchSetRow, PlayerProfileRow, TeamMemberRow } from "@/lib/admin-data";
import type { MatchSet, Sport } from "@/lib/types";
import { ScoreGrid } from "@/components/ui/score-grid";
import { MatchScore } from "@/components/ui/match-score";
import { StatusPill } from "@/components/ui/status-pill";
import { ContactLinks } from "./contact-links";

function getEntryPlayers(entry: DivisionEntryRow | undefined, players: PlayerProfileRow[], teamMembers: TeamMemberRow[]) {
  if (!entry) return [];
  if (entry.player_id) {
    const player = players.find((item) => item.id === entry.player_id);
    return player ? [player] : [];
  }
  if (!entry.team_id) return [];
  const memberIds = teamMembers.filter((member) => member.team_id === entry.team_id).map((member) => member.player_id);
  return players.filter((player) => memberIds.includes(player.id));
}

export function MatchCard({
  canAct,
  division,
  entryA,
  entryB,
  match,
  matchSets = [],
  myEntryIds,
  onClaimForfeit,
  onSubmitScore,
  players,
  sport,
  teamMembers,
  tournamentName
}: {
  canAct: boolean;
  division?: DivisionRow;
  entryA?: DivisionEntryRow;
  entryB?: DivisionEntryRow;
  match: MatchRow;
  matchSets?: MatchSetRow[];
  myEntryIds: string[];
  onClaimForfeit: (match: MatchRow, claimedByEntryId: string) => Promise<void>;
  onSubmitScore: (match: MatchRow, sets: MatchSet[]) => Promise<void>;
  players: PlayerProfileRow[];
  sport: Sport;
  teamMembers: TeamMemberRow[];
  tournamentName?: string;
}) {
  const [showScoreForm, setShowScoreForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claimingForfeit, setClaimingForfeit] = useState(false);
  const [resultMode, setResultMode] = useState<"score" | "forfeit">("score");
  const [forfeitWinnerId, setForfeitWinnerId] = useState("");
  const [scoreForm, setScoreForm] = useState<SetScoreForm>(emptySetScoreForm(match.target_score));

  const today = todayIso();
  const playerEntryId = myEntryIds.find((entryId) => entryId === match.entry_a_id || entryId === match.entry_b_id) || "";
  const isAdminPreview = canAct && myEntryIds.length === 0;
  const domainMatch = toDomainMatch(match);
  const canForfeit = Boolean(playerEntryId && canClaimForfeit(domainMatch, playerEntryId, today));
  const canForfeitForEntryA = isAdminPreview && canClaimForfeit(domainMatch, match.entry_a_id, today);
  const canForfeitForEntryB = isAdminPreview && canClaimForfeit(domainMatch, match.entry_b_id, today);
  const canScoreUpdate = canSubmitScoreInWindow(match, today, addDays);
  const canEdit = canAct && canScoreUpdate && (match.status === "scheduled" || match.status === "score_submitted");
  const forfeitReason = getForfeitUnavailableReason(match, today);
  const opponentEntry = playerEntryId === match.entry_a_id ? entryB : entryA;
  const opponentPlayers = getEntryPlayers(opponentEntry, players, teamMembers);
  const canOpenResult = canEdit || canForfeit || canForfeitForEntryA || canForfeitForEntryB;
  const winnerForForfeit = isAdminPreview ? forfeitWinnerId : playerEntryId;
  const canSaveForfeit = isAdminPreview
    ? (winnerForForfeit === match.entry_a_id && canForfeitForEntryA) || (winnerForForfeit === match.entry_b_id && canForfeitForEntryB)
    : canForfeit;

  async function handleScoreSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resultMode === "forfeit") {
      if (!canSaveForfeit || !winnerForForfeit) return;
      setClaimingForfeit(true);
      await onClaimForfeit(match, winnerForForfeit);
      setClaimingForfeit(false);
      setShowScoreForm(false);
      return;
    }

    const sets = buildSetsFromForm(scoreForm);
    setSubmitting(true);
    await onSubmitScore(match, sets);
    setSubmitting(false);
    setShowScoreForm(false);
  }

  return (
    <article className="mobile-match-card">
      <div className="match-rail" aria-hidden>
        <CalendarDays size={22} />
      </div>
      <div className="mobile-match-body">
        <div className="match-meta">
          {tournamentName ? <span className="pill">{tournamentName}</span> : null}
          <span className="pill blue">{division?.name || "Schedule"}</span>
          <StatusPill status={match.status} />
          {/* Say plainly which side the viewer is on -- "Home"/"Away" alone reads
              ambiguously when the card already names an opponent. Falls back to
              naming the home side for an admin previewing someone else's match. */}
          {playerEntryId ? (
            <span className={`pill ${playerEntryId === match.entry_a_id ? "green" : "purple"}`}>
              {playerEntryId === match.entry_a_id ? "You're Home" : "You're Away"}
            </span>
          ) : (
            <span className="pill green">{entryA?.label || "Entry A"} at Home</span>
          )}
        </div>
        <div className="mobile-match-main">
          <div className="play-by">
            <span>Play By</span>
            <strong>{formatShortDate(match.schedule_week_end)}</strong>
            <small>{formatWeekday(match.schedule_week_end)}</small>
          </div>
          <div className="mobile-match-opponent">
            <span>{match.round_label || `Round ${match.round}`}</span>
            <strong>vs {opponentEntry?.label || entryB?.label || "Opponent"}</strong>
            <small className="subtle">
              {playerEntryId
                ? playerEntryId === match.entry_a_id
                  ? "You host this one"
                  : `${opponentEntry?.label || "Your opponent"} hosts this one`
                : null}
            </small>
            <MatchScore
              sets={matchSets}
              status={match.status}
              winnerLabel={match.winner_entry_id === match.entry_a_id ? entryA?.label : match.winner_entry_id === match.entry_b_id ? entryB?.label : undefined}
            />
            <ContactLinks players={opponentPlayers} />
            <button className="add-result-button" disabled={!canOpenResult} onClick={() => setShowScoreForm((current) => !current)} type="button">
              <Send size={20} aria-hidden />
              Add Result
            </button>
          </div>
        </div>
        {!canScoreUpdate && match.restrict_score_updates ? <p className="subtle">Score updates are outside the allowed schedule window.</p> : null}
        {!canForfeit && !canForfeitForEntryA && !canForfeitForEntryB && forfeitReason ? <p className="subtle">{forfeitReason}</p> : null}
        {showScoreForm ? (
          <form className="score-entry-panel" onSubmit={handleScoreSubmit}>
            <div className="score-entry-topbar">
              <button className="score-back" onClick={() => setShowScoreForm(false)} type="button">
                Back
              </button>
              <strong>Add Score</strong>
              <span />
            </div>
            <div className="score-entry-card">
              <p>Forfeit Game?</p>
              <div className="choice-row">
                <button className={`choice-dot ${resultMode === "forfeit" ? "selected" : ""}`} onClick={() => setResultMode("forfeit")} type="button">
                  {resultMode === "forfeit" ? <Check size={18} aria-hidden /> : null}
                </button>
                <span>Yes</span>
                <button className={`choice-dot ${resultMode === "score" ? "selected" : ""}`} onClick={() => setResultMode("score")} type="button">
                  {resultMode === "score" ? <Check size={18} aria-hidden /> : null}
                </button>
                <span>No</span>
              </div>
              {isAdminPreview && resultMode === "forfeit" ? (
                <label className="field">
                  <span>Forfeit winner</span>
                  <select onChange={(event) => setForfeitWinnerId(event.target.value)} value={forfeitWinnerId}>
                    <option value="">Select winner</option>
                    <option value={match.entry_a_id}>{entryA?.label || "Entry A"}</option>
                    <option value={match.entry_b_id}>{entryB?.label || "Entry B"}</option>
                  </select>
                </label>
              ) : null}
            </div>
            {resultMode === "score" ? (
              <ScoreGrid
                aLabel={entryA?.label || "A"}
                bLabel={entryB?.label || "B"}
                numberOfSets={match.number_of_sets}
                scoreForm={scoreForm}
                setScoreForm={setScoreForm}
                sport={sport}
                targetScore={match.target_score}
              />
            ) : null}
            <button
              className="score-save-button"
              disabled={submitting || claimingForfeit || (resultMode === "score" && !canEdit) || (resultMode === "forfeit" && !canSaveForfeit)}
              type="submit"
            >
              {submitting || claimingForfeit ? "Saving..." : "Save"}
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
