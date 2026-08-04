"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Search, UserCog } from "lucide-react";
import { listEntriesForTeam, replaceDivisionEntryPlayer, replaceTeamMember } from "@/lib/admin-data";
import type { DivisionEntryRow, MatchRow } from "@/lib/admin-data";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import type { Sport } from "@/lib/types";
import type { AdminData } from "./use-admin-data";

/**
 * Swap a player out mid-tournament (injury, withdrawal) without disturbing the
 * generated schedule -- matches reference the entry or team, not the player, so
 * the fixtures survive the change.
 *
 * Two very different operations hide behind that one idea, which is why doubles
 * used to feel unpredictable:
 *   singles -- rewrites one division_entries row, so it touches one division.
 *   doubles -- rewrites team_members, so it follows the TEAM into every division
 *              and tournament it is entered in.
 * The preview below spells out which matches each one actually hits before
 * anything is written.
 */
export function RosterPane({ admin }: { admin: AdminData }) {
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");
  const [replacementByKey, setReplacementByKey] = useState<Record<string, string>>({});
  const [sportFilter, setSportFilter] = useState<Sport | "all">("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [teamReach, setTeamReach] = useState<Record<string, DivisionEntryRow[]>>({});

  const sportTournaments = admin.tournaments.filter((tournament) => sportFilter === "all" || tournament.sport === sportFilter);
  const availableSports = Array.from(new Set(admin.tournaments.map((tournament) => tournament.sport)));
  const selectedTournament = admin.tournaments.find((tournament) => tournament.id === admin.selectedTournamentId);

  const divisionIds = new Set(admin.divisions.map((division) => division.id));
  const scopedDivisions = divisionFilter === "all" ? admin.divisions : admin.divisions.filter((division) => division.id === divisionFilter);
  const scopedDivisionIds = new Set(scopedDivisions.map((division) => division.id));
  const entries = admin.divisionEntries.filter((entry) => divisionIds.has(entry.division_id) && scopedDivisionIds.has(entry.division_id));

  const query = search.trim().toLowerCase();
  const playerName = (playerId: string | null) => admin.players.find((player) => player.id === playerId)?.display_name || "";

  // Load where each team on screen is entered, so a doubles swap can say up
  // front if it reaches divisions the admin isn't currently looking at.
  const teamIdsOnScreen = Array.from(new Set(entries.flatMap((entry) => (entry.team_id ? [entry.team_id] : []))));
  const teamIdsKey = teamIdsOnScreen.join(",");
  useEffect(() => {
    if (!admin.supabase || teamIdsOnScreen.length === 0) return;
    let cancelled = false;
    void (async () => {
      const pairs = await Promise.all(
        teamIdsOnScreen.map(async (teamId) => [teamId, await listEntriesForTeam(admin.supabase!, teamId)] as const)
      );
      if (!cancelled) setTeamReach(Object.fromEntries(pairs));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamIdsKey]);

  function handleSportChange(value: string) {
    setSportFilter(value as Sport | "all");
    setDivisionFilter("all");
    const stillValid = admin.tournaments.find(
      (tournament) => tournament.id === admin.selectedTournamentId && (value === "all" || tournament.sport === value)
    );
    if (!stillValid) {
      const first = admin.tournaments.find((tournament) => value === "all" || tournament.sport === value);
      if (first) admin.setSelectedTournamentId(first.id);
    }
  }

  function handleTournamentChange(value: string) {
    admin.setSelectedTournamentId(value);
    setDivisionFilter("all");
    setReplacementByKey({});
    setMessage("");
  }

  function matchesForEntry(entryId: string) {
    return admin.matches.filter((match) => match.entry_a_id === entryId || match.entry_b_id === entryId);
  }

  function opponentLabel(match: MatchRow, entryId: string) {
    const otherId = match.entry_a_id === entryId ? match.entry_b_id : match.entry_a_id;
    return admin.divisionEntries.find((entry) => entry.id === otherId)?.label || "Opponent";
  }

  function divisionName(divisionId: string) {
    return admin.divisions.find((division) => division.id === divisionId)?.name || "Division";
  }

  async function replaceSingles(entry: DivisionEntryRow, newPlayerId: string) {
    const newPlayer = admin.players.find((player) => player.id === newPlayerId);
    if (!admin.supabase || !newPlayer) return;
    setSavingKey(entry.id);
    setMessage("");
    try {
      await replaceDivisionEntryPlayer(admin.supabase, entry.id, newPlayerId, newPlayer.display_name);
      await admin.reloadDivisions();
      setReplacementByKey((current) => ({ ...current, [entry.id]: "" }));
      setMessage(`${entry.label} replaced with ${newPlayer.display_name}. Their fixtures kept the same dates and opponents.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not replace the player.");
    } finally {
      setSavingKey("");
    }
  }

  async function replaceDoubles(teamId: string, oldPlayerId: string, newPlayerId: string, key: string) {
    const newPlayer = admin.players.find((player) => player.id === newPlayerId);
    if (!admin.supabase || !newPlayer) return;
    setSavingKey(key);
    setMessage("");
    try {
      await replaceTeamMember(admin.supabase, teamId, oldPlayerId, newPlayerId);
      await admin.reloadTeams();
      await admin.reloadDivisions();
      setReplacementByKey((current) => ({ ...current, [key]: "" }));
      setMessage(`${playerName(oldPlayerId)} replaced with ${newPlayer.display_name} on this team.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not replace the player.");
    } finally {
      setSavingKey("");
    }
  }

  /** Matches the change will land on, with the outgoing name struck out and the incoming one alongside. */
  function MatchPreview({ entryIds, oldName, newName, teamMode }: { entryIds: string[]; oldName: string; newName: string; teamMode: boolean }) {
    const affected = admin.matches.filter((match) => entryIds.includes(match.entry_a_id) || entryIds.includes(match.entry_b_id));
    if (affected.length === 0) {
      return <p className="subtle">No matches are scheduled for this entry yet, so only the roster changes.</p>;
    }
    return (
      <div className="sub-preview">
        <p className="sub-preview-title">
          {affected.length} match{affected.length === 1 ? "" : "es"} affected
        </p>
        <div className="sub-preview-change">
          <span className="sub-old">{oldName}</span>
          <ArrowRight size={13} aria-hidden />
          <span className="sub-new">{newName}</span>
        </div>
        <ul className="sub-preview-list">
          {affected.map((match) => {
            const mine = entryIds.includes(match.entry_a_id) ? match.entry_a_id : match.entry_b_id;
            return (
              <li key={match.id}>
                <span className="subtle">
                  {divisionName(match.division_id)} &middot; {match.round_label || `Round ${match.round}`} &middot; {match.schedule_week_start}
                </span>
                <span>
                  {teamMode ? (
                    <>
                      <strong>{admin.divisionEntries.find((entry) => entry.id === mine)?.label}</strong>{" "}
                      <span className="subtle">
                        (<span className="sub-old">{oldName}</span> <span className="sub-new">{newName}</span>)
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="sub-old">{oldName}</span> <span className="sub-new">{newName}</span>
                    </>
                  )}{" "}
                  <span className="subtle">vs</span> {opponentLabel(match, mine)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const singlesEntries = entries.filter((entry) => entry.player_id);
  const teamEntries = entries.filter((entry) => entry.team_id);
  const teamsOnScreen = Array.from(new Set(teamEntries.map((entry) => entry.team_id as string)));

  const visibleSingles = singlesEntries.filter((entry) => !query || entry.label.toLowerCase().includes(query));
  const visibleTeams = teamsOnScreen.filter((teamId) => {
    if (!query) return true;
    const team = admin.teams.find((item) => item.id === teamId);
    if (team?.name.toLowerCase().includes(query)) return true;
    return admin.teamMembers.filter((member) => member.team_id === teamId).some((member) => playerName(member.player_id).toLowerCase().includes(query));
  });

  const nothingToShow = visibleSingles.length === 0 && visibleTeams.length === 0;

  return (
    <div className="card stack">
      <div className="section-title">
        <h2>Substitutions</h2>
      </div>
      <p className="subtle">
        Swap a player out mid-tournament for an injury or withdrawal. Their scheduled matches keep the same dates and opponents -- only who plays
        changes.
      </p>

      <div className="field-row">
        <label className="field">
          <span>Sport</span>
          <select onChange={(event) => handleSportChange(event.target.value)} value={sportFilter}>
            <option value="all">All sports</option>
            {availableSports.map((sport) => (
              <option key={sport} value={sport}>
                {sport[0].toUpperCase() + sport.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tournament</span>
          <select onChange={(event) => handleTournamentChange(event.target.value)} value={admin.selectedTournamentId}>
            {sportTournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
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
        <label className="field">
          <span>Find a player</span>
          <div className="input-with-icon">
            <Search size={16} aria-hidden />
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Search by player or team" value={search} />
          </div>
        </label>
      </div>

      <StatusBanner message={message} />

      {!selectedTournament ? (
        <EmptyState icon={<UserCog size={24} aria-hidden />} title="Pick a tournament" body="Choose a tournament above to see who is entered." />
      ) : nothingToShow ? (
        <EmptyState
          icon={<UserCog size={24} aria-hidden />}
          title={query ? "Nobody matches that search" : "No entries yet"}
          body={query ? "Try a different name." : "Generate a schedule from the Tournaments tab first."}
        />
      ) : (
        <div className="stack">
          {visibleSingles.map((entry) => {
            const chosen = replacementByKey[entry.id] || "";
            const takenElsewhere = new Set(
              admin.divisionEntries
                .filter((item) => item.division_id === entry.division_id && item.id !== entry.id && item.player_id)
                .map((item) => item.player_id as string)
            );
            const options = admin.players.filter((player) => !takenElsewhere.has(player.id) && player.id !== entry.player_id);
            const chosenName = admin.players.find((player) => player.id === chosen)?.display_name || "";
            return (
              <div className="sub-row" key={entry.id}>
                <div className="sub-row-head">
                  <div>
                    <span className="pill blue">{divisionName(entry.division_id)}</span>
                    <strong className="sub-row-name">{entry.label}</strong>
                    <span className="subtle"> &middot; {matchesForEntry(entry.id).length} match(es)</span>
                  </div>
                  <div className="sub-row-action">
                    <select
                      aria-label={`Replacement for ${entry.label}`}
                      disabled={savingKey === entry.id}
                      onChange={(event) => setReplacementByKey((current) => ({ ...current, [entry.id]: event.target.value }))}
                      value={chosen}
                    >
                      <option value="">Replace with...</option>
                      {options.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.display_name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="button small"
                      disabled={savingKey === entry.id || !chosen}
                      onClick={() => replaceSingles(entry, chosen)}
                      type="button"
                    >
                      {savingKey === entry.id ? "Replacing..." : "Replace"}
                    </button>
                  </div>
                </div>
                {chosen ? <MatchPreview entryIds={[entry.id]} newName={chosenName} oldName={entry.label} teamMode={false} /> : null}
              </div>
            );
          })}

          {visibleTeams.map((teamId) => {
            const team = admin.teams.find((item) => item.id === teamId);
            const members = admin.teamMembers.filter((member) => member.team_id === teamId);
            const reach = teamReach[teamId] || [];
            const reachDivisions = Array.from(new Set(reach.map((entry) => entry.division_id)));
            const outsideView = reachDivisions.filter((id) => !divisionIds.has(id)).length;
            const teamEntryIds = reach.length > 0 ? reach.map((entry) => entry.id) : teamEntries.filter((entry) => entry.team_id === teamId).map((entry) => entry.id);

            return (
              <div className="sub-row" key={teamId}>
                <div className="sub-row-head">
                  <div>
                    {teamEntries
                      .filter((entry) => entry.team_id === teamId)
                      .map((entry) => (
                        <span className="pill blue" key={entry.id}>
                          {divisionName(entry.division_id)}
                        </span>
                      ))}
                    <strong className="sub-row-name">{team?.name || "Team"}</strong>
                  </div>
                </div>
                {outsideView > 0 ? (
                  <p className="status-banner" data-tone="error">
                    This team is also entered in {outsideView} other division{outsideView === 1 ? "" : "s"}. Swapping a member changes the team
                    itself, so it applies there too.
                  </p>
                ) : null}
                <div className="sub-members">
                  {members.map((member) => {
                    const key = `${teamId}:${member.player_id}`;
                    const chosen = replacementByKey[key] || "";
                    const teammateIds = new Set(members.filter((item) => item.player_id !== member.player_id).map((item) => item.player_id));
                    const rosterPlayerIds = new Set(entries.flatMap((item) => (item.player_id ? [item.player_id] : [])));
                    const anyTeamPlayerIds = new Set(admin.teamMembers.map((item) => item.player_id));
                    const options = admin.players.filter(
                      (player) =>
                        player.id !== member.player_id && !teammateIds.has(player.id) && !rosterPlayerIds.has(player.id) && !anyTeamPlayerIds.has(player.id)
                    );
                    const chosenName = admin.players.find((player) => player.id === chosen)?.display_name || "";
                    return (
                      <div className="sub-member" key={key}>
                        <div className="sub-row-head">
                          <span className="sub-row-name">{playerName(member.player_id) || "Player"}</span>
                          <div className="sub-row-action">
                            <select
                              aria-label={`Replacement for ${playerName(member.player_id)}`}
                              disabled={savingKey === key}
                              onChange={(event) => setReplacementByKey((current) => ({ ...current, [key]: event.target.value }))}
                              value={chosen}
                            >
                              <option value="">Replace with...</option>
                              {options.map((player) => (
                                <option key={player.id} value={player.id}>
                                  {player.display_name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="button small"
                              disabled={savingKey === key || !chosen}
                              onClick={() => replaceDoubles(teamId, member.player_id, chosen, key)}
                              type="button"
                            >
                              {savingKey === key ? "Replacing..." : "Replace"}
                            </button>
                          </div>
                        </div>
                        {chosen ? (
                          <MatchPreview entryIds={teamEntryIds} newName={chosenName} oldName={playerName(member.player_id)} teamMode />
                        ) : null}
                      </div>
                    );
                  })}
                  {members.length === 0 ? <p className="subtle">This team has no roster members to swap (name-only team).</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
