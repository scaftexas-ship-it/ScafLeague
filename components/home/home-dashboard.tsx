"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, ClipboardList, UsersRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { getCurrentAppUser, listDivisionEntries, listDivisions, listMatches, listStandings, listTournaments } from "@/lib/admin-data";
import type { DivisionEntryRow, DivisionRow, MatchRow, StandingRow, TournamentRow } from "@/lib/admin-data";
import { StatusBanner } from "@/components/ui/status-banner";
import { MatchesCard } from "./matches-card";
import { LeaderboardCard } from "./leaderboard-card";

export function HomeDashboard() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [entries, setEntries] = useState<DivisionEntryRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [message, setMessage] = useState("Loading dashboard...");

  useEffect(() => {
    // Supabase's password-reset email links redirect to the site's root URL,
    // not necessarily /login -- if that lands here, hand off to /login's
    // "set new password" form instead of treating it as a normal sign-in.
    // Under the PKCE flow, completing the recovery link exchange fires
    // SIGNED_IN rather than PASSWORD_RECOVERY, and the redirect only carries
    // a "code" param (no "type" hint survives to here), so check for that
    // instead of relying on which event comes back.
    const isRecoveryLink =
      typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).has("code") || window.location.hash.includes("type=recovery"));

    if (isRecoveryLink) {
      sessionStorage.setItem("scaf-password-recovery", "1");
      router.replace("/login");
      return;
    }

    const {
      data: { subscription }
    } = supabase?.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        sessionStorage.setItem("scaf-password-recovery", "1");
        router.replace("/login");
      }
    }) || { data: { subscription: undefined } };

    void loadDashboard();
    return () => subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard() {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    try {
      const appUser = await getCurrentAppUser(supabase);
      if (!appUser) {
        router.replace("/login");
        return;
      }
      if (appUser.access_disabled) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }
      if (appUser.role === "player") {
        router.replace("/player");
        return;
      }

      const tournaments = await listTournaments(supabase, appUser.club_id);
      const selectedTournament = tournaments[0];
      if (!selectedTournament) {
        setMessage("Create your first tournament from the admin workspace.");
        return;
      }
      setTournament(selectedTournament);

      const loadedDivisions = await listDivisions(supabase, selectedTournament.id);
      const divisionIds = loadedDivisions.map((division) => division.id);
      setDivisions(loadedDivisions);

      if (divisionIds.length === 0) {
        setMessage("Create divisions from the admin workspace.");
        return;
      }

      const [entryRows, standingRows, matchRows] = await Promise.all([
        listDivisionEntries(supabase, divisionIds),
        listStandings(supabase, divisionIds),
        listMatches(supabase, divisionIds)
      ]);

      setEntries(entryRows);
      setStandings(standingRows);
      setMatches(matchRows);
      setMessage("Dashboard loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the dashboard.");
    }
  }

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">SCAF League</p>
          <h1>{tournament?.name || "Tournament dashboard"}</h1>
          <p className="hero-copy">
            Mobile tournament operations for weekly round robin play, division standings, player registration, score posting, and forfeit
            handling.
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
          <StatusBanner message={message} />
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
        <MatchesCard divisions={divisions} entries={entries} matches={matches} />
        <LeaderboardCard entries={entries} standings={standings} />
      </section>

      <section className="grid three">
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
