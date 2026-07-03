"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarPlus, ClipboardList, Medal, UsersRound } from "lucide-react";
import { isMissingTargetScoreColumn, matchSelectBasic, matchSelectWithTargetScore } from "@/lib/match-queries";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { MatchStatus, Sport } from "@/lib/types";

type TournamentRow = {
  id: string;
  name: string;
  sport: Sport;
  start_date: string;
  end_date: string;
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
};

type MatchRow = {
  id: string;
  division_id: string;
  round: number;
  entry_a_id: string;
  entry_b_id: string;
  schedule_week_start: string;
  schedule_week_end: string;
  extension_week_end: string;
  status: MatchStatus;
  target_score?: number | null;
};

type StandingRow = {
  division_id: string;
  entry_id: string;
  wins: number;
  losses: number;
  points: number;
};

export function HomeDashboard() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [entries, setEntries] = useState<DivisionEntryRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [message, setMessage] = useState("Loading dashboard...");

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard() {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setMessage("Sign in to view live tournament data.");
      return;
    }

    const { data: tournamentRows, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, name, sport, start_date, end_date")
      .order("created_at", { ascending: false })
      .limit(1);

    if (tournamentError) {
      setMessage(tournamentError.message);
      return;
    }

    const selectedTournament = (tournamentRows || [])[0] as TournamentRow | undefined;
    if (!selectedTournament) {
      setMessage("Create your first tournament from the admin workspace.");
      return;
    }

    setTournament(selectedTournament);

    const { data: divisionRows, error: divisionError } = await supabase
      .from("divisions")
      .select("id, name, skill_level, format")
      .eq("tournament_id", selectedTournament.id)
      .order("created_at", { ascending: true });

    if (divisionError) {
      setMessage(divisionError.message);
      return;
    }

    const loadedDivisions = (divisionRows || []) as DivisionRow[];
    const divisionIds = loadedDivisions.map((division) => division.id);
    setDivisions(loadedDivisions);

    if (divisionIds.length === 0) {
      setMessage("Create divisions from the admin workspace.");
      return;
    }

    const [{ data: entryRows, error: entryError }, { data: standingRows, error: standingError }] = await Promise.all([
      supabase.from("division_entries").select("id, division_id, label").in("division_id", divisionIds),
      supabase.from("standings").select("division_id, entry_id, wins, losses, points").in("division_id", divisionIds)
    ]);

    if (entryError || standingError) {
      setMessage(entryError?.message || standingError?.message || "Could not load dashboard.");
      return;
    }

    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select(matchSelectWithTargetScore)
      .in("division_id", divisionIds)
      .order("schedule_week_start", { ascending: true });

    if (matchError) {
      if (!isMissingTargetScoreColumn(matchError)) {
        setMessage(matchError.message);
        return;
      }

      const { data: fallbackMatches, error: fallbackMatchError } = await supabase
        .from("matches")
        .select(matchSelectBasic)
        .in("division_id", divisionIds)
        .order("schedule_week_start", { ascending: true });

      if (fallbackMatchError) {
        setMessage(fallbackMatchError.message);
        return;
      }

      setEntries((entryRows || []) as DivisionEntryRow[]);
      setMatches(((fallbackMatches || []) as MatchRow[]).map((match) => ({ ...match, target_score: 11 })));
      setStandings(((standingRows || []) as StandingRow[]).sort((a, b) => b.points - a.points || b.wins - a.wins));
      setMessage("Dashboard loaded.");
      return;
    }

    setEntries((entryRows || []) as DivisionEntryRow[]);
    setMatches((matchRows || []) as MatchRow[]);
    setStandings(((standingRows || []) as StandingRow[]).sort((a, b) => b.points - a.points || b.wins - a.wins));
    setMessage("Dashboard loaded.");
  }

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">SCAF League</p>
          <h1>{tournament?.name || "Tournament dashboard"}</h1>
          <p className="hero-copy">
            Mobile tournament operations for weekly round robin play, division standings, player registration, score posting, and forfeit handling.
          </p>
          <div className="toolbar">
            <Link className="button" href="/admin">
              <CalendarPlus size={18} aria-hidden />
              Admin workspace
            </Link>
            <Link className="button secondary" href="/player">
              <ClipboardList size={18} aria-hidden />
              My matches
            </Link>
          </div>
          <p className="subtle" role="status">{message}</p>
        </div>
        <div className="grid two">
          <div className="card metric">
            <span className="pill">{tournament?.sport || "Setup"}</span>
            <strong>{divisions.length}</strong>
            <p className="subtle">Active divisions</p>
          </div>
          <div className="card metric">
            <span className="pill blue">Round robin</span>
            <strong>{matches.length}</strong>
            <p className="subtle">Scheduled tournament games</p>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <div className="section-title">
            <h2>All Games</h2>
            <span className="pill orange">weekly windows</span>
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
                      <span className="pill blue">{division?.name || "Division"}</span>
                      <span className="pill">Round {match.round}</span>
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
              title="No matches scheduled"
              body="Once an admin creates divisions, adds entries, and generates a schedule, tournament games will appear here."
            />
          )}
        </div>

        <div className="card">
          <div className="section-title">
            <h2>Leaderboards</h2>
            <Medal size={22} aria-hidden />
          </div>
          {standings.length > 0 ? (
            <div className="leaderboard">
              <div className="table-row header">
                <span>#</span>
                <span>Entry</span>
                <span>W</span>
                <span>Pts</span>
              </div>
              {standings.map((standing, index) => {
                const entry = entries.find((item) => item.id === standing.entry_id);
                return (
                  <div className="table-row" key={`${standing.division_id}-${standing.entry_id}`}>
                    <span>{index + 1}</span>
                    <strong>{entry?.label || "Entry"}</strong>
                    <span>{standing.wins}</span>
                    <strong>{standing.points}</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Medal size={24} aria-hidden />}
              title="No standings yet"
              body="Leaderboards are calculated from posted match results and forfeits."
            />
          )}
        </div>
      </section>

      <section className="grid three" style={{ marginTop: 14 }}>
        <div className="card">
          <UsersRound size={24} aria-hidden />
          <h3>Player registration</h3>
          <p className="subtle">Players request divisions and admins approve before scheduling.</p>
        </div>
        <div className="card">
          <ClipboardList size={24} aria-hidden />
          <h3>Score rules</h3>
          <p className="subtle">Wins earn 4 points. Played losses earn 1 point plus a set-win bonus.</p>
        </div>
        <div className="card">
          <CalendarPlus size={24} aria-hidden />
          <h3>Schedule windows</h3>
          <p className="subtle">Each match has one schedule week followed by one extension week.</p>
        </div>
      </section>
    </>
  );
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
