"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { getTournament, listDivisionEntries, listDivisions, listStandings } from "@/lib/admin-data";
import type { DivisionEntryRow, DivisionRow, StandingRow, TournamentRow } from "@/lib/admin-data";
import { StatusBanner } from "@/components/ui/status-banner";
import { TournamentLeaderboard } from "@/components/player/tournament-leaderboard";

export function PublicLeaderboard() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [entries, setEntries] = useState<DivisionEntryRow[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [message, setMessage] = useState("Loading leaderboard...");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    const tournamentId = new URLSearchParams(window.location.search).get("tournament");
    if (!tournamentId) {
      setMessage("No tournament specified. Use the leaderboard link shared by your league admin.");
      return;
    }

    try {
      const loadedTournament = await getTournament(supabase, tournamentId);
      if (!loadedTournament) {
        setMessage("This leaderboard link is invalid or the tournament no longer exists.");
        return;
      }
      setTournament(loadedTournament);

      const loadedDivisions = await listDivisions(supabase, tournamentId);
      setDivisions(loadedDivisions);
      const divisionIds = loadedDivisions.map((division) => division.id);
      if (divisionIds.length === 0) {
        setMessage("This tournament doesn't have any divisions yet.");
        return;
      }

      const [loadedEntries, loadedStandings] = await Promise.all([listDivisionEntries(supabase, divisionIds), listStandings(supabase, divisionIds)]);
      setEntries(loadedEntries);
      setStandings(loadedStandings);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the leaderboard.");
    }
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="eyebrow">Public leaderboard</p>
          <h1>{tournament?.name || "Tournament leaderboard"}</h1>
          {tournament ? <p className="hero-copy">{tournament.sport[0].toUpperCase() + tournament.sport.slice(1)}</p> : null}
          <StatusBanner message={message} />
        </div>
        {tournament?.logo_url ? <img alt="" className="leaderboard-logo" src={tournament.logo_url} /> : null}
      </div>
      {divisions.length > 0 ? (
        <TournamentLeaderboard divisions={divisions} entries={entries} standings={standings} />
      ) : tournament ? (
        <div className="card">
          <div className="section-title">
            <h2>Leaderboard</h2>
            <Trophy size={22} aria-hidden />
          </div>
        </div>
      ) : null}
    </div>
  );
}
