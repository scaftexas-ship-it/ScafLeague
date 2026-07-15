"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  getClub,
  getCurrentAppUser,
  listAppUsers,
  listDivisionEntries,
  listDivisions,
  listMatchSets,
  listMatches,
  listPlayers,
  listTeamMembers,
  listTeams,
  listTournaments
} from "@/lib/admin-data";
import type {
  AppUserRow,
  ClubRow,
  DivisionEntryRow,
  DivisionRow,
  MatchRow,
  MatchSetRow,
  PlayerProfileRow,
  TeamMemberRow,
  TeamRow,
  TournamentRow
} from "@/lib/admin-data";

/**
 * Bootstraps the admin workspace: verifies the signed-in user is an enabled
 * admin, then loads every entity list the workspace's panes need. All five
 * panes (tournaments, people, match management, teams, settings) read from
 * this single hook instead of each re-fetching the same tables, and every
 * mutation-heavy pane gets a `reload*` callback back so it can refresh just
 * the slice of data it changed.
 */
export function useAdminData() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [adminUser, setAdminUser] = useState<AppUserRow | null>(null);
  const [club, setClub] = useState<ClubRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Checking admin access...");
  const [serviceRoleConfigured, setServiceRoleConfigured] = useState<boolean | null>(null);

  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [divisionEntries, setDivisionEntries] = useState<DivisionEntryRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchSets, setMatchSets] = useState<MatchSetRow[]>([]);
  const [players, setPlayers] = useState<PlayerProfileRow[]>([]);
  const [appUsers, setAppUsers] = useState<AppUserRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedTournamentId) void reloadDivisions(selectedTournamentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournamentId]);

  async function bootstrap() {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      setLoading(false);
      return;
    }

    try {
      const user = await getCurrentAppUser(supabase);
      if (!user) {
        setMessage("Sign in with an admin account to continue.");
        router.replace("/login");
        setLoading(false);
        return;
      }
      if (user.role !== "admin") {
        router.replace("/player");
        return;
      }
      if (user.access_disabled) {
        await supabase.auth.signOut();
        setMessage("This account has been disabled.");
        router.replace("/login");
        setLoading(false);
        return;
      }

      setAdminUser(user);

      void fetch("/api/admin/config/")
        .then((response) => response.json())
        .then((body) => setServiceRoleConfigured(Boolean(body.serviceRoleConfigured)))
        .catch(() => setServiceRoleConfigured(false));

      const [playerRows, userRows, teamRows, clubRow] = await Promise.all([
        listPlayers(supabase, user.club_id),
        listAppUsers(supabase, user.club_id),
        listTeams(supabase, user.club_id),
        getClub(supabase, user.club_id)
      ]);
      setPlayers(playerRows);
      setAppUsers(userRows);
      setTeams(teamRows);
      setClub(clubRow);
      if (teamRows.length > 0) setTeamMembers(await listTeamMembers(supabase, teamRows.map((team) => team.id)));

      const tournamentRows = await listTournaments(supabase, user.club_id);
      setTournaments(tournamentRows);
      if (tournamentRows[0]) setSelectedTournamentId(tournamentRows[0].id);

      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the admin workspace.");
    } finally {
      setLoading(false);
    }
  }

  const reloadDivisions = useCallback(
    async (tournamentId: string) => {
      if (!supabase || !tournamentId) return;
      const divisionRows = await listDivisions(supabase, tournamentId);
      setDivisions(divisionRows);
      const divisionIds = divisionRows.map((division) => division.id);
      const entries = await listDivisionEntries(supabase, divisionIds);
      setDivisionEntries(entries);
      const matchRows = await listMatches(supabase, divisionIds);
      setMatches(matchRows);
      const matchIds = matchRows.map((match) => match.id);
      setMatchSets(await listMatchSets(supabase, matchIds));
    },
    [supabase]
  );

  const reloadTournaments = useCallback(async () => {
    if (!supabase || !adminUser) return [] as TournamentRow[];
    const rows = await listTournaments(supabase, adminUser.club_id);
    setTournaments(rows);
    return rows;
  }, [supabase, adminUser]);

  const reloadPlayers = useCallback(async () => {
    if (!supabase || !adminUser) return;
    setPlayers(await listPlayers(supabase, adminUser.club_id));
  }, [supabase, adminUser]);

  const reloadAppUsers = useCallback(async () => {
    if (!supabase || !adminUser) return;
    setAppUsers(await listAppUsers(supabase, adminUser.club_id));
  }, [supabase, adminUser]);

  const reloadTeams = useCallback(async () => {
    if (!supabase || !adminUser) return;
    const teamRows = await listTeams(supabase, adminUser.club_id);
    setTeams(teamRows);
    setTeamMembers(teamRows.length > 0 ? await listTeamMembers(supabase, teamRows.map((team) => team.id)) : []);
  }, [supabase, adminUser]);

  const reloadCurrentDivisions = useCallback(() => reloadDivisions(selectedTournamentId), [reloadDivisions, selectedTournamentId]);

  const reloadClub = useCallback(async () => {
    if (!supabase || !adminUser) return;
    setClub(await getClub(supabase, adminUser.club_id));
  }, [supabase, adminUser]);

  return {
    supabase,
    adminUser,
    club,
    loading,
    message,
    setMessage,
    serviceRoleConfigured,
    tournaments,
    selectedTournamentId,
    setSelectedTournamentId,
    divisions,
    divisionEntries,
    matches,
    matchSets,
    players,
    appUsers,
    teams,
    teamMembers,
    reloadTournaments,
    reloadDivisions: reloadCurrentDivisions,
    reloadPlayers,
    reloadAppUsers,
    reloadTeams,
    reloadClub
  };
}

export type AdminData = ReturnType<typeof useAdminData>;
