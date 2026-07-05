"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ClipboardList, Flag, Medal, MessageCircle, Send } from "lucide-react";
import { addDays, canClaimForfeit } from "@/lib/league-rules";
import { isMissingTargetScoreColumn, matchSelectBasic, matchSelectWithTargetScore } from "@/lib/match-queries";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { Match, MatchSet, MatchStatus, Sport } from "@/lib/types";

type AppUser = {
  id: string;
  club_id: string;
  role: "admin" | "player";
  full_name: string;
  email: string;
  access_disabled?: boolean | null;
};

type PlayerProfileRow = {
  id: string;
  display_name: string;
  mobile_number?: string | null;
  rating: string | null;
  user_id: string | null;
};

type DivisionRow = {
  id: string;
  name: string;
  skill_level: string;
  format: string;
};

type DivisionEntryRow = {
  id: string;
  division_id: string;
  label: string;
  player_id: string | null;
  team_id: string | null;
};

type TeamMemberRow = {
  team_id: string;
  player_id: string;
};

type TournamentRow = {
  id: string;
  name: string;
  sport: Sport;
  start_date: string;
  end_date: string;
};

type MatchRow = {
  id: string;
  division_id: string;
  round: number;
  round_label?: string | null;
  entry_a_id: string;
  entry_b_id: string;
  schedule_week_start: string;
  schedule_week_end: string;
  extension_week_start: string;
  extension_week_end: string;
  status: MatchStatus;
  target_score?: number | null;
  number_of_sets?: number | null;
  restrict_score_updates?: boolean | null;
  score_update_before_days?: number | null;
  score_update_after_days?: number | null;
  allow_forfeit?: boolean | null;
  forfeit_before_days?: number | null;
  forfeit_after_days?: number | null;
};

type StandingRow = {
  division_id: string;
  entry_id: string;
  played: number;
  wins: number;
  losses: number;
  forfeits_won?: number | null;
  forfeits_lost?: number | null;
  cancelled?: number | null;
  points: number;
};

export function PlayerWorkspace() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [, setProfiles] = useState<PlayerProfileRow[]>([]);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [entries, setEntries] = useState<DivisionEntryRow[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerProfileRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [myEntryIds, setMyEntryIds] = useState<string[]>([]);
  const [dashboardTournament, setDashboardTournament] = useState<TournamentRow | null>(null);
  const [dashboardDivisions, setDashboardDivisions] = useState<DivisionRow[]>([]);
  const [dashboardEntries, setDashboardEntries] = useState<DivisionEntryRow[]>([]);
  const [dashboardMatches, setDashboardMatches] = useState<MatchRow[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [message, setMessage] = useState("Loading player schedule...");
  const [, setDashboardMessage] = useState("Loading tournament games...");

  useEffect(() => {
    void loadPlayerSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointsTables = useMemo(
    () =>
      dashboardDivisions
        .map((division) => ({
          division,
          rows: standings
            .filter((standing) => standing.division_id === division.id)
            .map((standing) => ({
              standing,
              entry: dashboardEntries.find((entry) => entry.id === standing.entry_id)
            }))
            .sort(
              (a, b) =>
                b.standing.points - a.standing.points ||
                b.standing.wins - a.standing.wins ||
                getMatchesPlayed(b.standing) - getMatchesPlayed(a.standing)
            )
        }))
        .filter((table) => table.rows.length > 0),
    [dashboardDivisions, dashboardEntries, standings]
  );

  async function loadPlayerSchedule() {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    const authResult = await withTimeout(supabase.auth.getUser(), 6000, "Supabase auth did not respond. Refresh the page or sign in again.");
    if ("timeout" in authResult) {
      setMessage(authResult.timeout);
      return;
    }
    const { data: authData, error: authError } = authResult;
    if (authError || !authData.user) {
      setMessage("Sign in to see your scheduled matches.");
      router.replace("/login");
      return;
    }

    let userResult = await withTimeout(
      supabase.from("users").select("id, club_id, role, full_name, email, access_disabled").eq("id", authData.user.id).single(),
      6000,
      "The app user profile lookup did not respond. Check public.users and RLS policies."
    );
    if (!("timeout" in userResult) && userResult.error && isMissingAccessDisabledColumn(userResult.error)) {
      userResult = await withTimeout(
        supabase.from("users").select("id, club_id, role, full_name, email").eq("id", authData.user.id).single(),
        6000,
        "The app user profile lookup did not respond. Check public.users and RLS policies."
      );
    }
    if ("timeout" in userResult) {
      setMessage(userResult.timeout);
      return;
    }
    const { data: userRow, error: userError } = userResult;

    if (userError || !userRow || (userRow as AppUser).access_disabled) {
      setMessage("Your login works, but no app user profile was found.");
      await supabase.auth.signOut();
      router.replace("/login");
      return;
    }

    const currentUser = userRow as AppUser;
    setAppUser(currentUser);
    await loadTournamentDashboard(currentUser.club_id);

    const profileResult = await withTimeout(
      supabase.from("player_profiles").select("id, display_name, mobile_number, rating, user_id").eq("user_id", currentUser.id),
      6000,
      "The player profile lookup did not respond. Check player_profiles RLS policies."
    );
    if (!("timeout" in profileResult) && profileResult.error && isMissingMobileNumberColumn(profileResult.error)) {
      const fallbackProfileResult = await withTimeout(
        supabase.from("player_profiles").select("id, display_name, rating, user_id").eq("user_id", currentUser.id),
        6000,
        "The player profile lookup did not respond. Check player_profiles RLS policies."
      );
      if ("timeout" in fallbackProfileResult) {
        setMessage(fallbackProfileResult.timeout);
        return;
      }
      if (fallbackProfileResult.error) {
        setMessage(fallbackProfileResult.error.message);
        return;
      }
      const playerProfiles = (fallbackProfileResult.data || []) as PlayerProfileRow[];
      setProfiles(playerProfiles);

      if (playerProfiles.length === 0 && currentUser.role !== "admin") {
        setMessage("No player profile is linked to this login yet. Tournament games are still visible below.");
        return;
      }

      if (currentUser.role === "admin" && playerProfiles.length === 0) {
        await loadAdminPreview(currentUser);
        return;
      }

      await loadMatchesForProfiles(playerProfiles, currentUser.club_id);
      return;
    }
    if ("timeout" in profileResult) {
      setMessage(profileResult.timeout);
      return;
    }
    const { data: linkedProfiles, error: profileError } = profileResult;

    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    const playerProfiles = (linkedProfiles || []) as PlayerProfileRow[];
    setProfiles(playerProfiles);

    if (playerProfiles.length === 0 && currentUser.role !== "admin") {
      setMessage("No player profile is linked to this login yet. Tournament games are still visible below.");
      return;
    }

    if (currentUser.role === "admin" && playerProfiles.length === 0) {
      await loadAdminPreview(currentUser);
      return;
    }

    await loadMatchesForProfiles(playerProfiles, currentUser.club_id);
  }

  async function loadTournamentDashboard(clubId: string) {
    if (!supabase) return;

    const { data: tournamentRows, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, name, sport, start_date, end_date")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (tournamentError) {
      setDashboardMessage(tournamentError.message);
      return;
    }

    const selectedTournament = (tournamentRows || [])[0] as TournamentRow | undefined;
    if (!selectedTournament) {
      setDashboardMessage("No tournament has been created yet.");
      return;
    }

    setDashboardTournament(selectedTournament);

    const { data: divisionRows, error: divisionError } = await supabase
      .from("divisions")
      .select("id, name, skill_level, format")
      .eq("tournament_id", selectedTournament.id)
      .order("created_at", { ascending: true });

    if (divisionError) {
      setDashboardMessage(divisionError.message);
      return;
    }

    const loadedDivisions = (divisionRows || []) as DivisionRow[];
    const divisionIds = loadedDivisions.map((division) => division.id);
    setDashboardDivisions(loadedDivisions);

    if (divisionIds.length === 0) {
      setDashboardMessage("No schedules have been created yet.");
      return;
    }

    const { data: entryRows, error: entryError } = await supabase
      .from("division_entries")
      .select("id, division_id, label, player_id, team_id")
      .in("division_id", divisionIds);

    if (entryError) {
      setDashboardMessage(entryError.message);
      return;
    }

    await loadContactDirectory(clubId, (entryRows || []) as DivisionEntryRow[]);

    const { data: standingRows, error: standingError } = await supabase
      .from("standings")
      .select("division_id, entry_id, played, wins, losses, forfeits_won, forfeits_lost, cancelled, points")
      .in("division_id", divisionIds);

    if (!standingError) {
      setStandings(
        ((standingRows || []) as StandingRow[]).sort((a, b) => b.points - a.points || b.wins - a.wins || getMatchesPlayed(b) - getMatchesPlayed(a))
      );
    }

    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select(matchSelectWithTargetScore)
      .in("division_id", divisionIds)
      .order("schedule_week_start", { ascending: true })
      .order("round", { ascending: true });

    if (matchError) {
      if (!isMissingTargetScoreColumn(matchError)) {
        setDashboardMessage(matchError.message);
        return;
      }

      const { data: fallbackMatches, error: fallbackMatchError } = await supabase
        .from("matches")
        .select(matchSelectBasic)
        .in("division_id", divisionIds)
        .order("schedule_week_start", { ascending: true })
        .order("round", { ascending: true });

      if (fallbackMatchError) {
        setDashboardMessage(fallbackMatchError.message);
        return;
      }

      setDashboardEntries((entryRows || []) as DivisionEntryRow[]);
      setDashboardMatches(withMatchDefaults((fallbackMatches || []) as MatchRow[]));
      setDashboardMessage((fallbackMatches || []).length > 0 ? "Tournament games loaded." : "No matches have been generated yet.");
      return;
    }

    setDashboardEntries((entryRows || []) as DivisionEntryRow[]);
    setDashboardMatches((matchRows || []) as MatchRow[]);
    setDashboardMessage((matchRows || []).length > 0 ? "Tournament games loaded." : "No matches have been generated yet.");
  }

  async function loadAdminPreview(currentUser: AppUser) {
    if (!supabase) return;

    const { data: tournaments, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id")
      .eq("club_id", currentUser.club_id)
      .order("created_at", { ascending: false });

    if (tournamentError) {
      setMessage(tournamentError.message);
      return;
    }

    const tournamentIds = (tournaments || []).map((tournament) => tournament.id as string);
    if (tournamentIds.length === 0) {
      setMessage("No tournaments have been created yet.");
      return;
    }

    const { data: divisionRows, error: divisionError } = await supabase
      .from("divisions")
      .select("id, name, skill_level, format")
      .in("tournament_id", tournamentIds);

    if (divisionError) {
      setMessage(divisionError.message);
      return;
    }

    const loadedDivisions = (divisionRows || []) as DivisionRow[];
    const divisionIds = loadedDivisions.map((division) => division.id);
    await loadMatchesForDivisionIds(divisionIds, [], "Admin preview: showing all scheduled tournament matches.", currentUser.club_id);
  }

  async function loadMatchesForProfiles(playerProfiles: PlayerProfileRow[], clubId: string) {
    if (!supabase) return;

    const profileIds = playerProfiles.map((profile) => profile.id);
    const { data: directEntries, error: directError } = await supabase
      .from("division_entries")
      .select("id, division_id, label, player_id, team_id")
      .in("player_id", profileIds);

    if (directError) {
      setMessage(directError.message);
      return;
    }

    const { data: memberships, error: membershipError } = await supabase.from("team_members").select("team_id").in("player_id", profileIds);
    if (membershipError) {
      setMessage(membershipError.message);
      return;
    }

    const teamIds = Array.from(new Set((memberships || []).map((membership) => membership.team_id as string)));
    let teamEntries: DivisionEntryRow[] = [];

    if (teamIds.length > 0) {
      const { data, error } = await supabase
        .from("division_entries")
        .select("id, division_id, label, player_id, team_id")
        .in("team_id", teamIds);

      if (error) {
        setMessage(error.message);
        return;
      }
      teamEntries = (data || []) as DivisionEntryRow[];
    }

    const playerEntries = [...((directEntries || []) as DivisionEntryRow[]), ...teamEntries];
    const entryIds = Array.from(new Set(playerEntries.map((entry) => entry.id)));
    setMyEntryIds(entryIds);

    if (entryIds.length === 0) {
      setMessage("You are not assigned to any divisions yet.");
      return;
    }

    const divisionIds = Array.from(new Set(playerEntries.map((entry) => entry.division_id)));
    await loadMatchesForDivisionIds(divisionIds, entryIds, "Player schedule loaded.", clubId);
  }

  async function loadMatchesForDivisionIds(divisionIds: string[], entryIds: string[], successMessage: string, clubId?: string) {
    if (!supabase || divisionIds.length === 0) {
      setMessage("No divisions are ready yet.");
      return;
    }

    const { data: divisionRows, error: divisionError } = await supabase
      .from("divisions")
      .select("id, name, skill_level, format")
      .in("id", divisionIds);

    if (divisionError) {
      setMessage(divisionError.message);
      return;
    }

    const { data: entryRows, error: entryError } = await supabase
      .from("division_entries")
      .select("id, division_id, label, player_id, team_id")
      .in("division_id", divisionIds);

    if (entryError) {
      setMessage(entryError.message);
      return;
    }

    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select(matchSelectWithTargetScore)
      .in("division_id", divisionIds)
      .order("schedule_week_start", { ascending: true })
      .order("round", { ascending: true });

    if (matchError) {
      if (!isMissingTargetScoreColumn(matchError)) {
        setMessage(matchError.message);
        return;
      }

      const { data: fallbackMatches, error: fallbackMatchError } = await supabase
        .from("matches")
        .select(matchSelectBasic)
        .in("division_id", divisionIds)
        .order("schedule_week_start", { ascending: true })
        .order("round", { ascending: true });

      if (fallbackMatchError) {
        setMessage(fallbackMatchError.message);
        return;
      }

      const allMatches = withMatchDefaults((fallbackMatches || []) as MatchRow[]);
      const visibleMatches =
        entryIds.length > 0 ? allMatches.filter((match) => entryIds.includes(match.entry_a_id) || entryIds.includes(match.entry_b_id)) : allMatches;

      setDivisions((divisionRows || []) as DivisionRow[]);
      setEntries((entryRows || []) as DivisionEntryRow[]);
      if (clubId) await loadContactDirectory(clubId, (entryRows || []) as DivisionEntryRow[]);
      setMatches(visibleMatches);
      setMessage(visibleMatches.length > 0 ? successMessage : "No scheduled matches found yet.");
      return;
    }

    const allMatches = (matchRows || []) as MatchRow[];
    const visibleMatches =
      entryIds.length > 0 ? allMatches.filter((match) => entryIds.includes(match.entry_a_id) || entryIds.includes(match.entry_b_id)) : allMatches;

    setDivisions((divisionRows || []) as DivisionRow[]);
    setEntries((entryRows || []) as DivisionEntryRow[]);
    if (clubId) await loadContactDirectory(clubId, (entryRows || []) as DivisionEntryRow[]);
    setMatches(visibleMatches);
    setMessage(visibleMatches.length > 0 ? successMessage : "No scheduled matches found yet.");
  }

  async function loadContactDirectory(clubId: string, entryRows: DivisionEntryRow[]) {
    if (!supabase) return;

    const playerResult = await supabase
      .from("player_profiles")
      .select("id, display_name, mobile_number, rating, user_id")
      .eq("club_id", clubId);
    let playerRows = (playerResult.data || []) as PlayerProfileRow[];
    let playerError = playerResult.error;
    if (playerError && isMissingMobileNumberColumn(playerError)) {
      const fallback = await supabase.from("player_profiles").select("id, display_name, rating, user_id").eq("club_id", clubId);
      playerRows = (fallback.data || []) as PlayerProfileRow[];
      playerError = fallback.error;
    }
    if (!playerError) {
      setAllPlayers(playerRows);
    }

    const teamIds = Array.from(new Set(entryRows.flatMap((entry) => (entry.team_id ? [entry.team_id] : []))));
    if (teamIds.length === 0) {
      setTeamMembers([]);
      return;
    }
    const { data: memberRows, error: memberError } = await supabase.from("team_members").select("team_id, player_id").in("team_id", teamIds);
    if (!memberError) {
      setTeamMembers((memberRows || []) as TeamMemberRow[]);
    }
  }

  async function submitScore(match: MatchRow, sets: MatchSet[]) {
    if (!supabase) return;

    const winnerEntryId = getWinnerEntryId(match, sets);
    if (!winnerEntryId) {
      setMessage("Enter a valid best-of-3 score with a clear winner.");
      return;
    }

    const { error: setsError } = await supabase.from("match_sets").insert(
      sets.map((set) => ({
        match_id: match.id,
        set_number: set.setNumber,
        entry_a_score: set.entryAScore,
        entry_b_score: set.entryBScore
      }))
    );

    if (setsError) {
      setMessage(setsError.message);
      return;
    }

    const { data, error } = await supabase
      .from("matches")
      .update({
        status: "completed",
        winner_entry_id: winnerEntryId
      })
      .eq("id", match.id)
      .select(matchSelectBasic)
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setMatches((current) =>
      current.map((item) =>
        item.id === match.id
          ? ({
              ...(data as MatchRow),
              round_label: match.round_label,
              target_score: match.target_score || 11,
              number_of_sets: match.number_of_sets || 3,
              restrict_score_updates: match.restrict_score_updates || false,
              score_update_before_days: match.score_update_before_days || 0,
              score_update_after_days: match.score_update_after_days || 0,
              allow_forfeit: match.allow_forfeit !== false,
              forfeit_before_days: match.forfeit_before_days || 0,
              forfeit_after_days: match.forfeit_after_days || 0
            } as MatchRow)
          : item
      )
    );
    if (appUser) {
      await loadTournamentDashboard(appUser.club_id);
    }
    setMessage("Score submitted. Leaderboard updated.");
  }

  async function claimForfeit(match: MatchRow, claimedByEntryId: string) {
    if (!supabase || !appUser) return;

    const opponentEntryId = match.entry_a_id === claimedByEntryId ? match.entry_b_id : match.entry_a_id;
    const { error: claimError } = await supabase.from("forfeit_claims").insert({
      match_id: match.id,
      claimed_by_entry_id: claimedByEntryId,
      opponent_entry_id: opponentEntryId,
      created_by: appUser.id
    });

    if (claimError) {
      setMessage(claimError.message);
      return;
    }

    const { data, error } = await supabase
      .from("matches")
      .update({
        status: "forfeit",
        winner_entry_id: claimedByEntryId,
        forfeit_by_entry_id: claimedByEntryId
      })
      .eq("id", match.id)
      .select(matchSelectBasic)
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setMatches((current) =>
      current.map((item) =>
        item.id === match.id
          ? ({
              ...(data as MatchRow),
              round_label: match.round_label,
              target_score: match.target_score || 11,
              number_of_sets: match.number_of_sets || 3,
              restrict_score_updates: match.restrict_score_updates || false,
              score_update_before_days: match.score_update_before_days || 0,
              score_update_after_days: match.score_update_after_days || 0,
              allow_forfeit: match.allow_forfeit !== false,
              forfeit_before_days: match.forfeit_before_days || 0,
              forfeit_after_days: match.forfeit_after_days || 0
            } as MatchRow)
          : item
      )
    );
    if (appUser) {
      await loadTournamentDashboard(appUser.club_id);
    }
    setMessage("Forfeit recorded. Leaderboard updated.");
  }

  return (
    <>
      <section className="player-mobile-header">
        <div>
          <p className="eyebrow">{dashboardTournament?.name || "Tournament"}</p>
          <h1>My Schedule</h1>
          {message ? (
            <p className="subtle" data-testid="player-status" role="status">
              {message}
              {message.startsWith("Sign in") ? (
                <>
                  {" "}
                  <Link className="text-link" href="/login">
                    Open login
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>

      <section className="player-stack">
        <div className="card">
          <div className="section-title">
            <h2>My Games</h2>
            <Send size={22} aria-hidden />
          </div>
          {matches.length > 0 ? (
            <div className="match-list">
              {matches.map((match) => (
                <MatchCard
                  canAct={myEntryIds.length === 0 || myEntryIds.includes(match.entry_a_id) || myEntryIds.includes(match.entry_b_id)}
                  division={divisions.find((division) => division.id === match.division_id)}
                  entryA={entries.find((entry) => entry.id === match.entry_a_id)}
                  entryB={entries.find((entry) => entry.id === match.entry_b_id)}
                  key={match.id}
                  match={match}
                  players={allPlayers}
                  myEntryIds={myEntryIds}
                  onClaimForfeit={claimForfeit}
                  onSubmitScore={submitScore}
                  teamMembers={teamMembers}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Flag size={24} aria-hidden />}
              title="No games"
              body=""
            />
          )}
        </div>
      </section>

      <section className="player-stack">
        <div className="card">
          <div className="section-title">
            <h2>All Games</h2>
            <ClipboardList size={22} aria-hidden />
          </div>
          {dashboardMatches.length > 0 ? (
            <div className="match-list">
              {dashboardMatches.map((match) => {
                const division = dashboardDivisions.find((item) => item.id === match.division_id);
                const entryA = dashboardEntries.find((entry) => entry.id === match.entry_a_id);
                const entryB = dashboardEntries.find((entry) => entry.id === match.entry_b_id);

                return (
                  <article className="match-card" key={match.id}>
                    <div className="match-meta">
                      <span className="pill blue">{division?.name || "Schedule"}</span>
                      <span className="pill">{match.round_label || `Round ${match.round}`}</span>
                      <span className="pill">To {match.target_score || 11}</span>
                    </div>
                    <div className="versus">
                      <span>{entryA?.label || "Entry A"}</span>
                      <span className="subtle">vs</span>
                      <span>{entryB?.label || "Entry B"}</span>
                    </div>
                    <div className="score-line">
                      <span className="subtle">{match.schedule_week_start} to {match.extension_week_end}</span>
                      <span className="pill orange">{match.status.replace("_", " ")}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<ClipboardList size={24} aria-hidden />}
              title="No games"
              body=""
            />
          )}
        </div>

        <div className="card">
          <div className="section-title">
            <h2>Points</h2>
            <Medal size={22} aria-hidden />
          </div>
          {pointsTables.length > 0 ? (
            <div className="points-board-list">
              {pointsTables.map(({ division, rows }) => (
                <div className="points-board" key={division.id}>
                  <h3>{division.name}</h3>
                  <div className="points-table-scroll" role="region" aria-label={`${division.name} points table`}>
                    <table className="points-table">
                      <thead>
                        <tr>
                          <th scope="col">Player</th>
                          <th scope="col">M</th>
                          <th scope="col">W</th>
                          <th scope="col">L</th>
                          <th scope="col">B</th>
                          <th scope="col">P</th>
                          <th scope="col">R</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ entry, standing }) => (
                          <tr key={`${standing.division_id}-${standing.entry_id}`}>
                            <th scope="row">{entry?.label || "Entry"}</th>
                            <td>{getMatchesPlayed(standing)}</td>
                            <td>{standing.wins}</td>
                            <td>{standing.losses + (standing.forfeits_lost || 0)}</td>
                            <td>{getBonusPoints(standing)}</td>
                            <td>{standing.points}</td>
                            <td>{getWinRate(standing)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Medal size={24} aria-hidden />}
              title="No points yet"
              body=""
            />
          )}
        </div>
      </section>
    </>
  );
}

function MatchCard({
  canAct,
  division,
  entryA,
  entryB,
  match,
  myEntryIds,
  onClaimForfeit,
  onSubmitScore,
  players,
  teamMembers
}: {
  canAct: boolean;
  division?: DivisionRow;
  entryA?: DivisionEntryRow;
  entryB?: DivisionEntryRow;
  match: MatchRow;
  myEntryIds: string[];
  onClaimForfeit: (match: MatchRow, claimedByEntryId: string) => Promise<void>;
  onSubmitScore: (match: MatchRow, sets: MatchSet[]) => Promise<void>;
  players: PlayerProfileRow[];
  teamMembers: TeamMemberRow[];
}) {
  const [showScoreForm, setShowScoreForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claimingForfeit, setClaimingForfeit] = useState(false);
  const [resultMode, setResultMode] = useState<"score" | "forfeit">("score");
  const [playedDate, setPlayedDate] = useState(new Date().toISOString().slice(0, 10));
  const [forfeitWinnerId, setForfeitWinnerId] = useState("");
  const targetScore = match.target_score || 11;
  const [scoreForm, setScoreForm] = useState({
    set1A: String(targetScore),
    set1B: "0",
    set2A: String(targetScore),
    set2B: "0",
    set3A: "",
    set3B: ""
  });
  const playerEntryId = myEntryIds.find((entryId) => entryId === match.entry_a_id || entryId === match.entry_b_id) || "";
  const isAdminPreview = canAct && myEntryIds.length === 0;
  const forfeitMatch = toDomainMatch(match);
  const canForfeit = Boolean(playerEntryId && canClaimForfeit(forfeitMatch, playerEntryId));
  const canForfeitForEntryA = isAdminPreview && canClaimForfeit(forfeitMatch, match.entry_a_id);
  const canForfeitForEntryB = isAdminPreview && canClaimForfeit(forfeitMatch, match.entry_b_id);
  const canScoreUpdate = canSubmitScoreInWindow(match, isAdminPreview);
  const canEdit = canAct && canScoreUpdate && (match.status === "scheduled" || match.status === "score_submitted");
  const forfeitReason = getForfeitUnavailableReason(match);
  const opponentEntry = playerEntryId === match.entry_a_id ? entryB : entryA;
  const opponentPlayers = getEntryPlayers(opponentEntry, players, teamMembers);
  const canOpenResult = canEdit || canForfeit || canForfeitForEntryA || canForfeitForEntryB;
  const winnerForForfeit = isAdminPreview ? forfeitWinnerId : playerEntryId;
  const canSaveForfeit = isAdminPreview
    ? Boolean((winnerForForfeit === match.entry_a_id && canForfeitForEntryA) || (winnerForForfeit === match.entry_b_id && canForfeitForEntryB))
    : canForfeit;

  async function handleScoreSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resultMode === "forfeit") {
      if (!canSaveForfeit) return;
      await handleClaimForfeit(winnerForForfeit);
      return;
    }

    const sets = buildSets(scoreForm);
    setSubmitting(true);
    await onSubmitScore(match, sets);
    setSubmitting(false);
    setShowScoreForm(false);
  }

  async function handleClaimForfeit(claimedByEntryId: string) {
    if (!claimedByEntryId) return;
    setClaimingForfeit(true);
    await onClaimForfeit(match, claimedByEntryId);
    setClaimingForfeit(false);
  }

  return (
    <article className="mobile-match-card">
      <div className="match-rail" aria-hidden>
        <CalendarDays size={22} />
      </div>
      <div className="mobile-match-body">
        <div className="match-meta">
          <span className="pill blue">{division?.name || "Schedule"}</span>
          <span className="pill orange">{match.status.replace("_", " ")}</span>
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
            {opponentPlayers.length > 0 ? <ContactLinks players={opponentPlayers} /> : null}
            <button className="add-result-button" disabled={!canOpenResult} onClick={() => setShowScoreForm((current) => !current)} type="button">
              <Send size={20} aria-hidden />
              Add Result
            </button>
          </div>
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
              <button
                className={`choice-dot ${resultMode === "forfeit" ? "selected" : ""}`}
                onClick={() => setResultMode("forfeit")}
                type="button"
              >
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
              scoreForm={scoreForm}
              setScoreForm={setScoreForm}
            />
          ) : null}
          <label className="score-date-card">
            <span>Date this game is played on</span>
            <input onChange={(event) => setPlayedDate(event.target.value)} type="date" value={playedDate} />
          </label>
          <button className="score-save-button" disabled={submitting || claimingForfeit || (resultMode === "score" && !canEdit) || (resultMode === "forfeit" && !canSaveForfeit)} type="submit">
            {submitting || claimingForfeit ? "Saving..." : "Save"}
          </button>
        </form>
      ) : null}
    </article>
  );
}

function getForfeitUnavailableReason(match: MatchRow) {
  if (match.status === "completed" || match.status === "forfeit") {
    return "Forfeit is locked because a result has already been posted.";
  }
  if (match.status === "cancelled") {
    return "Forfeit is locked because this match is cancelled.";
  }
  if (match.allow_forfeit === false) {
    return "Forfeit is disabled for this schedule.";
  }
  const today = new Date().toISOString().slice(0, 10);
  const forfeitStart = addDays(match.schedule_week_start, -(match.forfeit_before_days || 0));
  const forfeitEnd = addDays(match.schedule_week_end, match.forfeit_after_days || 0);
  if (today < forfeitStart) return "Forfeit is not open yet.";
  if (today > forfeitEnd) return "Forfeit is outside the allowed schedule window.";
  return "";
}

function canSubmitScoreInWindow(match: MatchRow, isAdminPreview: boolean) {
  if (isAdminPreview || !match.restrict_score_updates) return true;
  const today = new Date().toISOString().slice(0, 10);
  const scoreStart = addDays(match.schedule_week_start, -(match.score_update_before_days || 0));
  const scoreEnd = addDays(match.schedule_week_end, match.score_update_after_days || 0);
  return today >= scoreStart && today <= scoreEnd;
}

function ContactLinks({ players }: { players: PlayerProfileRow[] }) {
  return (
    <div className="contact-links">
      {players
        .filter((player) => normalizePhone(player.mobile_number))
        .map((player) => {
          const phone = normalizePhone(player.mobile_number);
          return (
            <div className="contact-row" key={player.id}>
              <span>{player.display_name}</span>
              <a className="contact-button" href={`https://wa.me/${phone}`} rel="noreferrer" target="_blank" aria-label={`WhatsApp ${player.display_name}`}>
                <MessageCircle size={16} aria-hidden />
              </a>
              <a className="contact-button" href={`sms:${phone}`} aria-label={`Message ${player.display_name}`}>
                <Send size={16} aria-hidden />
              </a>
            </div>
          );
        })}
    </div>
  );
}

function ScoreGrid({
  aLabel,
  bLabel,
  scoreForm,
  setScoreForm
}: {
  aLabel: string;
  bLabel: string;
  scoreForm: ScoreFormState;
  setScoreForm: React.Dispatch<React.SetStateAction<ScoreFormState>>;
}) {
  const columns: Array<{ set: string; a: keyof ScoreFormState; b: keyof ScoreFormState }> = [
    { set: "1", a: "set1A", b: "set1B" },
    { set: "2", a: "set2A", b: "set2B" },
    { set: "3", a: "set3A", b: "set3B" }
  ];

  return (
    <div className="score-grid" aria-label="Set scores">
      <div />
      {columns.map((column) => (
        <strong key={column.set}>{column.set}</strong>
      ))}
      <span className="score-player-label">{aLabel}</span>
      {columns.map((column, index) => (
        <input
          key={column.a}
          min="0"
          onChange={(event) => setScoreForm((current) => ({ ...current, [column.a]: event.target.value }))}
          required={index < 2}
          type="number"
          value={scoreForm[column.a]}
        />
      ))}
      <span className="score-player-label">{bLabel}</span>
      {columns.map((column, index) => (
        <input
          key={column.b}
          min="0"
          onChange={(event) => setScoreForm((current) => ({ ...current, [column.b]: event.target.value }))}
          required={index < 2}
          type="number"
          value={scoreForm[column.b]}
        />
      ))}
    </div>
  );
}

type ScoreFormState = {
  set1A: string;
  set1B: string;
  set2A: string;
  set2B: string;
  set3A: string;
  set3B: string;
};

function buildSets(scoreForm: ScoreFormState): MatchSet[] {
  const rawSets = [
    [scoreForm.set1A, scoreForm.set1B],
    [scoreForm.set2A, scoreForm.set2B],
    [scoreForm.set3A, scoreForm.set3B]
  ];

  return rawSets.flatMap(([a, b], index) => {
    if (a === "" && b === "") return [];
    return [
      {
        setNumber: index + 1,
        entryAScore: Number(a),
        entryBScore: Number(b)
      }
    ];
  });
}

function getWinnerEntryId(match: MatchRow, sets: MatchSet[]) {
  const wins = sets.reduce(
    (acc, set) => {
      if (set.entryAScore > set.entryBScore) acc.a += 1;
      if (set.entryBScore > set.entryAScore) acc.b += 1;
      return acc;
    },
    { a: 0, b: 0 }
  );

  if (wins.a === wins.b || Math.max(wins.a, wins.b) < 2) return undefined;
  return wins.a > wins.b ? match.entry_a_id : match.entry_b_id;
}

function toDomainMatch(match: MatchRow): Match {
  return {
    id: match.id,
    divisionId: match.division_id,
    round: match.round,
    roundLabel: match.round_label || undefined,
    entryAId: match.entry_a_id,
    entryBId: match.entry_b_id,
    targetScore: match.target_score || 11,
    numberOfSets: match.number_of_sets || 3,
    restrictScoreUpdates: match.restrict_score_updates || false,
    scoreUpdateBeforeDays: match.score_update_before_days || 0,
    scoreUpdateAfterDays: match.score_update_after_days || 0,
    allowForfeit: match.allow_forfeit !== false,
    forfeitBeforeDays: match.forfeit_before_days || 0,
    forfeitAfterDays: match.forfeit_after_days || 0,
    scheduleWeekStart: match.schedule_week_start,
    scheduleWeekEnd: match.schedule_week_end,
    extensionWeekStart: match.extension_week_start,
    extensionWeekEnd: match.extension_week_end,
    status: match.status,
    sets: []
  };
}

function withMatchDefaults(matches: MatchRow[]) {
  return matches.map((match) => ({
    ...match,
    target_score: match.target_score || 11,
    number_of_sets: match.number_of_sets || 3,
    restrict_score_updates: match.restrict_score_updates || false,
    score_update_before_days: match.score_update_before_days || 0,
    score_update_after_days: match.score_update_after_days || 0,
    allow_forfeit: match.allow_forfeit !== false,
    forfeit_before_days: match.forfeit_before_days || 0,
    forfeit_after_days: match.forfeit_after_days || 0
  }));
}

function getMatchesPlayed(standing: StandingRow) {
  return standing.played + (standing.forfeits_won || 0) + (standing.forfeits_lost || 0);
}

function getBonusPoints(standing: StandingRow) {
  return Math.max(standing.points - standing.wins * 4 - standing.losses, 0);
}

function getWinRate(standing: StandingRow) {
  const matchesPlayed = getMatchesPlayed(standing);
  if (matchesPlayed === 0) return "0.00";
  return ((standing.wins / matchesPlayed) * 100).toFixed(2);
}

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

function normalizePhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

function formatShortDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

function formatWeekday(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-US", { weekday: "short" });
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      {body ? <p className="subtle">{body}</p> : null}
    </div>
  );
}

function isMissingAccessDisabledColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  return message.includes("access_disabled") || message.includes("schema cache");
}

function isMissingMobileNumberColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  return message.includes("mobile_number") || message.includes("schema cache");
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, timeout: string): Promise<T | { timeout: string }> {
  return Promise.race([
    promise,
    new Promise<{ timeout: string }>((resolve) => {
      window.setTimeout(() => resolve({ timeout }), timeoutMs);
    })
  ]);
}
