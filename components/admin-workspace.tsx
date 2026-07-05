"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Plus, Settings, Shuffle, Trophy, Upload, UserPlus, UsersRound, Wrench } from "lucide-react";
import { addDays, generateEliminatorSchedule, generateRoundRobinSchedule } from "@/lib/league-rules";
import { isMissingTargetScoreColumn, matchSelectBasic, matchSelectWithTargetScore } from "@/lib/match-queries";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { DivisionEntry, DivisionFormat, MatchStatus, Sport } from "@/lib/types";

type AdminUser = {
  id: string;
  club_id: string;
  role: "admin" | "player";
  full_name: string;
  email: string;
  access_disabled?: boolean | null;
};

type TournamentRow = {
  id: string;
  name: string;
  sport: Sport;
  start_date: string;
  end_date: string;
};

type DivisionRow = {
  id: string;
  tournament_id: string;
  name: string;
  skill_level: string;
  format: DivisionFormat;
};

type PlayerProfileRow = {
  id: string;
  club_id: string;
  display_name: string;
  mobile_number?: string | null;
  rating: string | null;
  user_id: string | null;
};

type AppUserRow = {
  id: string;
  club_id: string;
  role: "admin" | "player";
  full_name: string;
  email: string;
  access_disabled?: boolean | null;
};

type PeopleImportRow = {
  fullName: string;
  email: string;
  password?: string;
  role: "admin" | "player";
  rating?: string;
  mobileNumber?: string;
  createPlayerProfile: boolean;
};

type DivisionEntryRow = {
  id: string;
  division_id: string;
  label: string;
  player_id: string | null;
  team_id: string | null;
};

type TeamRow = {
  id: string;
  club_id: string;
  name: string;
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
  winner_entry_id?: string | null;
  forfeit_by_entry_id?: string | null;
  target_score?: number | null;
  number_of_sets?: number | null;
  restrict_score_updates?: boolean | null;
  score_update_before_days?: number | null;
  score_update_after_days?: number | null;
  allow_forfeit?: boolean | null;
  forfeit_before_days?: number | null;
  forfeit_after_days?: number | null;
};

type MatchSetRow = {
  match_id: string;
  set_number: number;
  entry_a_score: number;
  entry_b_score: number;
};

type ManualMatchRow = {
  id: string;
  entryASelectionId: string;
  entryBSelectionId: string;
};

type AdminSection = "players" | "teams" | "tournaments" | "admin" | "settings";

const today = new Date().toISOString().slice(0, 10);

export function AdminWorkspace() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [activeSection, setActiveSection] = useState<AdminSection>("players");
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [players, setPlayers] = useState<PlayerProfileRow[]>([]);
  const [appUsers, setAppUsers] = useState<AppUserRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [divisionEntries, setDivisionEntries] = useState<DivisionEntryRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchSets, setMatchSets] = useState<MatchSetRow[]>([]);
  const [selectedSinglesDivisionId, setSelectedSinglesDivisionId] = useState("");
  const [selectedDoublesDivisionId, setSelectedDoublesDivisionId] = useState("");
  const [selectedScheduleDivisionId, setSelectedScheduleDivisionId] = useState("");
  const [scheduleName, setScheduleName] = useState("Division X");
  const [scheduleSkillLevel, setScheduleSkillLevel] = useState("3.5");
  const [scheduleFormat, setScheduleFormat] = useState<DivisionFormat>("singles");
  const [scheduleType, setScheduleType] = useState<"round_robin" | "eliminator" | "manual">("round_robin");
  const [scheduleStep, setScheduleStep] = useState<"setup" | "entries">("setup");
  const [scheduleNumberOfSets, setScheduleNumberOfSets] = useState("3");
  const [scheduleDateType, setScheduleDateType] = useState("play_by");
  const [scheduleStartDate, setScheduleStartDate] = useState(today);
  const [restrictScoreUpdates, setRestrictScoreUpdates] = useState(false);
  const [scoreUpdateBeforeDays, setScoreUpdateBeforeDays] = useState("7");
  const [scoreUpdateAfterDays, setScoreUpdateAfterDays] = useState("7");
  const [allowGameForfeit, setAllowGameForfeit] = useState(true);
  const [forfeitBeforeDays, setForfeitBeforeDays] = useState("7");
  const [forfeitAfterDays, setForfeitAfterDays] = useState("0");
  const [changeWinningScore, setChangeWinningScore] = useState(false);
  const [selectedSchedulePlayerIds, setSelectedSchedulePlayerIds] = useState<string[]>([]);
  const [selectedScheduleTeamIds, setSelectedScheduleTeamIds] = useState<string[]>([]);
  const [manualMatches, setManualMatches] = useState<ManualMatchRow[]>([{ id: "manual-1", entryASelectionId: "", entryBSelectionId: "" }]);
  const [schedulePlayerSearch, setSchedulePlayerSearch] = useState("");
  const [scheduleRatingFilter, setScheduleRatingFilter] = useState("all");
  const [showSelectedSchedulePlayersOnly, setShowSelectedSchedulePlayersOnly] = useState(false);
  const [scheduleTeamSearch, setScheduleTeamSearch] = useState("");
  const [showSelectedScheduleTeamsOnly, setShowSelectedScheduleTeamsOnly] = useState(false);
  const [replaceExistingSchedule, setReplaceExistingSchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingTournament, setSavingTournament] = useState(false);
  const [savingDivision, setSavingDivision] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [scheduleTargetScore, setScheduleTargetScore] = useState("11");
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [invitingUser, setInvitingUser] = useState(false);
  const [linkingUser, setLinkingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState("");
  const [editingMatchId, setEditingMatchId] = useState("");
  const [importingPlayers, setImportingPlayers] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState("");
  const [serviceRoleConfigured, setServiceRoleConfigured] = useState<boolean | null>(null);
  const [assigningEntry, setAssigningEntry] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [creatingScheduleTeam, setCreatingScheduleTeam] = useState(false);
  const [message, setMessage] = useState("Checking admin access...");
  const [tournamentForm, setTournamentForm] = useState({
    name: "",
    sport: "pickleball" as Sport,
    startDate: today,
    endDate: today
  });
  const [divisionForm, setDivisionForm] = useState({
    skillLevel: "3.5",
    format: "singles" as DivisionFormat
  });
  const [playerForm, setPlayerForm] = useState({
    displayName: "",
    mobileNumber: "",
    rating: ""
  });
  const [inviteForm, setInviteForm] = useState({
    fullName: "",
    email: "",
    mobileNumber: "",
    password: "",
    role: "player" as "admin" | "player",
    rating: "",
    playerProfileMode: "__new"
  });
  const [linkForm, setLinkForm] = useState({
    userId: "",
    playerProfileId: ""
  });
  const [assignmentForm, setAssignmentForm] = useState({
    playerId: ""
  });
  const [teamForm, setTeamForm] = useState({
    name: "",
    playerAId: "",
    playerBId: ""
  });
  const [scheduleTeamForm, setScheduleTeamForm] = useState({
    name: "",
    playerAId: "",
    playerBId: ""
  });

  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId);
  const singlesDivisions = divisions.filter((division) => division.format === "singles");
  const doublesDivisions = divisions.filter((division) => division.format === "doubles");
  const selectedSinglesDivision = singlesDivisions.find((division) => division.id === selectedSinglesDivisionId);
  const selectedDoublesDivision = doublesDivisions.find((division) => division.id === selectedDoublesDivisionId);
  const selectedScheduleDivision = divisions.find((division) => division.id === selectedScheduleDivisionId);
  const selectedScheduleDivisionMatches = matches.filter((match) => match.division_id === selectedScheduleDivisionId);
  const canReplaceExistingSchedule = selectedScheduleDivisionMatches.every((match) => match.status === "scheduled" || match.status === "cancelled");
  const activeScheduleFormat = selectedScheduleDivision?.format || scheduleFormat;
  const activeScheduleName = selectedScheduleDivision?.name || scheduleName.trim() || "Division X";
  const scheduleSelectionCount = activeScheduleFormat === "doubles" ? selectedScheduleTeamIds.length : selectedSchedulePlayerIds.length;
  const ratingOptions = Array.from(new Set(players.map((player) => player.rating?.trim() || "No rating"))).sort((a, b) => a.localeCompare(b));
  const filteredSchedulePlayers = players.filter((player) => {
    const playerRating = player.rating?.trim() || "No rating";
    const search = schedulePlayerSearch.trim().toLowerCase();
    const matchesSearch =
      !search || player.display_name.toLowerCase().includes(search) || playerRating.toLowerCase().includes(search);
    const matchesRating = scheduleRatingFilter === "all" || playerRating === scheduleRatingFilter;
    const matchesSelected = !showSelectedSchedulePlayersOnly || selectedSchedulePlayerIds.includes(player.id);
    return matchesSearch && matchesRating && matchesSelected;
  });
  const filteredScheduleTeams = teams.filter((team) => {
    const search = scheduleTeamSearch.trim().toLowerCase();
    const matchesSearch = !search || team.name.toLowerCase().includes(search);
    const matchesSelected = !showSelectedScheduleTeamsOnly || selectedScheduleTeamIds.includes(team.id);
    return matchesSearch && matchesSelected;
  });
  const selectedSchedulePlayers = players.filter((player) => selectedSchedulePlayerIds.includes(player.id));
  const selectedScheduleTeams = teams.filter((team) => selectedScheduleTeamIds.includes(team.id));
  const manualEntryOptions =
    activeScheduleFormat === "doubles"
      ? selectedScheduleTeams.map((team) => ({ id: team.id, label: team.name }))
      : selectedSchedulePlayers.map((player) => ({ id: player.id, label: player.display_name }));
  const divisionName = `${divisionForm.skillLevel.trim()} ${divisionForm.format === "singles" ? "Singles" : "Doubles"}`;

  useEffect(() => {
    void loadAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTournamentId) {
      setDivisions([]);
      setDivisionEntries([]);
      setMatches([]);
      return;
    }
    void loadDivisions(selectedTournamentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournamentId]);

  useEffect(() => {
    if (selectedTournament) {
      setScheduleStartDate(selectedTournament.start_date);
    }
  }, [selectedTournament]);

  useEffect(() => {
    if (divisions.length === 0) {
      setSelectedSinglesDivisionId("");
      setSelectedDoublesDivisionId("");
      setSelectedScheduleDivisionId("");
      return;
    }
    setSelectedScheduleDivisionId((current) => (current && divisions.some((division) => division.id === current) ? current : ""));
    setSelectedSinglesDivisionId((current) =>
      current && divisions.some((division) => division.id === current && division.format === "singles")
        ? current
        : divisions.find((division) => division.format === "singles")?.id || ""
    );
    setSelectedDoublesDivisionId((current) =>
      current && divisions.some((division) => division.id === current && division.format === "doubles")
        ? current
        : divisions.find((division) => division.format === "doubles")?.id || ""
    );
  }, [divisions]);

  useEffect(() => {
    if (!selectedScheduleDivision) return;
    setScheduleName(selectedScheduleDivision.name);
    setScheduleSkillLevel(selectedScheduleDivision.skill_level);
    setScheduleFormat(selectedScheduleDivision.format);
  }, [selectedScheduleDivision]);

  useEffect(() => {
    if (!selectedScheduleDivision) {
      setSelectedSchedulePlayerIds([]);
      setSelectedScheduleTeamIds([]);
      return;
    }

    const existingEntries = divisionEntries.filter((entry) => entry.division_id === selectedScheduleDivision.id);
    if (selectedScheduleDivision.format === "doubles") {
      setSelectedScheduleTeamIds(existingEntries.flatMap((entry) => (entry.team_id ? [entry.team_id] : [])));
      return;
    }

    setSelectedSchedulePlayerIds(existingEntries.flatMap((entry) => (entry.player_id ? [entry.player_id] : [])));
  }, [selectedScheduleDivision, divisionEntries]);

  useEffect(() => {
    setSchedulePlayerSearch("");
    setScheduleRatingFilter("all");
    setShowSelectedSchedulePlayersOnly(false);
    setScheduleTeamSearch("");
    setShowSelectedScheduleTeamsOnly(false);
    setReplaceExistingSchedule(false);
    setScheduleStep("setup");
    setManualMatches([{ id: "manual-1", entryASelectionId: "", entryBSelectionId: "" }]);
  }, [selectedScheduleDivisionId]);

  async function loadAdminData() {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("Checking admin access...");
    const authResult = await withTimeout(
      supabase.auth.getUser(),
      6000,
      "Supabase auth did not respond. Refresh the page or sign in again."
    );
    if ("timeout" in authResult) {
      setMessage(authResult.timeout);
      setLoading(false);
      return;
    }
    const { data: authData, error: authError } = authResult;
    if (authError || !authData.user) {
      setMessage("Sign in as an admin before creating tournaments or divisions.");
      setLoading(false);
      router.replace("/login");
      return;
    }

    let profileResult = await withTimeout(
      supabase.from("users").select("id, club_id, role, full_name, email, access_disabled").eq("id", authData.user.id).single(),
      6000,
      "The app user profile lookup did not respond. Check the public.users admin row and RLS policies."
    );
    if (!("timeout" in profileResult) && profileResult.error && isMissingAccessDisabledColumn(profileResult.error)) {
      profileResult = await withTimeout(
        supabase.from("users").select("id, club_id, role, full_name, email").eq("id", authData.user.id).single(),
        6000,
        "The app user profile lookup did not respond. Check the public.users admin row and RLS policies."
      );
    }
    if ("timeout" in profileResult) {
      setMessage(profileResult.timeout);
      setLoading(false);
      return;
    }
    const { data: profile, error: profileError } = profileResult;

    if (profileError || !profile) {
      setMessage("Your login works, but no app user profile was found for this account.");
      setLoading(false);
      await supabase.auth.signOut();
      router.replace("/login");
      return;
    }

    if (profile.role !== "admin") {
      setMessage("This account is not an admin.");
      setLoading(false);
      router.replace("/player");
      return;
    }

    const loadedAdmin = profile as AdminUser;
    if (loadedAdmin.access_disabled) {
      setMessage("This admin account is disabled.");
      setLoading(false);
      await supabase.auth.signOut();
      router.replace("/login");
      return;
    }

    setAdminUser(loadedAdmin);
    void loadAdminConfig();
    await Promise.all([loadPlayers(loadedAdmin.club_id), loadAppUsers(loadedAdmin.club_id), loadTeams(loadedAdmin.club_id)]);
    const loadedTournaments = await loadTournaments(loadedAdmin.club_id);
    setSelectedTournamentId((current) => current || loadedTournaments[0]?.id || "");
    setMessage(loadedTournaments.length > 0 ? "Admin access ready." : "Admin access ready. Create your first tournament.");
    setLoading(false);
  }

  async function loadAdminConfig() {
    try {
      const response = await fetch("/api/admin/config/");
      const result = (await response.json()) as { serviceRoleConfigured?: boolean };
      setServiceRoleConfigured(Boolean(result.serviceRoleConfigured));
    } catch {
      setServiceRoleConfigured(false);
    }
  }

  async function loadTournaments(clubId: string) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, sport, start_date, end_date")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return [];
    }

    const rows = (data || []) as TournamentRow[];
    setTournaments(rows);
    return rows;
  }

  async function loadDivisions(tournamentId: string) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("divisions")
      .select("id, tournament_id, name, skill_level, format")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    const rows = (data || []) as DivisionRow[];
    const divisionIds = rows.map((division) => division.id);
    setDivisions(rows);
    await Promise.all([loadDivisionEntries(divisionIds), loadMatches(divisionIds)]);
  }

  async function loadPlayers(clubId: string) {
    if (!supabase) return [];
    let result = await supabase
      .from("player_profiles")
      .select("id, club_id, display_name, mobile_number, rating, user_id")
      .eq("club_id", clubId)
      .order("display_name", { ascending: true });
    let rows = (result.data || []) as PlayerProfileRow[];
    let error = result.error;
    if (error && isMissingMobileNumberColumn(error)) {
      const fallbackResult = await supabase
        .from("player_profiles")
        .select("id, club_id, display_name, rating, user_id")
        .eq("club_id", clubId)
        .order("display_name", { ascending: true });
      rows = (fallbackResult.data || []) as PlayerProfileRow[];
      error = fallbackResult.error;
    }

    if (error) {
      setMessage(error.message);
      return [];
    }

    setPlayers(rows);
    return rows;
  }

  async function loadAppUsers(clubId: string) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("users")
      .select("id, club_id, role, full_name, email, access_disabled")
      .eq("club_id", clubId)
      .order("full_name", { ascending: true });

    if (error) {
      if (!isMissingAccessDisabledColumn(error)) {
        setMessage(error.message);
        return [];
      }

      const { data: fallbackData, error: fallbackError } = await supabase
        .from("users")
        .select("id, club_id, role, full_name, email")
        .eq("club_id", clubId)
        .order("full_name", { ascending: true });

      if (fallbackError) {
        setMessage(fallbackError.message);
        return [];
      }

      const fallbackRows = ((fallbackData || []) as AppUserRow[]).map((user) => ({ ...user, access_disabled: false }));
      setAppUsers(fallbackRows);
      return fallbackRows;
    }

    const rows = ((data || []) as AppUserRow[]).map((user) => ({ ...user, access_disabled: Boolean(user.access_disabled) }));
    setAppUsers(rows);
    return rows;
  }

  async function loadTeams(clubId: string) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("teams")
      .select("id, club_id, name")
      .eq("club_id", clubId)
      .order("name", { ascending: true });

    if (error) {
      setMessage(error.message);
      return [];
    }

    const rows = (data || []) as TeamRow[];
    setTeams(rows);
    return rows;
  }

  async function loadDivisionEntries(divisionIds: string[]) {
    if (!supabase || divisionIds.length === 0) {
      setDivisionEntries([]);
      return [];
    }

    const { data, error } = await supabase
      .from("division_entries")
      .select("id, division_id, label, player_id, team_id")
      .in("division_id", divisionIds)
      .order("label", { ascending: true });

    if (error) {
      setMessage(error.message);
      return [];
    }

    const rows = (data || []) as DivisionEntryRow[];
    setDivisionEntries(rows);
    return rows;
  }

  async function loadMatches(divisionIds: string[]) {
    if (!supabase || divisionIds.length === 0) {
      setMatches([]);
      setMatchSets([]);
      return [];
    }

    const { data, error } = await supabase
      .from("matches")
      .select(matchSelectWithTargetScore)
      .in("division_id", divisionIds)
      .order("schedule_week_start", { ascending: true })
      .order("round", { ascending: true });

    if (error) {
      if (!isMissingTargetScoreColumn(error)) {
        setMessage(error.message);
        return [];
      }

      const { data: fallbackData, error: fallbackError } = await supabase
        .from("matches")
        .select(matchSelectBasic)
        .in("division_id", divisionIds)
        .order("schedule_week_start", { ascending: true })
        .order("round", { ascending: true });

      if (fallbackError) {
        setMessage(fallbackError.message);
        return [];
      }

      const fallbackRows = ((fallbackData || []) as MatchRow[]).map((match) => ({
        ...match,
        target_score: 11,
        number_of_sets: 3,
        restrict_score_updates: false,
        score_update_before_days: 0,
        score_update_after_days: 0,
        allow_forfeit: true,
        forfeit_before_days: 0,
        forfeit_after_days: 0
      }));
      setMatches(fallbackRows);
      await loadMatchSets(fallbackRows.map((match) => match.id));
      return fallbackRows;
    }

    const rows = (data || []) as MatchRow[];
    setMatches(rows);
    await loadMatchSets(rows.map((match) => match.id));
    return rows;
  }

  async function loadMatchSets(matchIds: string[]) {
    if (!supabase || matchIds.length === 0) {
      setMatchSets([]);
      return [];
    }

    const { data, error } = await supabase
      .from("match_sets")
      .select("match_id, set_number, entry_a_score, entry_b_score")
      .in("match_id", matchIds)
      .order("set_number", { ascending: true });

    if (error) {
      setMessage(error.message);
      return [];
    }

    const rows = (data || []) as MatchSetRow[];
    setMatchSets(rows);
    return rows;
  }

  async function createTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !adminUser) return;

    setSavingTournament(true);
    setMessage("");
    const { data, error } = await supabase
      .from("tournaments")
      .insert({
        club_id: adminUser.club_id,
        name: tournamentForm.name.trim(),
        sport: tournamentForm.sport,
        start_date: tournamentForm.startDate,
        end_date: tournamentForm.endDate,
        created_by: adminUser.id
      })
      .select("id, name, sport, start_date, end_date")
      .single();

    setSavingTournament(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    const created = data as TournamentRow;
    setTournaments((current) => [created, ...current]);
    setSelectedTournamentId(created.id);
    setTournamentForm((current) => ({ ...current, name: "" }));
    setMessage("Tournament created.");
  }

  async function saveDivision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedTournamentId) return;

    const skillLevel = divisionForm.skillLevel.trim();
    if (!skillLevel) {
      setMessage("Enter a skill level before saving the division.");
      return;
    }

    setSavingDivision(true);
    setMessage("");
    const { data, error } = await supabase
      .from("divisions")
      .insert({
        tournament_id: selectedTournamentId,
        name: divisionName,
        skill_level: skillLevel,
        format: divisionForm.format
      })
      .select("id, tournament_id, name, skill_level, format")
      .single();

    setSavingDivision(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setDivisions((current) => [data as DivisionRow, ...current]);
    setMessage("Division saved.");
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !adminUser) return;

    const displayName = playerForm.displayName.trim();
    if (!displayName) {
      setMessage("Enter a player name.");
      return;
    }

    setSavingPlayer(true);
    setMessage("");
    const { data, error } = await supabase
      .from("player_profiles")
      .insert({
        club_id: adminUser.club_id,
        display_name: displayName,
        mobile_number: playerForm.mobileNumber.trim() || null,
        rating: playerForm.rating.trim() || null
      })
      .select("id, club_id, display_name, mobile_number, rating, user_id")
      .single();

    setSavingPlayer(false);
    if (error) {
      if (!isMissingMobileNumberColumn(error)) {
        setMessage(error.message);
        return;
      }

      const fallback = await supabase
        .from("player_profiles")
        .insert({
          club_id: adminUser.club_id,
          display_name: displayName,
          rating: playerForm.rating.trim() || null
        })
        .select("id, club_id, display_name, rating, user_id")
        .single();

      if (fallback.error) {
        setMessage(fallback.error.message);
        return;
      }

      setPlayers((current) => [...current, fallback.data as PlayerProfileRow].sort((a, b) => a.display_name.localeCompare(b.display_name)));
      setPlayerForm({ displayName: "", mobileNumber: "", rating: "" });
      setMessage("Player added. Run supabase/add-player-mobile-number.sql to save mobile numbers.");
      return;
    }

    setPlayers((current) => [...current, data as PlayerProfileRow].sort((a, b) => a.display_name.localeCompare(b.display_name)));
    setPlayerForm({ displayName: "", mobileNumber: "", rating: "" });
    setMessage("Player added.");
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !adminUser) return;

    const fullName = inviteForm.fullName.trim();
    const email = inviteForm.email.trim().toLowerCase();
    const password = inviteForm.password.trim();
    if (!fullName || !email) {
      setMessage("Enter a name and email before creating the login.");
      return;
    }
    if (password && password.length < 6) {
      setMessage("Temporary password must be at least 6 characters.");
      return;
    }

    setInvitingUser(true);
    setMessage("");
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      setInvitingUser(false);
      setMessage("Sign in as an admin before inviting users.");
      return;
    }

    const response = await fetch("/api/admin/users/invite/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        fullName,
        password: password || undefined,
        role: inviteForm.role,
        mobileNumber: inviteForm.mobileNumber,
        rating: inviteForm.rating,
        createPlayerProfile: inviteForm.role === "player" && inviteForm.playerProfileMode === "__new",
        playerProfileId: inviteForm.playerProfileMode && inviteForm.playerProfileMode !== "__new" ? inviteForm.playerProfileMode : undefined
      })
    });
    const result = (await response.json()) as { error?: string };

    setInvitingUser(false);
    if (!response.ok) {
      setMessage(result.error || "Could not create the login.");
      return;
    }

    setInviteForm({ fullName: "", email: "", mobileNumber: "", password: "", role: "player", rating: "", playerProfileMode: "__new" });
    await Promise.all([loadAppUsers(adminUser.club_id), loadPlayers(adminUser.club_id)]);
    setMessage(password ? `Login created for ${email}.` : `Login invite sent to ${email}.`);
  }

  async function updateUserRole(userId: string, role: "admin" | "player") {
    if (!supabase || !adminUser) return;
    if (userId === adminUser.id && role !== "admin") {
      setMessage("You cannot remove your own admin role while signed in.");
      return;
    }
    setUpdatingUserId(userId);
    setMessage("");
    const { error } = await supabase.from("users").update({ role }).eq("id", userId);
    setUpdatingUserId("");

    if (error) {
      setMessage(error.message);
      return;
    }

    setAppUsers((current) => current.map((user) => (user.id === userId ? { ...user, role } : user)));
    setMessage("User role updated.");
  }

  async function toggleUserAccess(user: AppUserRow) {
    if (!supabase || !adminUser) return;
    if (user.id === adminUser.id && !user.access_disabled) {
      setMessage("You cannot disable your own admin account while signed in.");
      return;
    }

    const nextDisabled = !user.access_disabled;
    setUpdatingUserId(user.id);
    setMessage("");
    const { error } = await supabase.from("users").update({ access_disabled: nextDisabled }).eq("id", user.id);
    setUpdatingUserId("");

    if (error) {
      setMessage(isMissingAccessDisabledColumn(error) ? "Run supabase/add-user-access-disabled.sql before disabling user access." : error.message);
      return;
    }

    setAppUsers((current) => current.map((item) => (item.id === user.id ? { ...item, access_disabled: nextDisabled } : item)));
    setMessage(nextDisabled ? "User access disabled." : "User access enabled.");
  }

  async function linkUserToPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !adminUser || !linkForm.userId || !linkForm.playerProfileId) return;

    setLinkingUser(true);
    setMessage("");

    const { error: unlinkError } = await supabase.from("player_profiles").update({ user_id: null }).eq("user_id", linkForm.userId);
    if (unlinkError) {
      setLinkingUser(false);
      setMessage(unlinkError.message);
      return;
    }

    const { error } = await supabase
      .from("player_profiles")
      .update({ user_id: linkForm.userId })
      .eq("id", linkForm.playerProfileId)
      .eq("club_id", adminUser.club_id);

    setLinkingUser(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setLinkForm({ userId: "", playerProfileId: "" });
    await loadPlayers(adminUser.club_id);
    setMessage("Login linked to player profile.");
  }

  async function importPeople(event: React.ChangeEvent<HTMLInputElement>) {
    if (!supabase || !adminUser) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingPlayers(true);
    setMessage("");
    const rows = await parsePeopleImportFile(file);

    if (rows.length === 0) {
      setImportingPlayers(false);
      setMessage("No people found. Use columns: full_name, email, mobile_number, role, password, rating.");
      event.target.value = "";
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      setImportingPlayers(false);
      event.target.value = "";
      setMessage("Sign in as an admin before importing users.");
      return;
    }

    const errors: string[] = [];
    let created = 0;
    let profilesOnly = 0;
    let loginServiceUnavailable = false;
    for (const row of rows) {
      const response = await fetch("/api/admin/users/invite/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: row.email,
          fullName: row.fullName,
          password: row.password || undefined,
          role: row.role,
          mobileNumber: row.mobileNumber,
          rating: row.rating,
          createPlayerProfile: row.createPlayerProfile
        })
      });
      const result = (await response.json()) as { error?: string };
      if (response.ok) {
        created += 1;
      } else {
        if (response.status === 501 && isServiceRoleMissing(result.error) && row.role === "player" && row.createPlayerProfile) {
          loginServiceUnavailable = true;
          const { error: profileError } = await supabase.from("player_profiles").insert({
            club_id: adminUser.club_id,
            display_name: row.fullName,
            mobile_number: row.mobileNumber || null,
            rating: row.rating || null
          });
          if (profileError && isMissingMobileNumberColumn(profileError)) {
            const fallback = await supabase.from("player_profiles").insert({
              club_id: adminUser.club_id,
              display_name: row.fullName,
              rating: row.rating || null
            });
            if (fallback.error) {
              errors.push(`${row.email}: ${fallback.error.message}`);
            } else {
              profilesOnly += 1;
            }
          } else if (profileError) {
            errors.push(`${row.email}: ${profileError.message}`);
          } else {
            profilesOnly += 1;
          }
          continue;
        }
        if (response.status === 501 && isServiceRoleMissing(result.error)) {
          loginServiceUnavailable = true;
        }
        errors.push(`${row.email}: ${result.error || "not imported"}`);
      }
    }

    setImportingPlayers(false);
    event.target.value = "";
    await Promise.all([loadAppUsers(adminUser.club_id), loadPlayers(adminUser.club_id)]);
    setMessage(
      loginServiceUnavailable && profilesOnly > 0
        ? `Imported ${profilesOnly} player profile${profilesOnly === 1 ? "" : "s"}. Login accounts were skipped because SUPABASE_SERVICE_ROLE_KEY is not set. ${errors.length > 0 ? errors.slice(0, 2).join(" ") : ""}`
        : errors.length > 0
        ? `Imported ${created} of ${rows.length}. ${errors.slice(0, 3).join(" ")}${errors.length > 3 ? " More errors hidden." : ""}`
        : `Imported ${created} user${created === 1 ? "" : "s"}.`
    );
  }

  async function downloadTemplate(filename: string, url: string) {
    setDownloadingTemplate(filename);
    setMessage("");
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Template file was not available (${response.status}).`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage(`${filename} downloaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template download failed.");
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingTemplate("");
    }
  }

  async function assignSinglesPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !assignmentForm.playerId || !selectedSinglesDivision) return;

    const player = players.find((item) => item.id === assignmentForm.playerId);
    if (!player) return;
    if (divisionEntries.some((entry) => entry.division_id === selectedSinglesDivision.id && entry.player_id === player.id)) {
      setMessage(`${player.display_name} is already assigned to ${selectedSinglesDivision.name}.`);
      return;
    }

    setAssigningEntry(true);
    setMessage("");
    const { data, error } = await supabase
      .from("division_entries")
      .insert({
        division_id: selectedSinglesDivision.id,
        label: player.display_name,
        player_id: player.id
      })
      .select("id, division_id, label, player_id, team_id")
      .single();

    setAssigningEntry(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setDivisionEntries((current) => [...current, data as DivisionEntryRow].sort((a, b) => a.label.localeCompare(b.label)));
    setMessage(`${player.display_name} assigned to ${selectedSinglesDivision.name}.`);
  }

  async function createDoublesTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !adminUser || !selectedDoublesDivision) return;

    if (!teamForm.playerAId || !teamForm.playerBId || teamForm.playerAId === teamForm.playerBId) {
      setMessage("Choose two different players for a doubles team.");
      return;
    }

    const playerA = players.find((player) => player.id === teamForm.playerAId);
    const playerB = players.find((player) => player.id === teamForm.playerBId);
    if (!playerA || !playerB) return;

    const teamName = teamForm.name.trim() || `${playerA.display_name} / ${playerB.display_name}`;
    if (divisionEntries.some((entry) => entry.division_id === selectedDoublesDivision.id && entry.label.toLowerCase() === teamName.toLowerCase())) {
      setMessage(`${teamName} is already assigned to ${selectedDoublesDivision.name}.`);
      return;
    }

    setCreatingTeam(true);
    setMessage("");
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        club_id: adminUser.club_id,
        name: teamName
      })
      .select("id, name")
      .single();

    if (teamError || !team) {
      setCreatingTeam(false);
      setMessage(teamError?.message || "Could not create team.");
      return;
    }

    const { error: membersError } = await supabase.from("team_members").insert([
      { team_id: team.id, player_id: playerA.id },
      { team_id: team.id, player_id: playerB.id }
    ]);

    if (membersError) {
      setCreatingTeam(false);
      setMessage(membersError.message);
      return;
    }

    const { data: entry, error: entryError } = await supabase
      .from("division_entries")
      .insert({
        division_id: selectedDoublesDivision.id,
        label: teamName,
        team_id: team.id
      })
      .select("id, division_id, label, player_id, team_id")
      .single();

    setCreatingTeam(false);
    if (entryError) {
      setMessage(entryError.message);
      return;
    }

    setDivisionEntries((current) => [...current, entry as DivisionEntryRow].sort((a, b) => a.label.localeCompare(b.label)));
    setTeamForm({ name: "", playerAId: "", playerBId: "" });
    setMessage(`${teamName} created and assigned to ${selectedDoublesDivision.name}.`);
  }

  async function createStandaloneTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !adminUser) return;

    if (!teamForm.playerAId || !teamForm.playerBId || teamForm.playerAId === teamForm.playerBId) {
      setMessage("Choose two different players for a doubles team.");
      return;
    }

    const playerA = players.find((player) => player.id === teamForm.playerAId);
    const playerB = players.find((player) => player.id === teamForm.playerBId);
    if (!playerA || !playerB) return;

    const teamName = teamForm.name.trim() || `${playerA.display_name} / ${playerB.display_name}`;
    if (teams.some((team) => team.name.toLowerCase() === teamName.toLowerCase())) {
      setMessage(`${teamName} already exists.`);
      return;
    }

    setCreatingTeam(true);
    setMessage("");
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        club_id: adminUser.club_id,
        name: teamName
      })
      .select("id, club_id, name")
      .single();

    if (teamError || !team) {
      setCreatingTeam(false);
      setMessage(teamError?.message || "Could not create team.");
      return;
    }

    const { error: membersError } = await supabase.from("team_members").insert([
      { team_id: team.id, player_id: playerA.id },
      { team_id: team.id, player_id: playerB.id }
    ]);

    setCreatingTeam(false);
    if (membersError) {
      setMessage(membersError.message);
      return;
    }

    setTeams((current) => [...current, team as TeamRow].sort((a, b) => a.name.localeCompare(b.name)));
    setTeamForm({ name: "", playerAId: "", playerBId: "" });
    setMessage(`${teamName} created.`);
  }

  async function createScheduleTeam() {
    if (!supabase || !adminUser) return;

    if (!scheduleTeamForm.playerAId || !scheduleTeamForm.playerBId || scheduleTeamForm.playerAId === scheduleTeamForm.playerBId) {
      setMessage("Choose two different players for a doubles team.");
      return;
    }

    const playerA = players.find((player) => player.id === scheduleTeamForm.playerAId);
    const playerB = players.find((player) => player.id === scheduleTeamForm.playerBId);
    if (!playerA || !playerB) return;

    const teamName = scheduleTeamForm.name.trim() || `${playerA.display_name} / ${playerB.display_name}`;
    if (teams.some((team) => team.name.toLowerCase() === teamName.toLowerCase())) {
      setMessage(`${teamName} already exists. Select it from the team list.`);
      return;
    }

    setCreatingScheduleTeam(true);
    setMessage("");
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        club_id: adminUser.club_id,
        name: teamName
      })
      .select("id, club_id, name")
      .single();

    if (teamError || !team) {
      setCreatingScheduleTeam(false);
      setMessage(teamError?.message || "Could not create team.");
      return;
    }

    const { error: membersError } = await supabase.from("team_members").insert([
      { team_id: team.id, player_id: playerA.id },
      { team_id: team.id, player_id: playerB.id }
    ]);

    setCreatingScheduleTeam(false);
    if (membersError) {
      setMessage(membersError.message);
      return;
    }

    const createdTeam = team as TeamRow;
    setTeams((current) => [...current, createdTeam].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedScheduleTeamIds((current) => Array.from(new Set([...current, createdTeam.id])));
    setScheduleTeamForm({ name: "", playerAId: "", playerBId: "" });
    setMessage(`${teamName} created. It is selected for scheduling.`);
  }

  async function ensureScheduleDivision() {
    if (!supabase || !selectedTournamentId) return undefined;
    if (selectedScheduleDivision) return selectedScheduleDivision;

    const skillLevel = scheduleSkillLevel.trim() || "All Levels";
    const name = scheduleName.trim() || `${skillLevel} ${scheduleFormat === "singles" ? "Singles" : "Doubles"}`;
    setMessage("");
    const { data, error } = await supabase
      .from("divisions")
      .insert({
        tournament_id: selectedTournamentId,
        name,
        skill_level: skillLevel,
        format: scheduleFormat
      })
      .select("id, tournament_id, name, skill_level, format")
      .single();

    if (error) {
      setMessage(error.message);
      return undefined;
    }

    const created = data as DivisionRow;
    setDivisions((current) => [created, ...current]);
    setSelectedScheduleDivisionId(created.id);
    return created;
  }

  async function ensureScheduleEntries(division: DivisionRow) {
    if (!supabase) return [];

    const existingEntries = divisionEntries.filter((entry) => entry.division_id === division.id);
    const selectedIds = division.format === "doubles" ? selectedScheduleTeamIds : selectedSchedulePlayerIds;
    const missingRows: Array<{ division_id: string; label: string; player_id?: string; team_id?: string }> = [];

    for (const selectedId of selectedIds) {
      const existing = existingEntries.find((entry) => (division.format === "doubles" ? entry.team_id === selectedId : entry.player_id === selectedId));
      if (existing) continue;

      if (division.format === "doubles") {
        const team = teams.find((item) => item.id === selectedId);
        if (team) missingRows.push({ division_id: division.id, label: team.name, team_id: team.id });
        continue;
      }

      const player = players.find((item) => item.id === selectedId);
      if (player) missingRows.push({ division_id: division.id, label: player.display_name, player_id: player.id });
    }

    let createdEntries: DivisionEntryRow[] = [];
    if (missingRows.length > 0) {
      const { data, error } = await supabase
        .from("division_entries")
        .insert(missingRows)
        .select("id, division_id, label, player_id, team_id");

      if (error) {
        setMessage(error.message);
        return [];
      }

      createdEntries = (data || []) as DivisionEntryRow[];
      setDivisionEntries((current) => [...current, ...createdEntries].sort((a, b) => a.label.localeCompare(b.label)));
    }

    return [...existingEntries, ...createdEntries]
      .filter((entry) => selectedIds.includes(division.format === "doubles" ? entry.team_id || "" : entry.player_id || ""))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async function generateSchedule() {
    if (!supabase || !selectedTournament) return;

    if (!scheduleName.trim()) {
      setMessage("Enter a schedule name before continuing.");
      return;
    }

    if (scheduleSelectionCount < 2) {
      setMessage(`Choose at least 2 ${activeScheduleFormat === "doubles" ? "teams" : "players"} before generating.`);
      return;
    }

    if (scheduleType === "manual") {
      const usableManualMatches = manualMatches.filter((match) => match.entryASelectionId && match.entryBSelectionId);
      if (usableManualMatches.length === 0) {
        setMessage("Add at least one manual matchup before generating.");
        return;
      }
      if (usableManualMatches.some((match) => match.entryASelectionId === match.entryBSelectionId)) {
        setMessage("Manual matchups need two different players or teams.");
        return;
      }
    }

    setGeneratingSchedule(true);
    setMessage("");
    const scheduleDivision = await ensureScheduleDivision();
    if (!scheduleDivision) {
      setGeneratingSchedule(false);
      return;
    }

    const existingMatches = matches.filter((match) => match.division_id === scheduleDivision.id);
    if (existingMatches.length > 0 && !replaceExistingSchedule) {
      setGeneratingSchedule(false);
      setMessage(`${scheduleDivision.name} already has matches. Turn on Replace existing schedule if you want to rebuild this schedule.`);
      return;
    }

    if (existingMatches.length > 0 && !canReplaceExistingSchedule) {
      setGeneratingSchedule(false);
      setMessage(`${scheduleDivision.name} has posted results or forfeits, so its schedule cannot be replaced.`);
      return;
    }

    const targetScore = changeWinningScore ? Number(scheduleTargetScore) || 11 : 11;
    const entriesForDivision = await ensureScheduleEntries(scheduleDivision);

    if (entriesForDivision.length < 2) {
      setGeneratingSchedule(false);
      return;
    }

    const scheduleEntries: DivisionEntry[] = entriesForDivision.map((entry) => ({
      id: entry.id,
      divisionId: entry.division_id,
      label: entry.label,
      playerIds: []
    }));

    const generated =
      scheduleType === "manual"
        ? manualMatches
            .filter((match) => match.entryASelectionId && match.entryBSelectionId && match.entryASelectionId !== match.entryBSelectionId)
            .flatMap((manualMatch, index) => {
              const entryA = entriesForDivision.find((entry) =>
                activeScheduleFormat === "doubles" ? entry.team_id === manualMatch.entryASelectionId : entry.player_id === manualMatch.entryASelectionId
              );
              const entryB = entriesForDivision.find((entry) =>
                activeScheduleFormat === "doubles" ? entry.team_id === manualMatch.entryBSelectionId : entry.player_id === manualMatch.entryBSelectionId
              );
              if (!entryA || !entryB) return [];
              const scheduleWeekStart = scheduleStartDate || selectedTournament.start_date;
              return [
                {
                  id: `${scheduleDivision.id}-manual-${index + 1}-${entryA.id}-${entryB.id}`,
                  divisionId: scheduleDivision.id,
                  round: index + 1,
                  roundLabel: "Manual",
                  entryAId: entryA.id,
                  entryBId: entryB.id,
                  scheduleWeekStart,
                  scheduleWeekEnd: addDays(scheduleWeekStart, 6),
                  extensionWeekStart: addDays(scheduleWeekStart, 7),
                  extensionWeekEnd: addDays(scheduleWeekStart, 13),
                  status: "scheduled" as MatchStatus,
                  sets: []
                }
              ];
            })
        : scheduleType === "eliminator"
        ? generateEliminatorSchedule({
            divisionId: scheduleDivision.id,
            entries: scheduleEntries,
            startDate: scheduleStartDate || selectedTournament.start_date,
            endDate: selectedTournament.end_date
          })
        : generateRoundRobinSchedule({
            divisionId: scheduleDivision.id,
            entries: scheduleEntries,
            startDate: scheduleStartDate || selectedTournament.start_date,
            endDate: selectedTournament.end_date
          });

    if (generated.length === 0) {
      setGeneratingSchedule(false);
      setMessage(`${scheduleDivision.name} has no playable rounds in the tournament date range.`);
      return;
    }

    const rowsToInsert: Array<{
      division_id: string;
      round: number;
      round_label: string | null;
      entry_a_id: string;
      entry_b_id: string;
      target_score: number;
      number_of_sets: number;
      restrict_score_updates: boolean;
      score_update_before_days: number;
      score_update_after_days: number;
      allow_forfeit: boolean;
      forfeit_before_days: number;
      forfeit_after_days: number;
      schedule_week_start: string;
      schedule_week_end: string;
      extension_week_start: string;
      extension_week_end: string;
      status: MatchStatus;
    }> = generated.map((match) => ({
      division_id: match.divisionId,
      round: match.round,
      round_label: match.roundLabel || null,
      entry_a_id: match.entryAId,
      entry_b_id: match.entryBId,
      target_score: targetScore,
      number_of_sets: Number(scheduleNumberOfSets) || 3,
      restrict_score_updates: restrictScoreUpdates,
      score_update_before_days: Number(scoreUpdateBeforeDays) || 0,
      score_update_after_days: Number(scoreUpdateAfterDays) || 0,
      allow_forfeit: allowGameForfeit,
      forfeit_before_days: Number(forfeitBeforeDays) || 0,
      forfeit_after_days: Number(forfeitAfterDays) || 0,
      schedule_week_start: match.scheduleWeekStart,
      schedule_week_end: match.scheduleWeekEnd,
      extension_week_start: match.extensionWeekStart,
      extension_week_end: match.extensionWeekEnd,
      status: match.status
    }));

    let insertData: MatchRow[] | null = null;
    let insertErrorMessage = "";
    let savedOptionalColumns = true;

    const { data, error } = await supabase.from("matches").insert(rowsToInsert).select(matchSelectWithTargetScore);

    if (error && isMissingTargetScoreColumn(error)) {
      savedOptionalColumns = false;
      const rowsWithoutOptionalColumns = rowsToInsert.map((row) => ({
        division_id: row.division_id,
        round: row.round,
        entry_a_id: row.entry_a_id,
        entry_b_id: row.entry_b_id,
        schedule_week_start: row.schedule_week_start,
        schedule_week_end: row.schedule_week_end,
        extension_week_start: row.extension_week_start,
        extension_week_end: row.extension_week_end,
        status: row.status
      }));
      const fallback = await supabase.from("matches").insert(rowsWithoutOptionalColumns).select(matchSelectBasic);
      insertData = ((fallback.data || []) as MatchRow[]).map((match) => ({
        ...match,
        target_score: 11,
        number_of_sets: 3,
        restrict_score_updates: false,
        score_update_before_days: 0,
        score_update_after_days: 0,
        allow_forfeit: true,
        forfeit_before_days: 0,
        forfeit_after_days: 0
      }));
      insertErrorMessage = fallback.error?.message || "";
    } else {
      insertData = (data || []) as MatchRow[];
      insertErrorMessage = error?.message || "";
    }

    setGeneratingSchedule(false);
    if (insertErrorMessage) {
      setMessage(`Schedule could not be saved: ${insertErrorMessage}`);
      return;
    }

    const created = insertData || [];
    let replacementNote = "";
    if (existingMatches.length > 0 && replaceExistingSchedule) {
      const { error: deleteError } = await supabase
        .from("matches")
        .delete()
        .in(
          "id",
          existingMatches.map((match) => match.id)
        );

      if (deleteError) {
        replacementNote = ` New matches were created, but old matches could not be removed: ${deleteError.message}`;
      }
    }

    setMatches((current) =>
      [
        ...current.filter((match) => !(replaceExistingSchedule && existingMatches.some((existing) => existing.id === match.id))),
        ...created
      ].sort((a, b) => a.schedule_week_start.localeCompare(b.schedule_week_start) || a.round - b.round)
    );

    const scheduleLabel = scheduleType === "manual" ? "manual" : scheduleType === "eliminator" ? generated[0]?.roundLabel || "Eliminator" : "round robin";
    setMessage(
      savedOptionalColumns
        ? `Generated ${created.length} ${scheduleLabel} match${created.length === 1 ? "" : "es"} to ${targetScore} points.${replacementNote}`
        : `Generated ${created.length} match${created.length === 1 ? "" : "es"} with default saved fields. Run supabase/add-match-scheduler-options.sql for custom points, bracket labels, and schedule options.`
    );
  }

  function publishStandings() {
    if (!selectedTournament) return;
    if (matches.length === 0) {
      setMessage("Generate a schedule before publishing standings.");
      return;
    }
    setMessage("Standings are live. Leaderboards are calculated from completed matches, forfeits, and cancellations.");
  }

  async function saveAdminMatch(match: MatchRow, form: AdminMatchEditForm) {
    if (!supabase) return;

    const nextStatus = form.status;
    const shouldSaveScores = nextStatus === "completed" || nextStatus === "score_submitted";
    const nextSets = shouldSaveScores ? buildAdminSets(form) : [];
    const winnerEntryId = shouldSaveScores ? getAdminWinnerEntryId(match, nextSets) : nextStatus === "forfeit" ? form.winnerEntryId : null;

    if (shouldSaveScores && !winnerEntryId) {
      setMessage("Enter a valid score with a clear winner.");
      return;
    }
    if (nextStatus === "forfeit" && !winnerEntryId) {
      setMessage("Choose the forfeit winner.");
      return;
    }

    setEditingMatchId(match.id);
    setMessage("");

    const { error: deleteSetsError } = await supabase.from("match_sets").delete().eq("match_id", match.id);
    if (deleteSetsError) {
      setEditingMatchId("");
      setMessage(deleteSetsError.message);
      return;
    }

    if (nextSets.length > 0) {
      const { error: insertSetsError } = await supabase.from("match_sets").insert(
        nextSets.map((set) => ({
          match_id: match.id,
          set_number: set.setNumber,
          entry_a_score: set.entryAScore,
          entry_b_score: set.entryBScore
        }))
      );

      if (insertSetsError) {
        setEditingMatchId("");
        setMessage(insertSetsError.message);
        return;
      }
    }

    const { data, error } = await supabase
      .from("matches")
      .update({
        round_label: form.roundLabel.trim() || null,
        target_score: Number(form.targetScore) || match.target_score || 11,
        schedule_week_start: form.scheduleWeekStart,
        schedule_week_end: form.scheduleWeekEnd,
        extension_week_start: form.extensionWeekStart,
        extension_week_end: form.extensionWeekEnd,
        status: nextStatus,
        winner_entry_id: winnerEntryId,
        forfeit_by_entry_id: nextStatus === "forfeit" ? winnerEntryId : null
      })
      .eq("id", match.id)
      .select(matchSelectWithTargetScore)
      .single();

    setEditingMatchId("");
    if (error) {
      setMessage(error.message);
      return;
    }

    setMatches((current) => current.map((item) => (item.id === match.id ? (data as MatchRow) : item)));
    setMatchSets((current) => [
      ...current.filter((set) => set.match_id !== match.id),
      ...nextSets.map((set) => ({
        match_id: match.id,
        set_number: set.setNumber,
        entry_a_score: set.entryAScore,
        entry_b_score: set.entryBScore
      }))
    ]);
    setMessage("Match updated.");
  }

  if (loading || !adminUser) {
    return (
      <section className="hero">
        <div>
          <p className="eyebrow">Admin workspace</p>
          <h1>Admin access required</h1>
          <p className="hero-copy">
            Tournament setup, player imports, scheduling, forfeits, and score corrections are available only to club admins.
          </p>
          <div className="toolbar">
            <Link className="button" href="/login">
              Open login
            </Link>
            <Link className="button secondary" href="/player">
              My matches
            </Link>
          </div>
        </div>
        <div className="card notice">
          <h2>{loading ? "Checking access" : "No admin access"}</h2>
          <p className="subtle" data-testid="admin-status" role="status">
            {message}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-console">
      <aside className="admin-sidebar" aria-label="Admin sections">
        <button className={`admin-nav-item ${activeSection === "players" ? "active" : ""}`} onClick={() => setActiveSection("players")} type="button">
          <UserPlus size={22} aria-hidden />
          <span>Players</span>
        </button>
        <button className={`admin-nav-item ${activeSection === "teams" ? "active" : ""}`} onClick={() => setActiveSection("teams")} type="button">
          <UsersRound size={22} aria-hidden />
          <span>Teams</span>
        </button>
        <button
          className={`admin-nav-item ${activeSection === "tournaments" ? "active" : ""}`}
          onClick={() => setActiveSection("tournaments")}
          type="button"
        >
          <Trophy size={22} aria-hidden />
          <span>Tournaments</span>
        </button>
        <button className={`admin-nav-item ${activeSection === "admin" ? "active" : ""}`} onClick={() => setActiveSection("admin")} type="button">
          <Wrench size={22} aria-hidden />
          <span>Admin Tools</span>
        </button>
        <button className={`admin-nav-item ${activeSection === "settings" ? "active" : ""}`} onClick={() => setActiveSection("settings")} type="button">
          <Settings size={22} aria-hidden />
          <span>Settings</span>
        </button>
      </aside>

      <div className="admin-content">
        <section className="admin-page-heading">
          <div>
            <p className="eyebrow">Admin workspace</p>
            <h1>{getAdminSectionTitle(activeSection)}</h1>
            <p className="hero-copy">{getAdminSectionDescription(activeSection)}</p>
          </div>
          {message ? (
            <p className="subtle admin-status" data-testid="admin-status" role="status">
              {message}
            </p>
          ) : null}
        </section>

      {activeSection === "tournaments" ? (
      <section className="admin-pane grid two">
        <div className="schedule-shell tournament-shell">
          <form className="schedule-builder" onSubmit={createTournament}>
            <p className="eyebrow">Step 1</p>
            <h1>Manage Tournaments</h1>
            <label className="schedule-panel field">
              <span>Name</span>
              <input
                onChange={(event) => setTournamentForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Tournament Name"
                required
                value={tournamentForm.name}
              />
            </label>
            <label className="schedule-panel field">
              <span>Select Sport</span>
              <select
                onChange={(event) => setTournamentForm((current) => ({ ...current, sport: event.target.value as Sport }))}
                value={tournamentForm.sport}
              >
                <option value="pickleball">Pickleball</option>
                <option value="badminton">Badminton</option>
                <option value="tennis">Tennis</option>
                <option value="volleyball">Volleyball</option>
              </select>
            </label>
            <div className="grid two">
              <label className="schedule-panel field">
                <span>Start date</span>
                <input
                  onChange={(event) => setTournamentForm((current) => ({ ...current, startDate: event.target.value }))}
                  required
                  type="date"
                  value={tournamentForm.startDate}
                />
              </label>
              <label className="schedule-panel field">
                <span>End date</span>
                <input
                  onChange={(event) => setTournamentForm((current) => ({ ...current, endDate: event.target.value }))}
                  required
                  type="date"
                  value={tournamentForm.endDate}
                />
              </label>
            </div>
            <div className="schedule-panel scoring-panel">
              <strong>Points awarded for Win</strong>
              <span>4</span>
              <strong>Points awarded for Loss</strong>
              <span>1</span>
              <strong>Bonus Points awarded for each set Win when Lost</strong>
              <span>1</span>
            </div>
            <label className="schedule-panel field">
              <span>Selected tournament</span>
              <select
                disabled={tournaments.length === 0}
                onChange={(event) => setSelectedTournamentId(event.target.value)}
                value={selectedTournamentId}
              >
                {tournaments.length === 0 ? <option value="">No tournaments yet</option> : null}
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button schedule-next" disabled={savingTournament || loading || !adminUser} type="submit">
              <CalendarPlus size={18} aria-hidden />
              {savingTournament ? "Saving..." : "Save Tournament"}
            </button>
          </form>
        </div>
        <div className="schedule-shell">
          <div className="schedule-builder">
            <p className="eyebrow">Step 2</p>
            <h2>Let's customize your Schedule</h2>
            <p className="schedule-context">
              {selectedTournament
                ? `${selectedTournament.name} · ${selectedTournament.sport} · ${selectedTournament.start_date} to ${selectedTournament.end_date}`
                : "Create a tournament before scheduling."}
            </p>

            {scheduleStep === "setup" ? (
              <>
                <label className="schedule-panel field">
                  <span>Select Level</span>
                  <select
                    onChange={(event) => setSelectedScheduleDivisionId(event.target.value)}
                    value={selectedScheduleDivisionId}
                  >
                    <option value="">Create new schedule</option>
                    {divisions.map((division) => (
                      <option key={division.id} value={division.id}>
                        {division.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="schedule-panel field">
                  <strong>Schedule Name</strong>
                  <input onChange={(event) => setScheduleName(event.target.value)} placeholder="Division X" value={scheduleName} />
                </label>

                <label className="schedule-panel field">
                  <span>Skill Level</span>
                  <input onChange={(event) => setScheduleSkillLevel(event.target.value)} placeholder="3.5" value={scheduleSkillLevel} />
                </label>

                <label className="schedule-panel field">
                  <span>Number of Sets</span>
                  <input
                    min="1"
                    onChange={(event) => setScheduleNumberOfSets(event.target.value)}
                    type="number"
                    value={scheduleNumberOfSets}
                  />
                </label>

                <div className="schedule-panel">
                  <strong>Schedule Type</strong>
                  <div className="choice-row">
                    <button
                      className={`choice-button ${scheduleType === "round_robin" ? "selected" : ""}`}
                      onClick={() => setScheduleType("round_robin")}
                      type="button"
                    >
                      <span aria-hidden>{scheduleType === "round_robin" ? "✓" : ""}</span>
                      League
                    </button>
                    <button
                      className={`choice-button ${scheduleType === "eliminator" ? "selected" : ""}`}
                      onClick={() => setScheduleType("eliminator")}
                      type="button"
                    >
                      <span aria-hidden>{scheduleType === "eliminator" ? "✓" : ""}</span>
                      Playoff
                    </button>
                    <button
                      className={`choice-button ${scheduleType === "manual" ? "selected" : ""}`}
                      onClick={() => setScheduleType("manual")}
                      type="button"
                    >
                      <span aria-hidden>{scheduleType === "manual" ? "✓" : ""}</span>
                      Manual
                    </button>
                  </div>
                </div>

                <div className="schedule-panel">
                  <strong>Game Type</strong>
                  <div className="choice-row">
                    <button
                      className={`choice-button ${activeScheduleFormat === "singles" ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedScheduleDivisionId("");
                        setScheduleFormat("singles");
                      }}
                      type="button"
                    >
                      <span aria-hidden>{activeScheduleFormat === "singles" ? "✓" : ""}</span>
                      Singles
                    </button>
                    <button
                      className={`choice-button ${activeScheduleFormat === "doubles" ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedScheduleDivisionId("");
                        setScheduleFormat("doubles");
                      }}
                      type="button"
                    >
                      <span aria-hidden>{activeScheduleFormat === "doubles" ? "✓" : ""}</span>
                      Doubles
                    </button>
                  </div>
                </div>

                <label className="schedule-panel field">
                  <span>Select Date type</span>
                  <select onChange={(event) => setScheduleDateType(event.target.value)} value={scheduleDateType}>
                    <option value="play_by">Play by Date (Finish the game before this date)</option>
                    <option value="weekly_window">Weekly Window</option>
                  </select>
                </label>

                <label className="schedule-panel field">
                  <span>Start Date</span>
                  <input onChange={(event) => setScheduleStartDate(event.target.value)} type="date" value={scheduleStartDate} />
                </label>

                <div className="toggle-list">
                  <label className="switch-row">
                    <span>Restrict Score Updates</span>
                    <input checked={restrictScoreUpdates} onChange={(event) => setRestrictScoreUpdates(event.target.checked)} type="checkbox" />
                  </label>
                  {restrictScoreUpdates ? (
                    <div className="advanced-option-panel">
                      <label className="schedule-panel field">
                        <span>Score can be updated this many days prior to the Game date</span>
                        <input
                          min="0"
                          onChange={(event) => setScoreUpdateBeforeDays(event.target.value)}
                          type="number"
                          value={scoreUpdateBeforeDays}
                        />
                      </label>
                      <label className="schedule-panel field">
                        <span>Score can be updated this many days after the Game date</span>
                        <input
                          min="0"
                          onChange={(event) => setScoreUpdateAfterDays(event.target.value)}
                          type="number"
                          value={scoreUpdateAfterDays}
                        />
                      </label>
                    </div>
                  ) : null}
                  <label className="switch-row">
                    <span>Allow Game Forfeit</span>
                    <input checked={allowGameForfeit} onChange={(event) => setAllowGameForfeit(event.target.checked)} type="checkbox" />
                  </label>
                  {allowGameForfeit ? (
                    <div className="advanced-option-panel">
                      <label className="schedule-panel field">
                        <span>Game can be forfeited this many days prior to the Game date</span>
                        <input
                          min="0"
                          onChange={(event) => setForfeitBeforeDays(event.target.value)}
                          type="number"
                          value={forfeitBeforeDays}
                        />
                      </label>
                      <label className="schedule-panel field">
                        <span>Game can be forfeited this many days after the Game date</span>
                        <input
                          min="0"
                          onChange={(event) => setForfeitAfterDays(event.target.value)}
                          type="number"
                          value={forfeitAfterDays}
                        />
                      </label>
                    </div>
                  ) : null}
                  <label className="switch-row">
                    <span>Change Winning Score</span>
                    <input checked={changeWinningScore} onChange={(event) => setChangeWinningScore(event.target.checked)} type="checkbox" />
                  </label>
                  {changeWinningScore ? (
                    <>
                      <p className="advanced-note">
                        This is advanced setting. Use this only to change the default winning score for a game. Some Sports does not have a
                        winning score.
                      </p>
                      <label className="schedule-panel field">
                        <span>Winning Score</span>
                        <input
                          min="1"
                          onChange={(event) => setScheduleTargetScore(event.target.value)}
                          placeholder="Enter winning score"
                          type="number"
                          value={scheduleTargetScore}
                        />
                      </label>
                    </>
                  ) : null}
                </div>

                <button
                  className="button schedule-next"
                  disabled={!selectedTournament || !scheduleName.trim()}
                  onClick={() => setScheduleStep("entries")}
                  type="button"
                >
                  Next
                </button>
              </>
            ) : (
              <>
                <div className="schedule-step-header">
                  <div>
                    <p className="eyebrow">Step 3</p>
                    <h3>{activeScheduleName}</h3>
                    <p className="schedule-context">
                      {scheduleType === "round_robin" ? "League schedule" : scheduleType === "eliminator" ? "Playoff schedule" : "Manual schedule"} · {activeScheduleFormat}
                    </p>
                  </div>
                  <button className="button secondary" onClick={() => setScheduleStep("setup")} type="button">
                    Back
                  </button>
                </div>
            {selectedTournament ? (
              <div className="entry-picker">
                <div className="section-title">
                  <h3>{activeScheduleFormat === "doubles" ? "Choose Teams" : "Choose Players"}</h3>
                  <span className="pill blue">{scheduleSelectionCount} selected</span>
                </div>

                {activeScheduleFormat === "doubles" ? (
                  <>
                    <div className="team-builder">
                      <label className="field">
                        <span>Team name</span>
                        <input
                          onChange={(event) => setScheduleTeamForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Optional"
                          value={scheduleTeamForm.name}
                        />
                      </label>
                      <label className="field">
                        <span>Player 1</span>
                        <select
                          disabled={players.length === 0}
                          onChange={(event) => setScheduleTeamForm((current) => ({ ...current, playerAId: event.target.value }))}
                          value={scheduleTeamForm.playerAId}
                        >
                          <option value="">Select player</option>
                          {players.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.display_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Player 2</span>
                        <select
                          disabled={players.length === 0}
                          onChange={(event) => setScheduleTeamForm((current) => ({ ...current, playerBId: event.target.value }))}
                          value={scheduleTeamForm.playerBId}
                        >
                          <option value="">Select player</option>
                          {players.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.display_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button secondary"
                        disabled={creatingScheduleTeam || !scheduleTeamForm.playerAId || !scheduleTeamForm.playerBId}
                        onClick={createScheduleTeam}
                        type="button"
                      >
                        <UsersRound size={18} aria-hidden />
                        {creatingScheduleTeam ? "Creating..." : "Create team"}
                      </button>
                    </div>

                    <div className="picker-controls">
                      <label className="field">
                        <span>Search teams</span>
                        <input
                          onChange={(event) => setScheduleTeamSearch(event.target.value)}
                          placeholder="Team name"
                          value={scheduleTeamSearch}
                        />
                      </label>
                      <label className="check-toggle">
                        <input
                          checked={showSelectedScheduleTeamsOnly}
                          onChange={(event) => setShowSelectedScheduleTeamsOnly(event.target.checked)}
                          type="checkbox"
                        />
                        <span>Selected only</span>
                      </label>
                    </div>
                    <div className="toolbar compact-toolbar">
                      <button
                        className="button secondary"
                        onClick={() =>
                          setSelectedScheduleTeamIds((current) => Array.from(new Set([...current, ...filteredScheduleTeams.map((team) => team.id)])))
                        }
                        type="button"
                      >
                        Select visible
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          setSelectedScheduleTeamIds((current) =>
                            current.filter((teamId) => !filteredScheduleTeams.some((team) => team.id === teamId))
                          )
                        }
                        type="button"
                      >
                        Clear visible
                      </button>
                      <button className="button secondary" onClick={() => setSelectedScheduleTeamIds([])} type="button">
                        Clear all
                      </button>
                    </div>
                    <p className="subtle">
                      Showing {filteredScheduleTeams.length} of {teams.length} teams.
                    </p>
                    <div className="check-list">
                      {filteredScheduleTeams.length > 0 ? (
                        filteredScheduleTeams.map((team) => (
                          <label className="check-row" key={team.id}>
                            <input
                              checked={selectedScheduleTeamIds.includes(team.id)}
                              onChange={(event) =>
                                setSelectedScheduleTeamIds((current) =>
                                  event.target.checked ? [...current, team.id] : current.filter((teamId) => teamId !== team.id)
                                )
                              }
                              type="checkbox"
                            />
                            <span>{team.name}</span>
                          </label>
                        ))
                      ) : teams.length > 0 ? (
                        <p className="subtle">No teams match the current filters.</p>
                      ) : (
                        <p className="subtle">Create fixed teams above, then select them for the schedule.</p>
                      )}
                    </div>
                    {selectedScheduleTeams.length > 0 ? (
                      <div className="selected-summary">
                        {selectedScheduleTeams.slice(0, 12).map((team) => (
                          <span className="pill" key={team.id}>
                            {team.name}
                          </span>
                        ))}
                        {selectedScheduleTeams.length > 12 ? <span className="subtle">+{selectedScheduleTeams.length - 12} more</span> : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="picker-controls">
                      <label className="field">
                        <span>Search players</span>
                        <input
                          onChange={(event) => setSchedulePlayerSearch(event.target.value)}
                          placeholder="Name or rating"
                          value={schedulePlayerSearch}
                        />
                      </label>
                      <label className="field">
                        <span>Level</span>
                        <select onChange={(event) => setScheduleRatingFilter(event.target.value)} value={scheduleRatingFilter}>
                          <option value="all">All levels</option>
                          {ratingOptions.map((rating) => (
                            <option key={rating} value={rating}>
                              {rating}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="check-toggle">
                        <input
                          checked={showSelectedSchedulePlayersOnly}
                          onChange={(event) => setShowSelectedSchedulePlayersOnly(event.target.checked)}
                          type="checkbox"
                        />
                        <span>Selected only</span>
                      </label>
                    </div>
                    <div className="toolbar compact-toolbar">
                      <button
                        className="button secondary"
                        onClick={() =>
                          setSelectedSchedulePlayerIds((current) =>
                            Array.from(new Set([...current, ...filteredSchedulePlayers.map((player) => player.id)]))
                          )
                        }
                        type="button"
                      >
                        Select visible
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          setSelectedSchedulePlayerIds((current) =>
                            current.filter((playerId) => !filteredSchedulePlayers.some((player) => player.id === playerId))
                          )
                        }
                        type="button"
                      >
                        Clear visible
                      </button>
                      <button className="button secondary" onClick={() => setSelectedSchedulePlayerIds([])} type="button">
                        Clear all
                      </button>
                    </div>
                    <p className="subtle">
                      Showing {filteredSchedulePlayers.length} of {players.length} players.
                    </p>
                    <div className="check-list">
                      {filteredSchedulePlayers.length > 0 ? (
                        filteredSchedulePlayers.map((player) => (
                          <label className="check-row" key={player.id}>
                            <input
                              checked={selectedSchedulePlayerIds.includes(player.id)}
                              onChange={(event) =>
                                setSelectedSchedulePlayerIds((current) =>
                                  event.target.checked ? [...current, player.id] : current.filter((playerId) => playerId !== player.id)
                                )
                              }
                              type="checkbox"
                            />
                            <span>{player.display_name}</span>
                            <small>{player.rating || "No rating"}</small>
                          </label>
                        ))
                      ) : players.length > 0 ? (
                        <p className="subtle">No players match the current filters.</p>
                      ) : (
                        <p className="subtle">Add players in People, then select them for the schedule.</p>
                      )}
                    </div>
                    {selectedSchedulePlayers.length > 0 ? (
                      <div className="selected-summary">
                        {selectedSchedulePlayers.slice(0, 12).map((player) => (
                          <span className="pill" key={player.id}>
                            {player.display_name}
                          </span>
                        ))}
                        {selectedSchedulePlayers.length > 12 ? <span className="subtle">+{selectedSchedulePlayers.length - 12} more</span> : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {scheduleType === "manual" && manualEntryOptions.length > 0 ? (
              <div className="manual-builder">
                <div className="section-title">
                  <h3>Manual Matchups</h3>
                  <button
                    className="button secondary"
                    onClick={() =>
                      setManualMatches((current) => [
                        ...current,
                        { id: `manual-${Date.now()}`, entryASelectionId: "", entryBSelectionId: "" }
                      ])
                    }
                    type="button"
                  >
                    <Plus size={18} aria-hidden />
                    Add matchup
                  </button>
                </div>
                {manualMatches.map((manualMatch, index) => (
                  <div className="manual-row" key={manualMatch.id}>
                    <label className="field">
                      <span>{activeScheduleFormat === "doubles" ? "Team A" : "Player A"}</span>
                      <select
                        onChange={(event) =>
                          setManualMatches((current) =>
                            current.map((item) => (item.id === manualMatch.id ? { ...item, entryASelectionId: event.target.value } : item))
                          )
                        }
                        value={manualMatch.entryASelectionId}
                      >
                        <option value="">Select</option>
                        {manualEntryOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>{activeScheduleFormat === "doubles" ? "Team B" : "Player B"}</span>
                      <select
                        onChange={(event) =>
                          setManualMatches((current) =>
                            current.map((item) => (item.id === manualMatch.id ? { ...item, entryBSelectionId: event.target.value } : item))
                          )
                        }
                        value={manualMatch.entryBSelectionId}
                      >
                        <option value="">Select</option>
                        {manualEntryOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button secondary"
                      disabled={manualMatches.length === 1}
                      onClick={() => setManualMatches((current) => current.filter((item) => item.id !== manualMatch.id))}
                      type="button"
                    >
                      Remove {index + 1}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedScheduleDivision && selectedScheduleDivisionMatches.length > 0 ? (
              <div className="replace-schedule">
                <label className="check-toggle">
                  <input
                    checked={replaceExistingSchedule}
                    disabled={!canReplaceExistingSchedule}
                    onChange={(event) => setReplaceExistingSchedule(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Replace existing schedule for this division</span>
                </label>
                <p className="subtle">
                  {canReplaceExistingSchedule
                    ? `${selectedScheduleDivisionMatches.length} existing scheduled/cancelled match${selectedScheduleDivisionMatches.length === 1 ? "" : "es"} can be rebuilt.`
                    : "This division has posted results or forfeits, so create a new division instead of replacing it."}
                </p>
              </div>
            ) : null}

            <div className="toolbar">
              <button className="button" disabled={!selectedTournament || generatingSchedule} onClick={generateSchedule} type="button">
                <Shuffle size={18} aria-hidden />
                {generatingSchedule ? "Generating..." : "Generate schedule"}
              </button>
              <button className="button secondary" disabled={!selectedTournament} onClick={publishStandings} type="button">
                <Trophy size={18} aria-hidden />
                Publish standings
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      </section>
      ) : null}

      {activeSection === "players" ? (
      <section className="card admin-pane">
        <div className="section-title">
          <h2>People</h2>
          <UserPlus size={22} aria-hidden />
        </div>
        <div className="admin-columns">
          <form className="form-grid" onSubmit={inviteUser}>
            <h3>Add User And Player</h3>
            <label className="field">
              <span>Full name</span>
              <input
                onChange={(event) => setInviteForm((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="Full name"
                required
                value={inviteForm.fullName}
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="name@email.com"
                required
                value={inviteForm.email}
              />
            </label>
            <label className="field">
              <span>Mobile number</span>
              <input
                autoComplete="tel"
                inputMode="tel"
                onChange={(event) => setInviteForm((current) => ({ ...current, mobileNumber: event.target.value }))}
                placeholder="15551234567"
                value={inviteForm.mobileNumber}
              />
            </label>
            <label className="field">
              <span>Temporary password</span>
              <input
                autoComplete="new-password"
                minLength={6}
                onChange={(event) => setInviteForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="At least 6 characters"
                type="password"
                value={inviteForm.password}
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select
                onChange={(event) =>
                  setInviteForm((current) => ({
                    ...current,
                    role: event.target.value as "admin" | "player",
                    playerProfileMode: event.target.value === "player" ? current.playerProfileMode || "__new" : ""
                  }))
                }
                value={inviteForm.role}
              >
                <option value="player">Player</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="field">
              <span>Rating</span>
              <input
                disabled={inviteForm.role !== "player"}
                onChange={(event) => setInviteForm((current) => ({ ...current, rating: event.target.value }))}
                placeholder="3.5"
                value={inviteForm.rating}
              />
            </label>
            <label className="field">
              <span>Player profile</span>
              <select
                disabled={inviteForm.role !== "player"}
                onChange={(event) => setInviteForm((current) => ({ ...current, playerProfileMode: event.target.value }))}
                value={inviteForm.playerProfileMode}
              >
                <option value="__new">Create new player profile</option>
                <option value="">No player profile</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.display_name}{player.user_id ? " (already linked)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="button" disabled={invitingUser || !adminUser} type="submit">
              <UserPlus size={18} aria-hidden />
              {invitingUser ? "Creating..." : inviteForm.password ? "Create login" : "Send invite"}
            </button>
            <p className="subtle">Leave password blank to send an email invite. Creating logins requires SUPABASE_SERVICE_ROLE_KEY in .env.local.</p>
          </form>

          <div className="form-grid">
            <h3>Upload People</h3>
            <p className="subtle">
              Upload CSV, TSV, XLS, or XLSX with columns: full_name, email, mobile_number, role, password, rating. Without SUPABASE_SERVICE_ROLE_KEY, player
              profiles import but login accounts are skipped.
            </p>
            <div className="toolbar compact-toolbar">
              <button
                className="button secondary"
                disabled={Boolean(downloadingTemplate)}
                onClick={() => downloadTemplate("player-import-template.xlsx", "/player-import-template.xlsx")}
                type="button"
              >
                {downloadingTemplate === "player-import-template.xlsx" ? "Downloading..." : "Download Excel template"}
              </button>
              <button
                className="button secondary"
                disabled={Boolean(downloadingTemplate)}
                onClick={() => downloadTemplate("player-import-template.csv", "/player-import-template.csv")}
                type="button"
              >
                {downloadingTemplate === "player-import-template.csv" ? "Downloading..." : "Download CSV template"}
              </button>
            </div>
            <label className="file-drop">
              <Upload size={22} aria-hidden />
              <span>{importingPlayers ? "Importing..." : "Choose people file"}</span>
              <input
                accept=".csv,.tsv,.txt,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={importingPlayers || !adminUser}
                onChange={importPeople}
                type="file"
              />
            </label>
          </div>

          <form className="form-grid" onSubmit={linkUserToPlayer}>
            <h3>Link Existing Login</h3>
            <label className="field">
              <span>User login</span>
              <select onChange={(event) => setLinkForm((current) => ({ ...current, userId: event.target.value }))} value={linkForm.userId}>
                <option value="">Select user</option>
                {appUsers
                  .filter((user) => user.role === "player")
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} ({user.email})
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Player profile</span>
              <select
                onChange={(event) => setLinkForm((current) => ({ ...current, playerProfileId: event.target.value }))}
                value={linkForm.playerProfileId}
              >
                <option value="">Select player</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.display_name}{player.user_id ? " (linked)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="button" disabled={linkingUser || !linkForm.userId || !linkForm.playerProfileId} type="submit">
              <Check size={18} aria-hidden />
              {linkingUser ? "Linking..." : "Link profile"}
            </button>
          </form>

          <div className="form-grid">
            <h3>User Access</h3>
            {appUsers.length > 0 ? (
              <div className="compact-list">
                {appUsers.map((user) => {
                  const linkedPlayer = players.find((player) => player.user_id === user.id);
                  return (
                    <div className="compact-row user-row" key={user.id}>
                      <div>
                        <strong>{user.full_name}</strong>
                        <p className="subtle">{user.email}</p>
                        <p className="subtle">{linkedPlayer ? `Player: ${linkedPlayer.display_name}` : "No linked player profile"}</p>
                        {linkedPlayer?.mobile_number ? <p className="subtle">Mobile: {linkedPlayer.mobile_number}</p> : null}
                      </div>
                      <select
                        aria-label={`Role for ${user.full_name}`}
                        disabled={updatingUserId === user.id}
                        onChange={(event) => updateUserRole(user.id, event.target.value as "admin" | "player")}
                        value={user.role}
                      >
                        <option value="player">Player</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="button secondary" disabled={updatingUserId === user.id} onClick={() => toggleUserAccess(user)} type="button">
                        {user.access_disabled ? "Enable" : "Disable"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<UserPlus size={24} aria-hidden />} title="No app users" body="Create login invites or add users in Supabase Auth, then assign app access here." />
            )}
          </div>
        </div>
      </section>
      ) : null}

      {activeSection === "admin" ? (
      <section className="card admin-pane">
        <div className="section-title">
          <h2>Match Management</h2>
          <span className="pill orange">admin editable</span>
        </div>
        {matches.length > 0 ? (
          <div className="admin-match-table" role="table" aria-label="Editable matches">
            <div className="admin-match-table-head" role="row">
              <span role="columnheader">Schedule</span>
              <span role="columnheader">Match</span>
              <span role="columnheader">Round</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Score / winner</span>
              <span role="columnheader">Dates</span>
              <span role="columnheader">Target</span>
              <span role="columnheader">Action</span>
            </div>
            {matches.map((match) => {
              const division = divisions.find((item) => item.id === match.division_id);
              const entryA = divisionEntries.find((entry) => entry.id === match.entry_a_id);
              const entryB = divisionEntries.find((entry) => entry.id === match.entry_b_id);

              return (
                <AdminMatchEditor
                  division={division}
                  entryA={entryA}
                  entryB={entryB}
                  key={match.id}
                  match={match}
                  onSave={saveAdminMatch}
                  saving={editingMatchId === match.id}
                  sets={matchSets.filter((set) => set.match_id === match.id)}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Trophy size={24} aria-hidden />}
            title="No matches yet"
            body="Generated matches will be available here for score corrections, forfeits, and cancellations."
          />
        )}
      </section>
      ) : null}

      {activeSection === "teams" ? (
        <section className="grid two admin-pane">
          <div className="card">
            <div className="section-title">
              <h2>Create Fixed Doubles Team</h2>
              <UsersRound size={22} aria-hidden />
            </div>
            <form className="form-grid" onSubmit={createStandaloneTeam}>
              <label className="field">
                <span>Team name</span>
                <input
                  onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Optional"
                  value={teamForm.name}
                />
              </label>
              <label className="field">
                <span>Player 1</span>
                <select
                  disabled={players.length === 0}
                  onChange={(event) => setTeamForm((current) => ({ ...current, playerAId: event.target.value }))}
                  value={teamForm.playerAId}
                >
                  <option value="">Select player</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Player 2</span>
                <select
                  disabled={players.length === 0}
                  onChange={(event) => setTeamForm((current) => ({ ...current, playerBId: event.target.value }))}
                  value={teamForm.playerBId}
                >
                  <option value="">Select player</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button" disabled={creatingTeam || !teamForm.playerAId || !teamForm.playerBId} type="submit">
                <UsersRound size={18} aria-hidden />
                {creatingTeam ? "Creating..." : "Create team"}
              </button>
            </form>
          </div>
          <div className="card">
            <div className="section-title">
              <h2>Teams</h2>
              <span className="pill blue">{teams.length}</span>
            </div>
            {teams.length > 0 ? (
              <div className="compact-list">
                {teams.map((team) => (
                  <div className="compact-row" key={team.id}>
                    <strong>{team.name}</strong>
                    <span className="subtle">Fixed doubles</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<UsersRound size={24} aria-hidden />} title="No teams yet" body="Create fixed doubles teams here or while generating a doubles schedule." />
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "settings" ? (
        <section className="grid two admin-pane">
          <div className="card">
            <div className="section-title">
              <h2>App Settings</h2>
              <Settings size={22} aria-hidden />
            </div>
            <div className="compact-list">
              <div className="compact-row">
                <strong>Club admin</strong>
                <span className="subtle">{adminUser.full_name}</span>
              </div>
              <div className="compact-row">
                <strong>Login</strong>
                <span className="subtle">{adminUser.email}</span>
              </div>
              <div className="compact-row">
                <strong>Tournaments</strong>
                <span className="subtle">{tournaments.length}</span>
              </div>
              <div className="compact-row">
                <strong>Players</strong>
                <span className="subtle">{players.length}</span>
              </div>
            </div>
          </div>
          <div className="card notice">
            <h2>Import Setup</h2>
            <p className="subtle">
              {serviceRoleConfigured === null
                ? "Checking bulk login configuration..."
                : serviceRoleConfigured
                ? "Bulk login creation is enabled. Uploads can create login accounts and player profiles."
                : "Bulk login creation needs SUPABASE_SERVICE_ROLE_KEY in .env.local. Player profiles can still import without it."}
            </p>
          </div>
        </section>
      ) : null}
      </div>
    </section>
  );
}

type AdminMatchEditForm = {
  roundLabel: string;
  targetScore: string;
  scheduleWeekStart: string;
  scheduleWeekEnd: string;
  extensionWeekStart: string;
  extensionWeekEnd: string;
  status: MatchStatus;
  winnerEntryId: string;
  set1A: string;
  set1B: string;
  set2A: string;
  set2B: string;
  set3A: string;
  set3B: string;
};

function AdminMatchEditor({
  division,
  entryA,
  entryB,
  match,
  onSave,
  saving,
  sets
}: {
  division?: DivisionRow;
  entryA?: DivisionEntryRow;
  entryB?: DivisionEntryRow;
  match: MatchRow;
  onSave: (match: MatchRow, form: AdminMatchEditForm) => Promise<void>;
  saving: boolean;
  sets: MatchSetRow[];
}) {
  const initialForm = createAdminMatchForm(match, sets);
  const [form, setForm] = useState<AdminMatchEditForm>(initialForm);
  const showScores = form.status === "completed" || form.status === "score_submitted";
  const showWinner = form.status === "forfeit";
  const setsKey = sets.map((set) => `${set.set_number}:${set.entry_a_score}-${set.entry_b_score}`).join("|");

  useEffect(() => {
    setForm(createAdminMatchForm(match, sets));
  }, [match.id, match.status, match.winner_entry_id, match.forfeit_by_entry_id, setsKey]);

  function updateField(field: keyof AdminMatchEditForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(match, form);
  }

  return (
    <form className="admin-match-table-row" onSubmit={handleSubmit} role="row">
      <div className="admin-match-cell" role="cell">
        <span className="mobile-cell-label">Schedule</span>
        <strong>{division?.name || "Division"}</strong>
        <span className="subtle">{match.round_label || `Round ${match.round}`}</span>
      </div>
      <div className="admin-match-cell match-cell" role="cell">
        <span className="mobile-cell-label">Match</span>
        <strong>{entryA?.label || "Entry A"}</strong>
        <span className="subtle">vs</span>
        <strong>{entryB?.label || "Entry B"}</strong>
      </div>
      <label className="admin-match-cell" role="cell">
        <span className="mobile-cell-label">Round</span>
        <input aria-label="Round label" onChange={(event) => updateField("roundLabel", event.target.value)} value={form.roundLabel} />
      </label>
      <label className="admin-match-cell" role="cell">
        <span className="mobile-cell-label">Status</span>
        <select aria-label="Match status" onChange={(event) => updateField("status", event.target.value as MatchStatus)} value={form.status}>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="score_submitted">Score submitted</option>
          <option value="forfeit">Forfeit</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <div className="admin-match-cell score-cell" role="cell">
        <span className="mobile-cell-label">Score / winner</span>
        {showWinner ? (
          <select aria-label="Forfeit winner" onChange={(event) => updateField("winnerEntryId", event.target.value)} value={form.winnerEntryId}>
            <option value="">Select winner</option>
            <option value={match.entry_a_id}>{entryA?.label || "Entry A"}</option>
            <option value={match.entry_b_id}>{entryB?.label || "Entry B"}</option>
          </select>
        ) : null}
        {showScores ? (
          <div className="admin-inline-score-grid">
            <span />
            <strong>1</strong>
            <strong>2</strong>
            <strong>3</strong>
            <span>A</span>
            <input aria-label="Entry A set 1" min="0" onChange={(event) => updateField("set1A", event.target.value)} required type="number" value={form.set1A} />
            <input aria-label="Entry A set 2" min="0" onChange={(event) => updateField("set2A", event.target.value)} required type="number" value={form.set2A} />
            <input aria-label="Entry A set 3" min="0" onChange={(event) => updateField("set3A", event.target.value)} type="number" value={form.set3A} />
            <span>B</span>
            <input aria-label="Entry B set 1" min="0" onChange={(event) => updateField("set1B", event.target.value)} required type="number" value={form.set1B} />
            <input aria-label="Entry B set 2" min="0" onChange={(event) => updateField("set2B", event.target.value)} required type="number" value={form.set2B} />
            <input aria-label="Entry B set 3" min="0" onChange={(event) => updateField("set3B", event.target.value)} type="number" value={form.set3B} />
          </div>
        ) : null}
        {!showWinner && !showScores ? <span className="subtle">No score</span> : null}
      </div>
      <div className="admin-match-cell date-cell" role="cell">
        <span className="mobile-cell-label">Dates</span>
        <label>
          <span>Schedule</span>
          <input aria-label="Schedule start" onChange={(event) => updateField("scheduleWeekStart", event.target.value)} type="date" value={form.scheduleWeekStart} />
          <input aria-label="Schedule end" onChange={(event) => updateField("scheduleWeekEnd", event.target.value)} type="date" value={form.scheduleWeekEnd} />
        </label>
        <label>
          <span>Extension</span>
          <input aria-label="Extension start" onChange={(event) => updateField("extensionWeekStart", event.target.value)} type="date" value={form.extensionWeekStart} />
          <input aria-label="Extension end" onChange={(event) => updateField("extensionWeekEnd", event.target.value)} type="date" value={form.extensionWeekEnd} />
        </label>
      </div>
      <label className="admin-match-cell target-cell" role="cell">
        <span className="mobile-cell-label">Target</span>
        <input aria-label="Target score" min="1" onChange={(event) => updateField("targetScore", event.target.value)} type="number" value={form.targetScore} />
      </label>
      <div className="admin-match-cell action-cell" role="cell">
        <span className="mobile-cell-label">Action</span>
        <button className="button" disabled={saving} type="submit">
          <Check size={18} aria-hidden />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

function createAdminMatchForm(match: MatchRow, sets: MatchSetRow[]): AdminMatchEditForm {
  const setMap = new Map(sets.map((set) => [set.set_number, set]));
  const targetScore = String(match.target_score || 11);
  return {
    roundLabel: match.round_label || "",
    targetScore,
    scheduleWeekStart: match.schedule_week_start,
    scheduleWeekEnd: match.schedule_week_end,
    extensionWeekStart: match.extension_week_start,
    extensionWeekEnd: match.extension_week_end,
    status: match.status,
    winnerEntryId: match.winner_entry_id || match.forfeit_by_entry_id || "",
    set1A: String(setMap.get(1)?.entry_a_score ?? targetScore),
    set1B: String(setMap.get(1)?.entry_b_score ?? "0"),
    set2A: String(setMap.get(2)?.entry_a_score ?? targetScore),
    set2B: String(setMap.get(2)?.entry_b_score ?? "0"),
    set3A: String(setMap.get(3)?.entry_a_score ?? ""),
    set3B: String(setMap.get(3)?.entry_b_score ?? "")
  };
}

function buildAdminSets(form: AdminMatchEditForm) {
  const rawSets = [
    [form.set1A, form.set1B],
    [form.set2A, form.set2B],
    [form.set3A, form.set3B]
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

function getAdminWinnerEntryId(match: MatchRow, sets: ReturnType<typeof buildAdminSets>) {
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

function parsePlayerCsv(text: string, clubId: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const first = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase().trim());
  const hasHeader = first.includes("display_name") || first.includes("name") || first.includes("rating");
  const headers = hasHeader ? first : ["display_name", "rating"];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const nameIndex = headers.includes("display_name") ? headers.indexOf("display_name") : headers.indexOf("name");
  const ratingIndex = headers.indexOf("rating");

  return dataLines
    .map((line) => {
      const cells = parseCsvLine(line);
      const displayName = (cells[nameIndex >= 0 ? nameIndex : 0] || "").trim();
      const rating = ratingIndex >= 0 ? (cells[ratingIndex] || "").trim() : (cells[1] || "").trim();
      if (!displayName) return undefined;
      return {
        club_id: clubId,
        display_name: displayName,
        rating: rating || null
      };
    })
    .filter((row): row is { club_id: string; display_name: string; rating: string | null } => Boolean(row));
}

function getAdminSectionTitle(section: AdminSection) {
  if (section === "players") return "Players";
  if (section === "teams") return "Teams";
  if (section === "tournaments") return "Tournaments";
  if (section === "admin") return "Admin Tools";
  return "Settings";
}

function getAdminSectionDescription(section: AdminSection) {
  if (section === "players") return "Create logins, import people, link players, and manage user access.";
  if (section === "teams") return "Create and review fixed doubles teams for doubles schedules.";
  if (section === "tournaments") return "Create tournaments, customize schedules, choose players, and generate matches.";
  if (section === "admin") return "Review generated games, score status, forfeits, and match setup.";
  return "Review app setup, admin identity, and import configuration.";
}

async function parsePeopleImportFile(file: File): Promise<PeopleImportRow[]> {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return rawRows.map(normalizePeopleImportRow).filter((row): row is PeopleImportRow => Boolean(row));
  }

  const text = await file.text();
  const delimiter = fileName.endsWith(".tsv") ? "\t" : ",";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const headers = splitDelimitedLine(lines[0], delimiter).map(normalizeHeader);
  return lines
    .slice(1)
    .map((line) => {
      const cells = splitDelimitedLine(line, delimiter);
      const rawRow = Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
      return normalizePeopleImportRow(rawRow);
    })
    .filter((row): row is PeopleImportRow => Boolean(row));
}

function normalizePeopleImportRow(rawRow: Record<string, unknown>): PeopleImportRow | undefined {
  const row = Object.fromEntries(Object.entries(rawRow).map(([key, value]) => [normalizeHeader(key), String(value || "").trim()]));
  const fullName = pickValue(row, ["full_name", "name", "display_name", "player_name"]);
  const email = pickValue(row, ["email", "email_address", "login_email"]).toLowerCase();
  if (!fullName || !email) return undefined;

  const rawRole = pickValue(row, ["role", "user_role"]).toLowerCase();
  const role: "admin" | "player" = rawRole === "admin" ? "admin" : "player";
  const createPlayerRaw = pickValue(row, ["create_player_profile", "create_player", "player", "is_player"]).toLowerCase();
  const createPlayerProfile = role === "player" && !["false", "no", "0", "n"].includes(createPlayerRaw);

  return {
    fullName,
    email,
    mobileNumber: pickValue(row, ["mobile_number", "mobile", "phone", "phone_number", "cell", "cell_phone"]) || undefined,
    password: pickValue(row, ["password", "temporary_password", "temp_password"]) || undefined,
    role,
    rating: pickValue(row, ["rating", "skill_level", "level"]) || undefined,
    createPlayerProfile
  };
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function pickValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

function splitDelimitedLine(line: string, delimiter: string) {
  if (delimiter === "\t") return line.split("\t");
  return parseCsvLine(line);
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
}

function isMissingAccessDisabledColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  return message.includes("access_disabled") || message.includes("schema cache");
}

function isMissingMobileNumberColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  return message.includes("mobile_number") || message.includes("schema cache");
}

function isServiceRoleMissing(error: string | null | undefined) {
  return (error || "").toLowerCase().includes("supabase_service_role_key");
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, timeout: string): Promise<T | { timeout: string }> {
  return Promise.race([
    promise,
    new Promise<{ timeout: string }>((resolve) => {
      window.setTimeout(() => resolve({ timeout }), timeoutMs);
    })
  ]);
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p className="subtle">{body}</p>
    </div>
  );
}
