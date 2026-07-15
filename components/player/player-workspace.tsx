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
  listDivisions,
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
import type { MatchSet } from "@/lib/types";

export function PlayerWorkspace() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [entries, setEntries] = useState<DivisionEntryRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [myEntryIds, setMyEntryIds] = useState<string[]>([]);
  const [myMatches, setMyMatches] = useState<MatchRow[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerProfileRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [message, setMessage] = useState("Loading player schedule...");

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

      const tournaments = await listTournaments(supabase, appUser.club_id);
      const currentTournament = tournaments[0];
      if (!currentTournament) {
        setMessage("No tournament has been created yet.");
        return;
      }
      setTournament(currentTournament);

      const loadedDivisions = await listDivisions(supabase, currentTournament.id);
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

  return (
    <>
      <section className="player-mobile-header">
        <div>
          <p className="eyebrow">{tournament?.name || "Tournament"}</p>
          <h1>My Schedule</h1>
          <StatusBanner testId="player-status" message={message} />
          {message.startsWith("Sign in") ? (
            <Link className="text-link" href="/login">
              Open login
            </Link>
          ) : null}
        </div>
      </section>

      <section className="stack">
        <div className="card">
          <div className="section-title">
            <h2>My Games</h2>
            <Send size={22} aria-hidden />
          </div>
          {myMatches.length > 0 ? (
            <div className="match-list">
              {myMatches.map((match) => (
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
          {matches.length > 0 ? (
            <div className="match-list">
              {matches.map((match) => {
                const division = divisions.find((item) => item.id === match.division_id);
                const entryA = entries.find((entry) => entry.id === match.entry_a_id);
                const entryB = entries.find((entry) => entry.id === match.entry_b_id);
                return (
                  <article className="match-card" key={match.id}>
                    <div className="match-meta">
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

        <PointsTable divisions={divisions} entries={entries} standings={standings} />
      </section>
    </>
  );
}
