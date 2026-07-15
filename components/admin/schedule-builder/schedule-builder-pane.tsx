"use client";

import { useEffect, useMemo, useState } from "react";
import { createDivision, createTeam as createTeamRow, deleteDivision, deleteMatches, insertDivisionEntries, insertMatches } from "@/lib/admin-data";
import type { NewMatchRow } from "@/lib/admin-data";
import { formatDivisionName } from "@/lib/format";
import { generateEliminatorSchedule, generateRoundRobinSchedule } from "@/lib/league-rules";
import type { DivisionEntry, DivisionFormat } from "@/lib/types";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SwitchField } from "@/components/ui/switch-field";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "../use-admin-data";
import { useScheduleBuilder } from "./use-schedule-builder";
import { EntityPicker } from "./entity-picker";
import { ManualMatchups } from "./manual-matchups";

export function ScheduleBuilderPane({ admin }: { admin: AdminData }) {
  const tournament = admin.tournaments.find((item) => item.id === admin.selectedTournamentId);
  const builder = useScheduleBuilder(tournament?.start_date || new Date().toISOString().slice(0, 10));
  const { state } = builder;
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: "", playerAId: "", playerBId: "" });

  useEffect(() => {
    if (tournament) builder.reset(tournament.start_date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  const divisionMatches = admin.matches.filter((match) => match.division_id === state.divisionId);
  const canReplaceExisting = divisionMatches.length === 0 || divisionMatches.every((match) => match.status === "scheduled" || match.status === "cancelled");

  const ratingOptions = useMemo(
    () => Array.from(new Set(admin.players.map((player) => player.rating).filter((rating): rating is string => Boolean(rating)))).sort(),
    [admin.players]
  );

  function selectDivision(divisionId: string) {
    if (!divisionId) {
      builder.reset(tournament?.start_date || state.startDate);
      return;
    }
    const division = admin.divisions.find((item) => item.id === divisionId);
    if (!division) return;
    const existingEntries = admin.divisionEntries.filter((entry) => entry.division_id === divisionId);
    builder.patch({
      divisionId,
      name: division.name,
      skillLevel: division.skill_level,
      format: division.format,
      selectedPlayerIds: division.format === "singles" ? existingEntries.filter((entry) => entry.player_id).map((entry) => entry.player_id as string) : [],
      selectedTeamIds: division.format === "doubles" ? existingEntries.filter((entry) => entry.team_id).map((entry) => entry.team_id as string) : []
    });
  }

  async function createTeam() {
    if (!admin.supabase || !admin.adminUser) return;
    if (!teamForm.playerAId || !teamForm.playerBId || teamForm.playerAId === teamForm.playerBId) {
      setMessage("Choose two different players for the team.");
      return;
    }
    const playerA = admin.players.find((player) => player.id === teamForm.playerAId);
    const playerB = admin.players.find((player) => player.id === teamForm.playerBId);
    if (!playerA || !playerB) return;
    const name = teamForm.name.trim() || `${playerA.display_name} / ${playerB.display_name}`;

    setCreatingTeam(true);
    try {
      const team = await createTeamRow(admin.supabase, { clubId: admin.adminUser.club_id, name, playerAId: teamForm.playerAId, playerBId: teamForm.playerBId });
      await admin.reloadTeams();
      builder.patch({ selectedTeamIds: [...state.selectedTeamIds, team.id] });
      setTeamForm({ name: "", playerAId: "", playerBId: "" });
      setMessage("Team created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the team.");
    } finally {
      setCreatingTeam(false);
    }
  }

  async function removeDivision(divisionId: string) {
    if (!admin.supabase) return;
    try {
      await deleteDivision(admin.supabase, divisionId);
      if (state.divisionId === divisionId) builder.reset(tournament?.start_date || state.startDate);
      await admin.reloadDivisions();
      setMessage("Division deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete the division.");
    }
  }

  async function generateSchedule() {
    if (!admin.supabase || !admin.adminUser || !tournament) return;
    if (!state.name.trim()) {
      setMessage("Enter a schedule name.");
      return;
    }

    const selectedIds = state.format === "doubles" ? state.selectedTeamIds : state.selectedPlayerIds;
    if (state.scheduleType !== "manual" && selectedIds.length < 2) {
      setMessage("Select at least two entries.");
      return;
    }

    const validManualRows = state.manualMatches.filter((row) => row.aId && row.bId && row.aId !== row.bId);
    if (state.scheduleType === "manual" && validManualRows.length === 0) {
      setMessage("Add at least one valid manual matchup.");
      return;
    }

    if (divisionMatches.length > 0 && !state.replaceExisting) {
      setMessage("Turn on \"Replace existing schedule\" to regenerate this division's matches.");
      return;
    }
    if (divisionMatches.length > 0 && state.replaceExisting && !canReplaceExisting) {
      setMessage("This schedule has results or forfeits recorded and can't be replaced.");
      return;
    }

    const wasNewDivision = !state.divisionId;

    setGenerating(true);
    try {
      const division = state.divisionId
        ? admin.divisions.find((item) => item.id === state.divisionId)!
        : await createDivision(admin.supabase, {
            tournamentId: tournament.id,
            name: state.name.trim() || formatDivisionName(state.skillLevel, state.format),
            skillLevel: state.skillLevel.trim() || "All Levels",
            format: state.format
          });

      const existingEntries = admin.divisionEntries.filter((entry) => entry.division_id === division.id);
      const missingRows = selectedIds
        .filter((id) => !existingEntries.some((entry) => (state.format === "doubles" ? entry.team_id === id : entry.player_id === id)))
        .map((id) => {
          if (state.format === "doubles") {
            const team = admin.teams.find((item) => item.id === id)!;
            return { division_id: division.id, label: team.name, team_id: id };
          }
          const player = admin.players.find((item) => item.id === id)!;
          return { division_id: division.id, label: player.display_name, player_id: id };
        });
      const insertedEntries = await insertDivisionEntries(admin.supabase, missingRows);
      const allEntries = [...existingEntries, ...insertedEntries];
      const selectedEntries = allEntries.filter((entry) =>
        state.format === "doubles" ? selectedIds.includes(entry.team_id || "") : selectedIds.includes(entry.player_id || "")
      );

      const targetScore = state.changeWinningScore ? Number(state.targetScore) || 11 : 11;
      const numberOfSets = Number(state.numberOfSets) || 3;
      const optionsBundle = {
        target_score: targetScore,
        number_of_sets: numberOfSets,
        restrict_score_updates: state.restrictScoreUpdates,
        score_update_before_days: state.restrictScoreUpdates ? Number(state.scoreUpdateBeforeDays) || 0 : 0,
        score_update_after_days: state.restrictScoreUpdates ? Number(state.scoreUpdateAfterDays) || 0 : 0,
        allow_forfeit: state.allowForfeit,
        forfeit_before_days: state.allowForfeit ? Number(state.forfeitBeforeDays) || 0 : 0,
        forfeit_after_days: state.allowForfeit ? Number(state.forfeitAfterDays) || 0 : 0
      };

      let newRows: NewMatchRow[] = [];

      if (state.scheduleType === "manual") {
        const findEntryId = (selectionId: string) =>
          selectedEntries.find((entry) => (state.format === "doubles" ? entry.team_id === selectionId : entry.player_id === selectionId))?.id;
        const weekStart = state.startDate;
        const weekEnd = shiftDate(weekStart, 6);
        const extStart = shiftDate(weekStart, 7);
        const extEnd = shiftDate(weekStart, 13);
        newRows = validManualRows.flatMap((row, index) => {
          const entryAId = findEntryId(row.aId);
          const entryBId = findEntryId(row.bId);
          if (!entryAId || !entryBId) return [];
          return [
            {
              division_id: division.id,
              round: index + 1,
              round_label: "Manual",
              entry_a_id: entryAId,
              entry_b_id: entryBId,
              schedule_week_start: weekStart,
              schedule_week_end: weekEnd,
              extension_week_start: extStart,
              extension_week_end: extEnd,
              status: "scheduled" as const,
              ...optionsBundle
            }
          ];
        });
      } else {
        const domainEntries: DivisionEntry[] = selectedEntries.map((entry) => ({ id: entry.id, divisionId: entry.division_id, label: entry.label, playerIds: [] }));
        const generator = state.scheduleType === "eliminator" ? generateEliminatorSchedule : generateRoundRobinSchedule;
        const generated = generator({ divisionId: division.id, entries: domainEntries, startDate: state.startDate, endDate: tournament.end_date });
        newRows = generated.map((match) => ({
          division_id: division.id,
          round: match.round,
          round_label: match.roundLabel,
          entry_a_id: match.entryAId,
          entry_b_id: match.entryBId,
          schedule_week_start: match.scheduleWeekStart,
          schedule_week_end: match.scheduleWeekEnd,
          extension_week_start: match.extensionWeekStart,
          extension_week_end: match.extensionWeekEnd,
          status: "scheduled" as const,
          ...optionsBundle
        }));
      }

      if (newRows.length === 0) {
        setMessage("That produced no playable rounds in the tournament date range. Try an earlier start date or a longer tournament window.");
        setGenerating(false);
        return;
      }

      await insertMatches(admin.supabase, newRows);
      if (divisionMatches.length > 0 && state.replaceExisting) {
        await deleteMatches(admin.supabase, divisionMatches.map((match) => match.id));
      }

      await admin.reloadDivisions();
      setMessage(
        `Schedule generated: ${newRows.length} match${newRows.length === 1 ? "" : "es"}.` +
          (wasNewDivision ? " Set up another division for this tournament, or switch tabs when you're done." : "")
      );
      if (wasNewDivision) builder.reset(tournament.start_date);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate the schedule.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="card stack">
      <div className="section-title">
        <h2>Schedule Builder</h2>
      </div>

      {state.step === "setup" ? (
        <div className="form-grid">
          <div className="spread">
            <label className="field">
              <span>Select Level</span>
              <select onChange={(event) => selectDivision(event.target.value)} value={state.divisionId}>
                <option value="">Create new schedule</option>
                {admin.divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </label>
            {state.divisionId ? (
              <ConfirmButton
                confirmLabel={`Delete${divisionMatches.length > 0 ? ` (${divisionMatches.length} match${divisionMatches.length === 1 ? "" : "es"})` : ""}?`}
                key={state.divisionId}
                onConfirm={() => removeDivision(state.divisionId)}
              />
            ) : null}
          </div>

          <div className="field-row">
            <label className="field">
              <span>Schedule Name</span>
              <input onChange={(event) => builder.patch({ name: event.target.value })} value={state.name} />
            </label>
            <label className="field">
              <span>Skill Level</span>
              <input onChange={(event) => builder.patch({ skillLevel: event.target.value })} value={state.skillLevel} />
            </label>
          </div>

          <label className="field">
            <span>Number of Sets</span>
            <input max={3} min={1} onChange={(event) => builder.patch({ numberOfSets: event.target.value })} type="number" value={state.numberOfSets} />
          </label>

          <label className="field">
            <span>Schedule Type</span>
            <SegmentedControl
              ariaLabel="Schedule type"
              onChange={(value) => builder.patch({ scheduleType: value })}
              options={[
                { value: "round_robin", label: "League" },
                { value: "eliminator", label: "Playoff" },
                { value: "manual", label: "Manual" }
              ]}
              value={state.scheduleType}
            />
          </label>

          <label className="field">
            <span>Game Type</span>
            <SegmentedControl<DivisionFormat>
              ariaLabel="Game type"
              onChange={(value) => builder.patch({ format: value, divisionId: "" })}
              options={[
                { value: "singles", label: "Singles" },
                { value: "doubles", label: "Doubles" }
              ]}
              value={state.format}
            />
          </label>

          <label className="field">
            <span>Start Date</span>
            <input onChange={(event) => builder.patch({ startDate: event.target.value })} type="date" value={state.startDate} />
          </label>

          <SwitchField label="Restrict Score Updates" checked={state.restrictScoreUpdates} onChange={(checked) => builder.patch({ restrictScoreUpdates: checked })}>
            <div className="field-row">
              <label className="field">
                <span>Days before game date</span>
                <input min={0} onChange={(event) => builder.patch({ scoreUpdateBeforeDays: event.target.value })} type="number" value={state.scoreUpdateBeforeDays} />
              </label>
              <label className="field">
                <span>Days after game date</span>
                <input min={0} onChange={(event) => builder.patch({ scoreUpdateAfterDays: event.target.value })} type="number" value={state.scoreUpdateAfterDays} />
              </label>
            </div>
          </SwitchField>

          <SwitchField label="Allow Game Forfeit" checked={state.allowForfeit} onChange={(checked) => builder.patch({ allowForfeit: checked })}>
            <div className="field-row">
              <label className="field">
                <span>Days before game date</span>
                <input min={0} onChange={(event) => builder.patch({ forfeitBeforeDays: event.target.value })} type="number" value={state.forfeitBeforeDays} />
              </label>
              <label className="field">
                <span>Days after game date</span>
                <input min={0} onChange={(event) => builder.patch({ forfeitAfterDays: event.target.value })} type="number" value={state.forfeitAfterDays} />
              </label>
            </div>
          </SwitchField>

          <SwitchField label="Change Winning Score" checked={state.changeWinningScore} onChange={(checked) => builder.patch({ changeWinningScore: checked })}>
            <label className="field">
              <span>Winning Score</span>
              <input min={1} onChange={(event) => builder.patch({ targetScore: event.target.value })} type="number" value={state.targetScore} />
            </label>
          </SwitchField>

          <StatusBanner message={message} />

          <button className="button" disabled={!admin.selectedTournamentId || !state.name.trim()} onClick={() => builder.patch({ step: "entries" })} type="button">
            Next
          </button>
        </div>
      ) : (
        <div className="stack">
          <div className="spread">
            <div>
              <strong>{state.name}</strong>
              <p className="subtle">
                {state.scheduleType} · {state.format}
              </p>
            </div>
            <button className="button secondary small" onClick={() => builder.patch({ step: "setup" })} type="button">
              Back
            </button>
          </div>

          {state.format === "doubles" ? (
            <div className="stack">
              <h3>Build a team</h3>
              <div className="field-row">
                <label className="field">
                  <span>Team name (optional)</span>
                  <input onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))} value={teamForm.name} />
                </label>
                <label className="field">
                  <span>Player 1</span>
                  <select onChange={(event) => setTeamForm((current) => ({ ...current, playerAId: event.target.value }))} value={teamForm.playerAId}>
                    <option value="">Select</option>
                    {admin.players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Player 2</span>
                  <select onChange={(event) => setTeamForm((current) => ({ ...current, playerBId: event.target.value }))} value={teamForm.playerBId}>
                    <option value="">Select</option>
                    {admin.players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button secondary small" disabled={creatingTeam} onClick={createTeam} type="button">
                  Create team
                </button>
              </div>

              <EntityPicker
                emptyText="No teams match your filters yet."
                getId={(team) => team.id}
                getLabel={(team) => team.name}
                items={admin.teams}
                onClearAll={() => builder.patch({ selectedTeamIds: [] })}
                onClearVisible={builder.clearVisibleTeams}
                onSearchChange={(value) => builder.patch({ teamSearch: value })}
                onSelectVisible={builder.selectVisibleTeams}
                onToggle={builder.toggleTeam}
                onToggleShowSelectedOnly={(value) => builder.patch({ showSelectedTeamsOnly: value })}
                search={state.teamSearch}
                selectedIds={state.selectedTeamIds}
                showSelectedOnly={state.showSelectedTeamsOnly}
              />
            </div>
          ) : (
            <EntityPicker
              emptyText="No players match your filters yet."
              extraFilter={
                <label className="field">
                  <span className="visually-hidden">Rating</span>
                  <select onChange={(event) => builder.patch({ ratingFilter: event.target.value })} value={state.ratingFilter}>
                    <option value="all">All ratings</option>
                    {ratingOptions.map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}
                      </option>
                    ))}
                  </select>
                </label>
              }
              getId={(player) => player.id}
              getLabel={(player) => player.display_name}
              getSublabel={(player) => player.rating || undefined}
              items={admin.players.filter((player) => state.ratingFilter === "all" || player.rating === state.ratingFilter)}
              onClearAll={() => builder.patch({ selectedPlayerIds: [] })}
              onClearVisible={builder.clearVisiblePlayers}
              onSearchChange={(value) => builder.patch({ playerSearch: value })}
              onSelectVisible={builder.selectVisiblePlayers}
              onToggle={builder.togglePlayer}
              onToggleShowSelectedOnly={(value) => builder.patch({ showSelectedPlayersOnly: value })}
              search={state.playerSearch}
              selectedIds={state.selectedPlayerIds}
              showSelectedOnly={state.showSelectedPlayersOnly}
            />
          )}

          {state.scheduleType === "manual" ? (
            <ManualMatchups
              matches={state.manualMatches}
              onAdd={builder.addManualMatch}
              onChange={builder.updateManualMatch}
              onRemove={builder.removeManualMatch}
              options={(state.format === "doubles" ? admin.teams.filter((team) => state.selectedTeamIds.includes(team.id)) : admin.players.filter((player) => state.selectedPlayerIds.includes(player.id))).map(
                (item) => ({ id: item.id, label: "name" in item ? item.name : item.display_name })
              )}
            />
          ) : null}

          {divisionMatches.length > 0 ? (
            <SwitchField
              label={`Replace existing schedule (${divisionMatches.length} match${divisionMatches.length === 1 ? "" : "es"})`}
              checked={state.replaceExisting}
              onChange={(checked) => builder.patch({ replaceExisting: checked })}
            >
              {!canReplaceExisting ? (
                <p className="subtle">This division has results or forfeits recorded, so its schedule can't be replaced.</p>
              ) : null}
            </SwitchField>
          ) : null}

          <StatusBanner message={message} />

          <div className="toolbar">
            <button className="button" disabled={generating} onClick={generateSchedule} type="button">
              {generating ? "Generating..." : "Generate schedule"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function shiftDate(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
