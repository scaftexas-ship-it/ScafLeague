"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Flag, Send } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  claimPlayerProfileIfEligible,
  getCurrentAppUser,
  insertForfeitClaim,
  listDivisionEntries,
  listDivisionsForTournaments,
  listMatches,
  listStandings,
  listTournaments,
  reconcileExpiredMatches,
  replaceMatchSets,
  updateMatch
} from "@/lib/admin-data";
import type { DivisionEntryRow, DivisionRow, MatchRow, PlayerProfileRow, TeamMemberRow, TournamentRow } from "@/lib/admin-data";
import { listAllPlayersInClub, listEntriesForPlayerIds, listEntriesForTeamIds, listPlayerProfilesForUser, listTeamIdsForPlayerIds } from "@/lib/player-data";
import { validateMatchSets } from "@/lib/match-scoring";
import { todayIso } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Versus } from "@/components/ui/versus";
import { StatusBanner } from "@/components/ui/status-banner";
import { MatchCard } from "./match-card";
import { PointsTable } from "./points-table";
import { TournamentLeaderboard } from "./tournament-leaderboard";
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
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"mine" | "all" | "points">("mine");

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

      // Link a matching player profile if it isn't linked yet. Sign-in also does
      // this, but someone already holding a session would never pass through it
      // again -- and without the link is_entry_member() is false, so this page
      // would keep showing an empty schedule. No-op once linked.
      await claimPlayerProfileIfEligible(supabase);

      // Work out this player's own entries first -- everything below is scoped
      // to the tournaments those entries sit in. Previously the page loaded
      // every tournament in the club, so a player browsing the Tournament
      // filter saw (and could read the schedules of) leagues they had nothing
      // to do with.
      const profiles = await listPlayerProfilesForUser(supabase, appUser.id);
      const profileIds = profiles.map((profile) => profile.id);
      const [directEntries, teamIds] = await Promise.all([listEntriesForPlayerIds(supabase, profileIds), listTeamIdsForPlayerIds(supabase, profileIds)]);
      const teamEntries = await listEntriesForTeamIds(supabase, teamIds);
      const myEntries = [...directEntries, ...teamEntries];
      const entryIds = Array.from(new Set(myEntries.map((entry) => entry.id)));
      const myDivisionIds = new Set(myEntries.map((entry) => entry.division_id));
      setMyEntryIds(entryIds);

      const clubTournaments = await listTournaments(supabase, appUser.club_id);
      if (clubTournaments.length === 0) {
        setMessage("No tournament has been created yet.");
        return;
      }

      const clubDivisions = await listDivisionsForTournaments(supabase, clubTournaments.map((item) => item.id));

      // Admins keep the whole club in view so they can preview any schedule.
      const isAdmin = appUser.role === "admin";
      const myTournamentIds = new Set(clubDivisions.filter((division) => myDivisionIds.has(division.id)).map((division) => division.tournament_id));
      const loadedTournaments = isAdmin ? clubTournaments : clubTournaments.filter((tournament) => myTournamentIds.has(tournament.id));

      if (loadedTournaments.length === 0) {
        setTournaments([]);
        setDivisions([]);
        setMatches([]);
        setMyMatches([]);
        setStandings([]);
        setMessage("You're not entered in any tournament yet. Once an admin adds you to a division, your schedule shows up here.");
        return;
      }

      const visibleTournamentIdSet = new Set(loadedTournaments.map((tournament) => tournament.id));
      const loadedDivisions = clubDivisions.filter((division) => visibleTournamentIdSet.has(division.tournament_id));
      setTournaments(loadedTournaments);
      setDivisions(loadedDivisions);
      const divisionIds = loadedDivisions.map((division) => division.id);
      if (divisionIds.length === 0) {
        setMessage("No schedules have been created yet.");
        return;
      }

      const loadedEntries = await listDivisionEntries(supabase, divisionIds);
      setEntries(loadedEntries);

      const [loadedMatches, standingRows] = await Promise.all([listMatches(supabase, divisionIds), listStandings(supabase, divisionIds)]);
      const allMatches = await reconcileExpiredMatches(supabase, loadedMatches, todayIso());
      setMatches(allMatches);
      setStandings(standingRows);

      await loadContactDirectory(appUser.club_id, loadedEntries);

      if (entryIds.length > 0) {
        setMyMatches(allMatches.filter((match) => entryIds.includes(match.entry_a_id) || entryIds.includes(match.entry_b_id)));
        setMessage("Player schedule loaded.");
      } else if (isAdmin) {
        setMyMatches(allMatches);
        setMessage("Admin preview: showing all scheduled tournament matches.");
      } else {
        setMyMatches([]);
        setMessage("You are not assigned to any divisions yet.");
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
    const result = validateMatchSets(sets, {
      entryAId: match.entry_a_id,
      entryBId: match.entry_b_id,
      numberOfSets: match.number_of_sets,
      targetScore: match.target_score,
      sport: tournamentForDivision(match.division_id)?.sport
    });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const winnerEntryId = result.winnerEntryId;

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
  // Divisions the sport/tournament filters allow -- also the option list for the
  // division filter, so it can never offer a division outside the current
  // tournament selection.
  const selectableDivisions = divisions.filter((division) => visibleTournamentIds.has(division.tournament_id));
  const visibleDivisionIds = new Set(
    (divisionFilter === "all" ? selectableDivisions : selectableDivisions.filter((division) => division.id === divisionFilter)).map((division) => division.id)
  );

  function handleSportFilterChange(value: string) {
    setSportFilter(value as Sport | "all");
    setTournamentFilter("all");
    setDivisionFilter("all");
  }

  function handleTournamentFilterChange(value: string) {
    setTournamentFilter(value);
    setDivisionFilter("all");
  }

  const visibleMyMatches = myMatches.filter((match) => visibleDivisionIds.has(match.division_id));
  const visibleMatches = matches.filter((match) => visibleDivisionIds.has(match.division_id));
  const visibleDivisions = divisions.filter((division) => visibleDivisionIds.has(division.id));

  const singleTournamentId = tournamentFilter !== "all" ? tournamentFilter : sportTournaments.length === 1 ? sportTournaments[0].id : null;
  const singleTournamentDivisions = singleTournamentId ? divisions.filter((division) => division.tournament_id === singleTournamentId) : [];

  return (
    <>
      <section className="player-mobile-header">
        <div>
          <p className="eyebrow">Tournament</p>
          <h1>My Schedule</h1>
          <StatusBanner testId="player-status" message={message} />
          {message.startsWith("Sign in") ? (
            <Link className="text-link" href="/login">
              Open login
            </Link>
          ) : null}
        </div>
      </section>

      {tournaments.length > 1 || selectableDivisions.length > 1 ? (
        <section className="card stack">
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
              <select onChange={(event) => handleTournamentFilterChange(event.target.value)} value={tournamentFilter}>
                <option value="all">All tournaments</option>
                {sportTournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectableDivisions.length > 1 ? (
            <label className="field">
              <span>Division</span>
              <select onChange={(event) => setDivisionFilter(event.target.value)} value={divisionFilter}>
                <option value="all">All divisions</option>
                {selectableDivisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                    {tournamentFilter === "all" ? ` · ${tournaments.find((t) => t.id === division.tournament_id)?.name ?? ""}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>
      ) : null}

      <section className="stack">
        <SegmentedControl
          ariaLabel="Player view"
          onChange={setActiveTab}
          options={[
            { value: "mine", label: "My Games" },
            { value: "all", label: "All Games" },
            { value: "points", label: "Points" }
          ]}
          value={activeTab}
        />

        {activeTab === "mine" ? (
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
                    sport={tournamentForDivision(match.division_id)?.sport || "pickleball"}
                    teamMembers={teamMembers}
                    tournamentName={tournamentForDivision(match.division_id)?.name}
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon={<Flag size={24} aria-hidden />} title="No games" />
            )}
          </div>
        ) : null}

        {activeTab === "all" ? (
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
                      <Versus awayLabel={entryB?.label} homeLabel={entryA?.label} />
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
        ) : null}

        {activeTab === "points" ? (
          <div className="stack">
            {singleTournamentDivisions.length > 0 ? (
              <TournamentLeaderboard divisions={singleTournamentDivisions} entries={entries} standings={standings} />
            ) : null}
            <PointsTable divisions={visibleDivisions} entries={entries} standings={standings} />
          </div>
        ) : null}
      </section>
    </>
  );
}
