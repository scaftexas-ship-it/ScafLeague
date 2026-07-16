"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Flag, Send } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  getCurrentAppUser,
  insertForfeitClaim,
  listDivisionEntries,
  listDivisionsForTournaments,
  listMatches,
  listStandings,
  listTournaments,
  replaceMatchSets,
  updateMatch
} from "@/lib/admin-data";
import type { DivisionEntryRow, DivisionRow, MatchRow, PlayerProfileRow, TeamMemberRow, TournamentRow } from "@/lib/admin-data";
import { listAllPlayersInClub, listEntriesForPlayerIds, listEntriesForTeamIds, listPlayerProfilesForUser, listTeamIdsForPlayerIds } from "@/lib/player-data";
import { getWinnerEntryId } from "@/lib/match-scoring";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import { MatchCard } from "./match-card";
import { PointsTable } from "./points-table";
import type { StandingRow } from "@/lib/admin-data";
import type { MatchSet, Sport } from "@/lib/types";

export function PlayerWorkspace() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [entries, setEntries] = useState<DivisionEntryRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [myEntryIds, setMyEntryIds] = useState<string[]>([]);
  const [myMatches, setMyMatches] = useState<MatchRow[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerProfileRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [message, setMessage] = useState("Loading player schedule...");
  const [sportFilter, setSportFilter] = useState<Sport | "all">("all");
  const [tournamentFilter, setTournamentFilter] = useState<string>("all");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    try {
      const appUser = await getCurrentAppUser(supabase);
      if (!appUser) {
        setMessage("Sign in to see your scheduled matches.");
        router.replace("/login");
        return;
      }
      if (appUser.access_disabled) {
        await supabase.auth.signOut();
        setMessage("Your login works, but this account has been disabled.");
        router.replace("/login");
        return;
      }

      const loadedTournaments = await listTournaments(supabase, appUser.club_id);
      if (loadedTournaments.length === 0) {
        setMessage("No tournament has been created yet.");
        return;
      }
      setTournaments(loadedTournaments);

      const loadedDivisions = await listDivisionsForTournaments(supabase, loadedTournaments.map((item) => item.id));
      setDivisions(loadedDivisions);
      const divisionIds = loadedDivisions.map((division) => division.id);
      if (divisionIds.length === 0) {
        setMessage("No schedules have been created yet.");
        return;
      }

      const loadedEntries = await listDivisionEntries(supabase, divisionIds);
      setEntries(loadedEntries);

      const [allMatches, standingRows] = await Promise.all([listMatches(supabase, divisionIds), listStandings(supabase, divisionIds)]);
      setMatches(allMatches);
      setStandings(standingRows);

      await loadContactDirectory(appUser.club_id, loadedEntries);

      const profiles = await listPlayerProfilesForUser(supabase, appUser.id);
      const profileIds = profiles.map((profile) => profile.id);
      const [directEntries, teamIds] = await Promise.all([listEntriesForPlayerIds(supabase, profileIds), listTeamIdsForPlayerIds(supabase, profileIds)]);
      const teamEntries = await listEntriesForTeamIds(supabase, teamIds);
      const entryIds = Array.from(new Set([...directEntries, ...teamEntries].map((entry) => entry.id)));
      setMyEntryIds(entryIds);

      if (entryIds.length > 0) {
        setMyMatches(allMatches.filter((match) => entryIds.includes(match.entry_a_id) || entryIds.includes(match.entry_b_id)));
        setMessage("Player schedule loaded.");
      } else if (appUser.role === "admin") {
        setMyMatches(allMatches);
        setMessage("Admin preview: showing all scheduled tournament matches.");
      } else {
        setMyMatches([]);
        setMessage("You are not assigned to any divisions yet. Tournament games are still visible below.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load your schedule.");
    }
  }

  async function loadContactDirectory(clubId: string, entryRows: DivisionEntryRow[]) {
    if (!supabase) return;
    const players = await listAllPlayersInClub(supabase, clubId);
    setAllPlayers(players);

    const teamIds = Array.from(new Set(entryRows.flatMap((entry) => (entry.team_id ? [entry.team_id] : []))));
    if (teamIds.length === 0) {
      setTeamMembers([]);
      return;
    }
    const { data } = await supabase.from("team_members").select("team_id, player_id").in("team_id", teamIds);
    setTeamMembers((data || []) as TeamMemberRow[]);
  }

  async function submitScore(match: MatchRow, sets: MatchSet[]) {
    if (!supabase) return;
    const winnerEntryId = getWinnerEntryId(
      { entryAId: match.entry_a_id, entryBId: match.entry_b_id, numberOfSets: match.number_of_sets },
      sets
    );
    if (!winnerEntryId) {
      setMessage("Enter a valid score with a clear winner.");
      return;
    }

    try {
      await replaceMatchSets(
        supabase,
        match.id,
        sets.map((set) => ({ setNumber: set.setNumber, entryAScore: set.entryAScore, entryBScore: set.entryBScore }))
      );
      const updated = await updateMatch(supabase, match.id, { status: "completed", winner_entry_id: winnerEntryId });
      applyMatchUpdate(updated);
      setMessage("Score submitted. Leaderboard updated.");
      await refreshStandings();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit the score.");
    }
  }

  async function claimForfeit(match: MatchRow, claimedByEntryId: string) {
    if (!supabase) return;
    const appUser = await getCurrentAppUser(supabase);
    if (!appUser) return;

    const opponentEntryId = match.entry_a_id === claimedByEntryId ? match.entry_b_id : match.entry_a_id;

    try {
      await insertForfeitClaim(supabase, { matchId: match.id, claimedByEntryId, opponentEntryId, createdBy: appUser.id });
      const updated = await updateMatch(supabase, match.id, {
        status: "forfeit",
        winner_entry_id: claimedByEntryId,
        forfeit_by_entry_id: claimedByEntryId
      });
      applyMatchUpdate(updated);
      setMessage("Forfeit recorded. Leaderboard updated.");
      await refreshStandings();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record the forfeit.");
    }
  }

  function applyMatchUpdate(updated: MatchRow) {
    setMatches((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setMyMatches((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function refreshStandings() {
    if (!supabase) return;
    const divisionIds = divisions.map((division) => division.id);
    setStandings(await listStandings(supabase, divisionIds));
  }

  function tournamentForDivision(divisionId: string) {
    const division = divisions.find((item) => item.id === divisionId);
    if (!division) return undefined;
    return tournaments.find((item) => item.id === division.tournament_id);
  }

  const availableSports = Array.from(new Set(tournaments.map((tournament) => tournament.sport)));
  const sportTournaments = tournaments.filter((tournament) => sportFilter === "all" || tournament.sport === sportFilter);
  const visibleTournamentIds = new Set(tournamentFilter === "all" ? sportTournaments.map((tournament) => tournament.id) : [tournamentFilter]);
  const visibleDivisionIds = new Set(divisions.filter((division) => visibleTournamentIds.has(division.tournament_id)).map((division) => division.id));

  function handleSportFilterChange(value: string) {
    setSportFilter(value as Sport | "all");
    setTournamentFilter("all");
  }

  const visibleMyMatches = myMatches.filter((match) => visibleDivisionIds.has(match.division_id));
  const visibleMatches = matches.filter((match) => visibleDivisionIds.has(match.division_id));
  const visibleDivisions = divisions.filter((division) => visibleDivisionIds.has(division.id));

  return (
    <>
      <section className="player-mobile-header">
        <div>
          <p className="eyebrow">{tournaments.length > 0 ? tournaments.map((item) => item.name).join(" · ") : "Tournament"}</p>
          <h1>My Schedule</h1>
          <StatusBanner testId="player-status" message={message} />
          {message.startsWith("Sign in") ? (
            <Link className="text-link" href="/login">
              Open login
            </Link>
          ) : null}
        </div>
      </section>

      {tournaments.length > 1 ? (
        <section className="card">
          <div className="field-row">
            <label className="field">
              <span>Sport</span>
              <select onChange={(event) => handleSportFilterChange(event.target.value)} value={sportFilter}>
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
              <select onChange={(event) => setTournamentFilter(event.target.value)} value={tournamentFilter}>
                <option value="all">All tournaments</option>
                {sportTournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      <section className="stack">
        <div className="card">
          <div className="section-title">
            <h2>My Games</h2>
            <Send size={22} aria-hidden />
          </div>
          {visibleMyMatches.length > 0 ? (
            <div className="match-list">
              {visibleMyMatches.map((match) => (
                <MatchCard
                  canAct={myEntryIds.length === 0 || myEntryIds.includes(match.entry_a_id) || myEntryIds.includes(match.entry_b_id)}
                  division={divisions.find((division) => division.id === match.division_id)}
                  entryA={entries.find((entry) => entry.id === match.entry_a_id)}
                  entryB={entries.find((entry) => entry.id === match.entry_b_id)}
                  key={match.id}
                  match={match}
                  myEntryIds={myEntryIds}
                  onClaimForfeit={claimForfeit}
                  onSubmitScore={submitScore}
                  players={allPlayers}
                  teamMembers={teamMembers}
                  tournamentName={tournamentForDivision(match.division_id)?.name}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Flag size={24} aria-hidden />} title="No games" />
          )}
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <div className="section-title">
            <h2>All Games</h2>
            <ClipboardList size={22} aria-hidden />
          </div>
          {visibleMatches.length > 0 ? (
            <div className="match-list">
              {visibleMatches.map((match) => {
                const division = divisions.find((item) => item.id === match.division_id);
                const entryA = entries.find((entry) => entry.id === match.entry_a_id);
                const entryB = entries.find((entry) => entry.id === match.entry_b_id);
                const matchTournament = tournamentForDivision(match.division_id);
                return (
                  <article className="match-card" key={match.id}>
                    <div className="match-meta">
                      {matchTournament ? <span className="pill">{matchTournament.name}</span> : null}
                      <span className="pill blue">{division?.name || "Schedule"}</span>
                      <span className="pill">{match.round_label || `Round ${match.round}`}</span>
                      <span className="pill">To {match.target_score}</span>
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
                      <span className="pill orange">{match.status.replace(/_/g, " ")}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<ClipboardList size={24} aria-hidden />} title="No games" />
          )}
        </div>

        <PointsTable divisions={visibleDivisions} entries={entries} standings={standings} />
      </section>
    </>
  );
}
