"use client";

import { useState } from "react";
import { ClipboardX } from "lucide-react";
import { replaceMatchSets, updateMatch } from "@/lib/admin-data";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";
import { MatchEditor } from "./match-editor";
import type { MatchEditPatch } from "./match-editor";
import type { MatchRow } from "@/lib/admin-data";
import { RosterPane } from "./roster-pane";

export function MatchManagementPane({ admin }: { admin: AdminData }) {
  const [savingMatchId, setSavingMatchId] = useState("");
  const [message, setMessage] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("all");

  async function saveMatch(match: MatchRow, sets: Array<{ setNumber: number; entryAScore: number; entryBScore: number }>, patch: MatchEditPatch) {
    if (!admin.supabase) return;
    setSavingMatchId(match.id);
    try {
      await replaceMatchSets(admin.supabase, match.id, sets);
      await updateMatch(admin.supabase, match.id, patch);
      await admin.reloadDivisions();
      setMessage("Match saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the match.");
    } finally {
      setSavingMatchId("");
    }
  }

  const filteredMatches =
    divisionFilter === "all" ? admin.matches : admin.matches.filter((match) => match.division_id === divisionFilter);
  const sortedMatches = [...filteredMatches].sort((a, b) => a.schedule_week_start.localeCompare(b.schedule_week_start) || a.round - b.round);
  const sport = admin.tournaments.find((tournament) => tournament.id === admin.selectedTournamentId)?.sport || "pickleball";

  function handleTournamentFilterChange(tournamentId: string) {
    admin.setSelectedTournamentId(tournamentId);
    setDivisionFilter("all");
  }

  return (
    <div className="stack">
      <RosterPane admin={admin} />
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
              <select onChange={(event) => setDivisionFilter(event.target.value)} value={divisionFilter}>
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
                  saving={savingMatchId === match.id}
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
    </div>
  );
}
