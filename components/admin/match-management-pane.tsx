"use client";

import { useState } from "react";
import { ClipboardX, Pencil } from "lucide-react";
import { deleteDivision, renameDivision, replaceMatchSets, swapMatchHomeAway, updateMatch } from "@/lib/admin-data";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";
import { MatchEditor } from "./match-editor";
import type { MatchEditPatch } from "./match-editor";
import type { MatchRow } from "@/lib/admin-data";
import { RosterPane } from "./roster-pane";

type MatchesTab = "roster" | "matches";

/**
 * Postgres reports the matches table's date checks by constraint name, e.g.
 * 'violates check constraint "matches_check2"', which tells an admin nothing.
 * MatchEditor validates these before saving, so this is only a backstop for a
 * path that skips it -- but an unreadable error is worse than no error, since
 * it looks like the save silently did nothing.
 */
function readableSaveError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("matches_check1")) return "The schedule week can't end before it starts.";
  if (message.includes("matches_check2")) return "The extension week has to start after the schedule week ends -- move both weeks when rescheduling a match.";
  if (message.includes("matches_check3")) return "The extension week can't end before it starts.";
  return message || "Could not save the match.";
}

export function MatchManagementPane({ admin }: { admin: AdminData }) {
  const [activeTab, setActiveTab] = useState<MatchesTab>("matches");
  const [savingMatchId, setSavingMatchId] = useState("");
  const [swappingMatchId, setSwappingMatchId] = useState("");
  const [message, setMessage] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [renamingDivision, setRenamingDivision] = useState(false);
  const [divisionNameDraft, setDivisionNameDraft] = useState("");
  const [savingDivisionName, setSavingDivisionName] = useState(false);
  const [deletingDivision, setDeletingDivision] = useState(false);

  async function saveMatch(match: MatchRow, sets: Array<{ setNumber: number; entryAScore: number; entryBScore: number }>, patch: MatchEditPatch) {
    if (!admin.supabase) return;
    setSavingMatchId(match.id);
    try {
      await replaceMatchSets(admin.supabase, match.id, sets);
      await updateMatch(admin.supabase, match.id, patch);
      await admin.reloadDivisions();
      setMessage("Match saved.");
    } catch (error) {
      setMessage(readableSaveError(error));
    } finally {
      setSavingMatchId("");
    }
  }

  async function swapHomeAway(match: MatchRow) {
    if (!admin.supabase) return;
    setSwappingMatchId(match.id);
    try {
      await swapMatchHomeAway(admin.supabase, match.id);
      await admin.reloadDivisions();
      setMessage("Home and away swapped. Any recorded set scores moved with them.");
    } catch (error) {
      setMessage(readableSaveError(error));
    } finally {
      setSwappingMatchId("");
    }
  }

  const filteredMatches =
    divisionFilter === "all" ? admin.matches : admin.matches.filter((match) => match.division_id === divisionFilter);
  const sortedMatches = [...filteredMatches].sort((a, b) => a.schedule_week_start.localeCompare(b.schedule_week_start) || a.round - b.round);
  const sport = admin.tournaments.find((tournament) => tournament.id === admin.selectedTournamentId)?.sport || "pickleball";
  const selectedDivision = admin.divisions.find((division) => division.id === divisionFilter);

  function handleTournamentFilterChange(tournamentId: string) {
    admin.setSelectedTournamentId(tournamentId);
    setDivisionFilter("all");
    setRenamingDivision(false);
  }

  function handleDivisionFilterChange(divisionId: string) {
    setDivisionFilter(divisionId);
    setRenamingDivision(false);
    setMessage("");
  }

  function startRenameDivision() {
    if (!selectedDivision) return;
    setDivisionNameDraft(selectedDivision.name);
    setRenamingDivision(true);
  }

  async function saveDivisionName() {
    if (!admin.supabase || !selectedDivision || !divisionNameDraft.trim()) return;
    setSavingDivisionName(true);
    try {
      await renameDivision(admin.supabase, selectedDivision.id, divisionNameDraft.trim());
      await admin.reloadDivisions();
      setRenamingDivision(false);
      setMessage("Division renamed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not rename the division.");
    } finally {
      setSavingDivisionName(false);
    }
  }

  async function removeDivision() {
    if (!admin.supabase || !selectedDivision) return;
    setDeletingDivision(true);
    try {
      await deleteDivision(admin.supabase, selectedDivision.id);
      await admin.reloadDivisions();
      setDivisionFilter("all");
      setMessage("Division deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete the division.");
    } finally {
      setDeletingDivision(false);
    }
  }

  return (
    <div className="stack">
      <SegmentedControl
        ariaLabel="Matches section"
        onChange={setActiveTab}
        options={[
          { value: "roster", label: "Substitutions" },
          { value: "matches", label: "Match Management" }
        ]}
        value={activeTab}
      />

      {activeTab === "roster" ? <RosterPane admin={admin} /> : null}

      {activeTab === "matches" ? (
      <div className="card stack">
        <div className="section-title">
          <h2>Match Management</h2>
        </div>
        {admin.tournaments.length > 0 ? (
          <div className="field-row">
            <label className="field">
              <span>Tournament</span>
              <select onChange={(event) => handleTournamentFilterChange(event.target.value)} value={admin.selectedTournamentId}>
                {admin.tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Division</span>
              <select onChange={(event) => handleDivisionFilterChange(event.target.value)} value={divisionFilter}>
                <option value="all">All divisions</option>
                {admin.divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {selectedDivision ? (
          <div className="spread">
            {renamingDivision ? (
              <div className="field-row">
                <label className="field">
                  <span className="visually-hidden">Division name</span>
                  <input onChange={(event) => setDivisionNameDraft(event.target.value)} value={divisionNameDraft} />
                </label>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-2)" }}>
                  <button className="button small" disabled={savingDivisionName || !divisionNameDraft.trim()} onClick={saveDivisionName} type="button">
                    {savingDivisionName ? "Saving..." : "Save"}
                  </button>
                  <button className="button secondary small" disabled={savingDivisionName} onClick={() => setRenamingDivision(false)} type="button">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="toolbar">
                <button className="button secondary small" onClick={startRenameDivision} type="button">
                  <Pencil size={14} aria-hidden />
                  Rename division
                </button>
                <ConfirmButton
                  confirmLabel={`Delete "${selectedDivision.name}"?`}
                  disabled={deletingDivision}
                  key={selectedDivision.id}
                  onConfirm={removeDivision}
                />
              </div>
            )}
          </div>
        ) : null}

        <StatusBanner message={message} />
        {sortedMatches.length > 0 ? (
          <div className="match-list">
            {sortedMatches.map((match) => {
              const division = admin.divisions.find((item) => item.id === match.division_id);
              const entryA = admin.divisionEntries.find((entry) => entry.id === match.entry_a_id);
              const entryB = admin.divisionEntries.find((entry) => entry.id === match.entry_b_id);
              const sets = admin.matchSets.filter((set) => set.match_id === match.id);
              return (
                <MatchEditor
                  divisionName={division?.name || "Division"}
                  entryA={entryA}
                  entryB={entryB}
                  key={match.id}
                  match={match}
                  onSave={saveMatch}
                  onSwapHomeAway={swapHomeAway}
                  saving={savingMatchId === match.id}
                  swapping={swappingMatchId === match.id}
                  sets={sets}
                  sport={sport}
                />
              );
            })}
          </div>
        ) : admin.matches.length > 0 ? (
          <EmptyState icon={<ClipboardX size={24} aria-hidden />} title="No matches in this division" body="Choose a different division filter." />
        ) : (
          <EmptyState icon={<ClipboardX size={24} aria-hidden />} title="No matches yet" body="Generate a schedule from the Tournaments tab first." />
        )}
      </div>
      ) : null}
    </div>
  );
}
