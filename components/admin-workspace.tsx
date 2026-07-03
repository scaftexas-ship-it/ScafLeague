"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, ListChecks, Plus, Shuffle, Trophy, Upload, UsersRound } from "lucide-react";
import { generateRoundRobinSchedule } from "@/lib/league-rules";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { DivisionEntry, DivisionFormat, MatchStatus, Sport } from "@/lib/types";

type AdminUser = {
  id: string;
  club_id: string;
  role: "admin" | "player";
  full_name: string;
  email: string;
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
  rating: string | null;
};

type DivisionEntryRow = {
  id: string;
  division_id: string;
  label: string;
  player_id: string | null;
  team_id: string | null;
};

type MatchRow = {
  id: string;
  division_id: string;
  round: number;
  entry_a_id: string;
  entry_b_id: string;
  schedule_week_start: string;
  schedule_week_end: string;
  extension_week_start: string;
  extension_week_end: string;
  status: MatchStatus;
};

const today = new Date().toISOString().slice(0, 10);

export function AdminWorkspace() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [players, setPlayers] = useState<PlayerProfileRow[]>([]);
  const [divisionEntries, setDivisionEntries] = useState<DivisionEntryRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [selectedSinglesDivisionId, setSelectedSinglesDivisionId] = useState("");
  const [selectedDoublesDivisionId, setSelectedDoublesDivisionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingTournament, setSavingTournament] = useState(false);
  const [savingDivision, setSavingDivision] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [importingPlayers, setImportingPlayers] = useState(false);
  const [assigningEntry, setAssigningEntry] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
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
    rating: ""
  });
  const [assignmentForm, setAssignmentForm] = useState({
    playerId: ""
  });
  const [teamForm, setTeamForm] = useState({
    name: "",
    playerAId: "",
    playerBId: ""
  });

  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId);
  const singlesDivisions = divisions.filter((division) => division.format === "singles");
  const doublesDivisions = divisions.filter((division) => division.format === "doubles");
  const selectedSinglesDivision = singlesDivisions.find((division) => division.id === selectedSinglesDivisionId);
  const selectedDoublesDivision = doublesDivisions.find((division) => division.id === selectedDoublesDivisionId);
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
    if (divisions.length === 0) {
      setSelectedSinglesDivisionId("");
      setSelectedDoublesDivisionId("");
      return;
    }
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
      return;
    }

    const profileResult = await withTimeout(
      supabase.from("users").select("id, club_id, role, full_name, email").eq("id", authData.user.id).single(),
      6000,
      "The app user profile lookup did not respond. Check the public.users admin row and RLS policies."
    );
    if ("timeout" in profileResult) {
      setMessage(profileResult.timeout);
      setLoading(false);
      return;
    }
    const { data: profile, error: profileError } = profileResult;

    if (profileError || !profile) {
      setMessage("Your login works, but no app user profile was found for this account.");
      setLoading(false);
      return;
    }

    if (profile.role !== "admin") {
      setMessage("This account is not an admin.");
      setLoading(false);
      return;
    }

    setAdminUser(profile as AdminUser);
    await loadPlayers((profile as AdminUser).club_id);
    const loadedTournaments = await loadTournaments((profile as AdminUser).club_id);
    setSelectedTournamentId((current) => current || loadedTournaments[0]?.id || "");
    setMessage(loadedTournaments.length > 0 ? "Admin access ready." : "Admin access ready. Create your first tournament.");
    setLoading(false);
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
    const { data, error } = await supabase
      .from("player_profiles")
      .select("id, club_id, display_name, rating")
      .eq("club_id", clubId)
      .order("display_name", { ascending: true });

    if (error) {
      setMessage(error.message);
      return [];
    }

    const rows = (data || []) as PlayerProfileRow[];
    setPlayers(rows);
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
      return [];
    }

    const { data, error } = await supabase
      .from("matches")
      .select(
        "id, division_id, round, entry_a_id, entry_b_id, schedule_week_start, schedule_week_end, extension_week_start, extension_week_end, status"
      )
      .in("division_id", divisionIds)
      .order("schedule_week_start", { ascending: true })
      .order("round", { ascending: true });

    if (error) {
      setMessage(error.message);
      return [];
    }

    const rows = (data || []) as MatchRow[];
    setMatches(rows);
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
        rating: playerForm.rating.trim() || null
      })
      .select("id, club_id, display_name, rating")
      .single();

    setSavingPlayer(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setPlayers((current) => [...current, data as PlayerProfileRow].sort((a, b) => a.display_name.localeCompare(b.display_name)));
    setPlayerForm({ displayName: "", rating: "" });
    setMessage("Player added.");
  }

  async function importPlayers(event: React.ChangeEvent<HTMLInputElement>) {
    if (!supabase || !adminUser) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingPlayers(true);
    setMessage("");
    const text = await file.text();
    const rows = parsePlayerCsv(text, adminUser.club_id);

    if (rows.length === 0) {
      setImportingPlayers(false);
      setMessage("No players found in the CSV. Use columns named display_name or name, and optional rating.");
      event.target.value = "";
      return;
    }

    const { data, error } = await supabase.from("player_profiles").insert(rows).select("id, club_id, display_name, rating");
    setImportingPlayers(false);
    event.target.value = "";

    if (error) {
      setMessage(error.message);
      return;
    }

    const imported = (data || []) as PlayerProfileRow[];
    setPlayers((current) => [...current, ...imported].sort((a, b) => a.display_name.localeCompare(b.display_name)));
    setMessage(`${imported.length} player${imported.length === 1 ? "" : "s"} imported.`);
  }

  async function assignSinglesPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !assignmentForm.playerId || !selectedSinglesDivision) return;

    const player = players.find((item) => item.id === assignmentForm.playerId);
    if (!player) return;

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

  async function generateSchedule() {
    if (!supabase || !selectedTournament) return;

    if (divisions.length === 0) {
      setMessage("Create at least one division before generating a schedule.");
      return;
    }

    setGeneratingSchedule(true);
    setMessage("");

    const rowsToInsert: Array<{
      division_id: string;
      round: number;
      entry_a_id: string;
      entry_b_id: string;
      schedule_week_start: string;
      schedule_week_end: string;
      extension_week_start: string;
      extension_week_end: string;
      status: MatchStatus;
    }> = [];
    const skipped: string[] = [];

    for (const division of divisions) {
      if (matches.some((match) => match.division_id === division.id)) {
        skipped.push(`${division.name} already has matches`);
        continue;
      }

      const entriesForDivision = divisionEntries.filter((entry) => entry.division_id === division.id);
      if (entriesForDivision.length < 2) {
        skipped.push(`${division.name} needs at least 2 entries`);
        continue;
      }

      const scheduleEntries: DivisionEntry[] = entriesForDivision.map((entry) => ({
        id: entry.id,
        divisionId: entry.division_id,
        label: entry.label,
        playerIds: []
      }));

      const generated = generateRoundRobinSchedule({
        divisionId: division.id,
        entries: scheduleEntries,
        startDate: selectedTournament.start_date,
        endDate: selectedTournament.end_date
      });

      if (generated.length === 0) {
        skipped.push(`${division.name} has no playable rounds in the tournament date range`);
        continue;
      }

      rowsToInsert.push(
        ...generated.map((match) => ({
          division_id: match.divisionId,
          round: match.round,
          entry_a_id: match.entryAId,
          entry_b_id: match.entryBId,
          schedule_week_start: match.scheduleWeekStart,
          schedule_week_end: match.scheduleWeekEnd,
          extension_week_start: match.extensionWeekStart,
          extension_week_end: match.extensionWeekEnd,
          status: match.status
        }))
      );
    }

    if (rowsToInsert.length === 0) {
      setGeneratingSchedule(false);
      setMessage(skipped.length > 0 ? skipped.join(". ") : "No matches were generated.");
      return;
    }

    const { data, error } = await supabase
      .from("matches")
      .insert(rowsToInsert)
      .select(
        "id, division_id, round, entry_a_id, entry_b_id, schedule_week_start, schedule_week_end, extension_week_start, extension_week_end, status"
      );

    setGeneratingSchedule(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    const created = (data || []) as MatchRow[];
    setMatches((current) =>
      [...current, ...created].sort((a, b) => a.schedule_week_start.localeCompare(b.schedule_week_start) || a.round - b.round)
    );
    setMessage(`Generated ${created.length} match${created.length === 1 ? "" : "es"}.${skipped.length ? ` ${skipped.join(". ")}.` : ""}`);
  }

  function publishStandings() {
    if (!selectedTournament) return;
    if (matches.length === 0) {
      setMessage("Generate a schedule before publishing standings.");
      return;
    }
    setMessage("Standings are live. Leaderboards are calculated from completed matches, forfeits, and cancellations.");
  }

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Admin workspace</p>
          <h1>Tournament control center</h1>
          <p className="hero-copy">
            Set up divisions, approve registrations, generate round robin weeks, manage forfeits, and correct scores.
          </p>
        </div>
        <div className="card notice">
          <h2>{selectedTournament ? selectedTournament.name : "No tournament selected"}</h2>
          <p className="subtle">
            {selectedTournament
              ? `${selectedTournament.sport} from ${selectedTournament.start_date} through ${selectedTournament.end_date}`
              : "Create a tournament, add divisions, approve entries, then generate the schedule."}
          </p>
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
        </div>
      </section>

      <section className="grid two">
        <form className="card form-grid" onSubmit={createTournament}>
          <div className="section-title">
            <h2>Create Tournament</h2>
            <Trophy size={22} aria-hidden />
          </div>
          <label className="field">
            <span>Tournament name</span>
            <input
              onChange={(event) => setTournamentForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Club championship"
              required
              value={tournamentForm.name}
            />
          </label>
          <label className="field">
            <span>Sport</span>
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
            <label className="field">
              <span>Start date</span>
              <input
                onChange={(event) => setTournamentForm((current) => ({ ...current, startDate: event.target.value }))}
                required
                type="date"
                value={tournamentForm.startDate}
              />
            </label>
            <label className="field">
              <span>End date</span>
              <input
                onChange={(event) => setTournamentForm((current) => ({ ...current, endDate: event.target.value }))}
                required
                type="date"
                value={tournamentForm.endDate}
              />
            </label>
          </div>
          <button className="button" disabled={savingTournament || loading || !adminUser} type="submit">
            <CalendarPlus size={18} aria-hidden />
            {savingTournament ? "Creating..." : "Create tournament"}
          </button>
        </form>

        <div className="card form-grid">
          <div className="section-title">
            <h2>Tournament</h2>
            <CalendarPlus size={22} aria-hidden />
          </div>
          <label className="field">
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
          {message ? (
            <p className="subtle" data-testid="admin-status" role="status">
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

      <section className="admin-columns" style={{ marginTop: 14 }}>
        <form className="card form-grid" onSubmit={saveDivision}>
          <div className="section-title">
            <h2>Create Division</h2>
            <Plus size={22} aria-hidden />
          </div>
          <label className="field">
            <span>Skill level</span>
            <input
              onChange={(event) => setDivisionForm((current) => ({ ...current, skillLevel: event.target.value }))}
              required
              value={divisionForm.skillLevel}
            />
          </label>
          <label className="field">
            <span>Format</span>
            <select
              onChange={(event) => setDivisionForm((current) => ({ ...current, format: event.target.value as DivisionFormat }))}
              value={divisionForm.format}
            >
              <option value="singles">Singles</option>
              <option value="doubles">Doubles</option>
            </select>
          </label>
          <p className="subtle">Division name: {divisionName}</p>
          <button className="button" data-testid="save-division" disabled={savingDivision || !selectedTournament} type="submit">
            <CalendarPlus size={18} aria-hidden />
            {savingDivision ? "Saving..." : "Save division"}
          </button>
        </form>

        <div className="card">
          <div className="section-title">
            <h2>Registrations</h2>
            <ListChecks size={22} aria-hidden />
          </div>
          <EmptyState
            icon={<ListChecks size={24} aria-hidden />}
            title="No pending registrations"
            body="Player registration requests will appear here for approval."
          />
        </div>

        <div className="card">
          <div className="section-title">
            <h2>Divisions</h2>
            <Plus size={22} aria-hidden />
          </div>
          {divisions.length > 0 ? (
            <div className="match-list">
              {divisions.map((division) => (
                <article className="match-card" key={division.id}>
                  <div className="match-meta">
                    <strong>{division.name}</strong>
                    <span className="pill blue">{division.format}</span>
                  </div>
                  <p className="subtle">Skill level {division.skill_level}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Plus size={24} aria-hidden />}
              title="No saved divisions"
              body="Saved divisions for the selected tournament will appear here."
            />
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="section-title">
          <h2>Players</h2>
          <UsersRound size={22} aria-hidden />
        </div>
        <div className="admin-columns">
          <form className="form-grid" onSubmit={addPlayer}>
            <h3>Add Player</h3>
            <label className="field">
              <span>Player name</span>
              <input
                onChange={(event) => setPlayerForm((current) => ({ ...current, displayName: event.target.value }))}
                placeholder="Full name"
                required
                value={playerForm.displayName}
              />
            </label>
            <label className="field">
              <span>Rating</span>
              <input
                onChange={(event) => setPlayerForm((current) => ({ ...current, rating: event.target.value }))}
                placeholder="3.5"
                value={playerForm.rating}
              />
            </label>
            <button className="button" disabled={savingPlayer || !adminUser} type="submit">
              <Plus size={18} aria-hidden />
              {savingPlayer ? "Adding..." : "Add player"}
            </button>
          </form>

          <div className="form-grid">
            <h3>CSV Import</h3>
            <p className="subtle">Upload a CSV with columns named name or display_name, plus optional rating.</p>
            <label className="file-drop">
              <Upload size={22} aria-hidden />
              <span>{importingPlayers ? "Importing..." : "Choose CSV file"}</span>
              <input accept=".csv,text/csv" disabled={importingPlayers || !adminUser} onChange={importPlayers} type="file" />
            </label>
          </div>

          <div className="form-grid">
            <h3>Player List</h3>
            {players.length > 0 ? (
              <div className="compact-list">
                {players.slice(0, 8).map((player) => (
                  <div className="compact-row" key={player.id}>
                    <strong>{player.display_name}</strong>
                    <span className="subtle">{player.rating || "No rating"}</span>
                  </div>
                ))}
                {players.length > 8 ? <p className="subtle">Showing 8 of {players.length} players</p> : null}
              </div>
            ) : (
              <EmptyState icon={<UsersRound size={24} aria-hidden />} title="No players yet" body="Add players manually or import a CSV." />
            )}
          </div>
        </div>
      </section>

      <section className="grid two" style={{ marginTop: 14 }}>
        <form className="card form-grid" onSubmit={assignSinglesPlayer}>
          <div className="section-title">
            <h2>Assign Singles Player</h2>
            <Check size={22} aria-hidden />
          </div>
          <label className="field">
            <span>Singles division</span>
            <select
              disabled={singlesDivisions.length === 0}
              onChange={(event) => setSelectedSinglesDivisionId(event.target.value)}
              value={selectedSinglesDivisionId}
            >
              {singlesDivisions.length === 0 ? <option value="">No singles divisions</option> : null}
              {singlesDivisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Player</span>
            <select
              disabled={players.length === 0}
              onChange={(event) => setAssignmentForm({ playerId: event.target.value })}
              value={assignmentForm.playerId}
            >
              <option value="">Select player</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.display_name}
                </option>
              ))}
            </select>
          </label>
          <button className="button" disabled={assigningEntry || !assignmentForm.playerId || singlesDivisions.length === 0} type="submit">
            <Check size={18} aria-hidden />
            {assigningEntry ? "Assigning..." : "Assign to division"}
          </button>
        </form>

        <form className="card form-grid" onSubmit={createDoublesTeam}>
          <div className="section-title">
            <h2>Create Fixed Doubles Team</h2>
            <UsersRound size={22} aria-hidden />
          </div>
          <label className="field">
            <span>Doubles division</span>
            <select
              disabled={doublesDivisions.length === 0}
              onChange={(event) => setSelectedDoublesDivisionId(event.target.value)}
              value={selectedDoublesDivisionId}
            >
              {doublesDivisions.length === 0 ? <option value="">No doubles divisions</option> : null}
              {doublesDivisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Team name</span>
            <input
              onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Optional"
              value={teamForm.name}
            />
          </label>
          <div className="grid two">
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
          </div>
          <button
            className="button"
            disabled={creatingTeam || !teamForm.playerAId || !teamForm.playerBId || doublesDivisions.length === 0}
            type="submit"
          >
            <UsersRound size={18} aria-hidden />
            {creatingTeam ? "Creating..." : "Create team"}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="section-title">
          <h2>Match Management</h2>
          <span className="pill orange">admin editable</span>
        </div>
        {matches.length > 0 ? (
          <div className="match-list">
            {matches.map((match) => {
              const division = divisions.find((item) => item.id === match.division_id);
              const entryA = divisionEntries.find((entry) => entry.id === match.entry_a_id);
              const entryB = divisionEntries.find((entry) => entry.id === match.entry_b_id);

              return (
                <article className="match-card" key={match.id}>
                  <div className="match-meta">
                    <span className="pill blue">{division?.name || "Division"}</span>
                    <span className="pill">Round {match.round}</span>
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
                    <span className="pill orange">{match.status.replace("_", " ")}</span>
                  </div>
                </article>
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
    </>
  );
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
