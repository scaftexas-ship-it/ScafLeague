"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flag, Send, Trophy } from "lucide-react";
import { canClaimForfeit } from "@/lib/league-rules";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { Match, MatchSet, MatchStatus } from "@/lib/types";

type AppUser = {
  id: string;
  club_id: string;
  role: "admin" | "player";
  full_name: string;
  email: string;
};

type PlayerProfileRow = {
  id: string;
  display_name: string;
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

export function PlayerWorkspace() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [profiles, setProfiles] = useState<PlayerProfileRow[]>([]);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [entries, setEntries] = useState<DivisionEntryRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [myEntryIds, setMyEntryIds] = useState<string[]>([]);
  const [message, setMessage] = useState("Loading player schedule...");

  useEffect(() => {
    void loadPlayerSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduledCount = matches.filter((match) => match.status === "scheduled").length;
  const divisionCount = new Set(matches.map((match) => match.division_id)).size;

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
      return;
    }

    const userResult = await withTimeout(
      supabase.from("users").select("id, club_id, role, full_name, email").eq("id", authData.user.id).single(),
      6000,
      "The app user profile lookup did not respond. Check public.users and RLS policies."
    );
    if ("timeout" in userResult) {
      setMessage(userResult.timeout);
      return;
    }
    const { data: userRow, error: userError } = userResult;

    if (userError || !userRow) {
      setMessage("Your login works, but no app user profile was found.");
      return;
    }

    const currentUser = userRow as AppUser;
    setAppUser(currentUser);

    const profileResult = await withTimeout(
      supabase.from("player_profiles").select("id, display_name, rating, user_id").eq("user_id", currentUser.id),
      6000,
      "The player profile lookup did not respond. Check player_profiles RLS policies."
    );
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
      setMessage("No player profile is linked to this login yet. Ask an admin to connect your account to a player profile.");
      return;
    }

    if (currentUser.role === "admin" && playerProfiles.length === 0) {
      await loadAdminPreview(currentUser);
      return;
    }

    await loadMatchesForProfiles(playerProfiles);
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
    await loadMatchesForDivisionIds(divisionIds, [], "Admin preview: showing all scheduled tournament matches.");
  }

  async function loadMatchesForProfiles(playerProfiles: PlayerProfileRow[]) {
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
    await loadMatchesForDivisionIds(divisionIds, entryIds, "Player schedule loaded.");
  }

  async function loadMatchesForDivisionIds(divisionIds: string[], entryIds: string[], successMessage: string) {
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
      .select("id, division_id, round, entry_a_id, entry_b_id, schedule_week_start, schedule_week_end, extension_week_start, extension_week_end, status")
      .in("division_id", divisionIds)
      .order("schedule_week_start", { ascending: true })
      .order("round", { ascending: true });

    if (matchError) {
      setMessage(matchError.message);
      return;
    }

    const allMatches = (matchRows || []) as MatchRow[];
    const visibleMatches =
      entryIds.length > 0 ? allMatches.filter((match) => entryIds.includes(match.entry_a_id) || entryIds.includes(match.entry_b_id)) : allMatches;

    setDivisions((divisionRows || []) as DivisionRow[]);
    setEntries((entryRows || []) as DivisionEntryRow[]);
    setMatches(visibleMatches);
    setMessage(visibleMatches.length > 0 ? successMessage : "No scheduled matches found yet.");
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
      .select("id, division_id, round, entry_a_id, entry_b_id, schedule_week_start, schedule_week_end, extension_week_start, extension_week_end, status")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setMatches((current) => current.map((item) => (item.id === match.id ? (data as MatchRow) : item)));
    setMessage("Score submitted.");
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
      .select("id, division_id, round, entry_a_id, entry_b_id, schedule_week_start, schedule_week_end, extension_week_start, extension_week_end, status")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setMatches((current) => current.map((item) => (item.id === match.id ? (data as MatchRow) : item)));
    setMessage("Forfeit recorded.");
  }

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Player view</p>
          <h1>My matches</h1>
          <p className="hero-copy">
            Players only act on their own matches, while tournament schedules and leaderboards remain visible to everyone.
          </p>
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
        <div className="grid two">
          <div className="card metric">
            <span className="pill blue">Scheduled</span>
            <strong>{scheduledCount}</strong>
            <p className="subtle">Upcoming match windows</p>
          </div>
          <div className="card metric">
            <span className="pill">Divisions</span>
            <strong>{divisionCount}</strong>
            <p className="subtle">Current approved entries</p>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <div className="section-title">
            <h2>Action Needed</h2>
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
                  myEntryIds={myEntryIds}
                  onClaimForfeit={claimForfeit}
                  onSubmitScore={submitScore}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Flag size={24} aria-hidden />}
              title="No player matches"
              body="Your scheduled matches will appear after an admin adds you to a division and generates the schedule."
            />
          )}
        </div>

        <div className="card">
          <div className="section-title">
            <h2>My Standings</h2>
            <Trophy size={22} aria-hidden />
          </div>
          {profiles.length > 0 ? (
            <div className="compact-list">
              {profiles.map((profile) => (
                <div className="compact-row" key={profile.id}>
                  <strong>{profile.display_name}</strong>
                  <span className="subtle">{profile.rating || "No rating"}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Trophy size={24} aria-hidden />}
              title="No linked player profile"
              body="A player profile must be linked to your login before personal standings can be shown."
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
  onSubmitScore
}: {
  canAct: boolean;
  division?: DivisionRow;
  entryA?: DivisionEntryRow;
  entryB?: DivisionEntryRow;
  match: MatchRow;
  myEntryIds: string[];
  onClaimForfeit: (match: MatchRow, claimedByEntryId: string) => Promise<void>;
  onSubmitScore: (match: MatchRow, sets: MatchSet[]) => Promise<void>;
}) {
  const [showScoreForm, setShowScoreForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claimingForfeit, setClaimingForfeit] = useState(false);
  const [scoreForm, setScoreForm] = useState({
    set1A: "11",
    set1B: "0",
    set2A: "11",
    set2B: "0",
    set3A: "",
    set3B: ""
  });
  const playerEntryId = myEntryIds.find((entryId) => entryId === match.entry_a_id || entryId === match.entry_b_id) || "";
  const forfeitMatch = toDomainMatch(match);
  const canForfeit = Boolean(playerEntryId && canClaimForfeit(forfeitMatch, playerEntryId));
  const canEdit = canAct && (match.status === "scheduled" || match.status === "score_submitted");

  async function handleScoreSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sets = buildSets(scoreForm);
    setSubmitting(true);
    await onSubmitScore(match, sets);
    setSubmitting(false);
    setShowScoreForm(false);
  }

  async function handleClaimForfeit() {
    if (!playerEntryId) return;
    setClaimingForfeit(true);
    await onClaimForfeit(match, playerEntryId);
    setClaimingForfeit(false);
  }

  return (
    <article className="match-card">
      <div className="match-meta">
        <span className="pill blue">{division?.name || "Division"}</span>
        <span className="pill">Round {match.round}</span>
      </div>
      <div className="versus">
        <span>{entryA?.label || "Entry A"}</span>
        <span className="subtle">vs</span>
        <span>{entryB?.label || "Entry B"}</span>
      </div>
      <p className="subtle">Schedule week: {match.schedule_week_start} to {match.schedule_week_end}</p>
      <p className="subtle">Extension week: {match.extension_week_start} to {match.extension_week_end}</p>
      <div className="toolbar">
        <span className="pill orange">{match.status.replace("_", " ")}</span>
        <button className="button secondary" disabled={!canEdit} onClick={() => setShowScoreForm((current) => !current)} type="button">
          <Send size={18} aria-hidden />
          Submit score
        </button>
        <button className="button warning" disabled={!canForfeit || claimingForfeit} onClick={handleClaimForfeit} type="button">
          <Flag size={18} aria-hidden />
          {claimingForfeit ? "Claiming..." : "Claim forfeit"}
        </button>
      </div>
      {showScoreForm ? (
        <form className="score-form" onSubmit={handleScoreSubmit}>
          <ScoreSetFields
            aLabel={entryA?.label || "A"}
            bLabel={entryB?.label || "B"}
            fieldA="set1A"
            fieldB="set1B"
            label="Set 1"
            scoreForm={scoreForm}
            setScoreForm={setScoreForm}
          />
          <ScoreSetFields
            aLabel={entryA?.label || "A"}
            bLabel={entryB?.label || "B"}
            fieldA="set2A"
            fieldB="set2B"
            label="Set 2"
            scoreForm={scoreForm}
            setScoreForm={setScoreForm}
          />
          <ScoreSetFields
            aLabel={entryA?.label || "A"}
            bLabel={entryB?.label || "B"}
            fieldA="set3A"
            fieldB="set3B"
            label="Set 3"
            optional
            scoreForm={scoreForm}
            setScoreForm={setScoreForm}
          />
          <button className="button" disabled={submitting} type="submit">
            <Send size={18} aria-hidden />
            {submitting ? "Submitting..." : "Save score"}
          </button>
        </form>
      ) : null}
    </article>
  );
}

function ScoreSetFields({
  aLabel,
  bLabel,
  fieldA,
  fieldB,
  label,
  optional,
  scoreForm,
  setScoreForm
}: {
  aLabel: string;
  bLabel: string;
  fieldA: keyof ScoreFormState;
  fieldB: keyof ScoreFormState;
  label: string;
  optional?: boolean;
  scoreForm: ScoreFormState;
  setScoreForm: React.Dispatch<React.SetStateAction<ScoreFormState>>;
}) {
  return (
    <div className="score-set">
      <strong>{label}</strong>
      <label className="field">
        <span>{aLabel}</span>
        <input
          min="0"
          onChange={(event) => setScoreForm((current) => ({ ...current, [fieldA]: event.target.value }))}
          required={!optional}
          type="number"
          value={scoreForm[fieldA]}
        />
      </label>
      <label className="field">
        <span>{bLabel}</span>
        <input
          min="0"
          onChange={(event) => setScoreForm((current) => ({ ...current, [fieldB]: event.target.value }))}
          required={!optional}
          type="number"
          value={scoreForm[fieldB]}
        />
      </label>
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
    entryAId: match.entry_a_id,
    entryBId: match.entry_b_id,
    scheduleWeekStart: match.schedule_week_start,
    scheduleWeekEnd: match.schedule_week_end,
    extensionWeekStart: match.extension_week_start,
    extensionWeekEnd: match.extension_week_end,
    status: match.status,
    sets: []
  };
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

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, timeout: string): Promise<T | { timeout: string }> {
  return Promise.race([
    promise,
    new Promise<{ timeout: string }>((resolve) => {
      window.setTimeout(() => resolve({ timeout }), timeoutMs);
    })
  ]);
}
