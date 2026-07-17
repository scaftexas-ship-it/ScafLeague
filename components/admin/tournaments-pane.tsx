"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { createTournament, deleteTournament } from "@/lib/admin-data";
import { SCORING_RULES } from "@/lib/types";
import type { Sport } from "@/lib/types";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";
import { ScheduleBuilderPane } from "./schedule-builder/schedule-builder-pane";

const today = new Date().toISOString().slice(0, 10);
const SPORTS: Sport[] = ["pickleball", "badminton", "tennis", "volleyball"];

export function TournamentsPane({ admin }: { admin: AdminData }) {
  const [form, setForm] = useState({ name: "", sport: "pickleball" as Sport, startDate: today, endDate: today });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (!admin.supabase || !admin.adminUser) return;
    if (!form.name.trim()) {
      setMessage("Enter a tournament name.");
      return;
    }

    setSaving(true);
    try {
      const created = await createTournament(admin.supabase, {
        clubId: admin.adminUser.club_id,
        name: form.name.trim(),
        sport: form.sport,
        startDate: form.startDate,
        endDate: form.endDate,
        createdBy: admin.adminUser.id
      });
      await admin.reloadTournaments();
      admin.setSelectedTournamentId(created.id);
      setForm({ name: "", sport: "pickleball", startDate: today, endDate: today });
      setMessage("Tournament saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the tournament.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTournament(tournamentId: string) {
    if (!admin.supabase) return;
    try {
      await deleteTournament(admin.supabase, tournamentId);
      const remaining = await admin.reloadTournaments();
      if (admin.selectedTournamentId === tournamentId) admin.setSelectedTournamentId(remaining[0]?.id || "");
      setMessage("Tournament deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete the tournament.");
    }
  }

  async function copyLeaderboardLink() {
    const url = `${window.location.origin}/leaderboard/?tournament=${admin.selectedTournamentId}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Public leaderboard link copied -- anyone with it can view without signing in.");
    } catch {
      setMessage(url);
    }
  }

  return (
    <div className="grid two">
      <div className="card stack">
        <div className="section-title">
          <h2>Manage Tournaments</h2>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
          </label>
          <label className="field">
            <span>Sport</span>
            <select onChange={(event) => setForm((current) => ({ ...current, sport: event.target.value as Sport }))} value={form.sport}>
              {SPORTS.map((sport) => (
                <option key={sport} value={sport}>
                  {sport[0].toUpperCase() + sport.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Start date</span>
              <input onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} type="date" value={form.startDate} />
            </label>
            <label className="field">
              <span>End date</span>
              <input onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} type="date" value={form.endDate} />
            </label>
          </div>

          <div className="admin-scoring-note">
            <strong>Scoring</strong>
            <span>Points for a win: {SCORING_RULES.pointsPerWin}</span>
            <span>Points for a played loss: {SCORING_RULES.pointsPerPlayedLoss}</span>
            <span>Bonus point per set won when losing: {SCORING_RULES.bonusPointPerSetWonWhenLost}</span>
          </div>

          <StatusBanner message={message} />
          <button className="button" disabled={saving || !admin.adminUser} onClick={save} type="button">
            {saving ? "Saving..." : "Save Tournament"}
          </button>
        </div>

        {admin.tournaments.length > 0 ? (
          <div className="spread">
            <label className="field">
              <span>Selected tournament</span>
              <select onChange={(event) => admin.setSelectedTournamentId(event.target.value)} value={admin.selectedTournamentId}>
                {admin.tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>
            {admin.selectedTournamentId ? (
              <button className="button secondary small" onClick={copyLeaderboardLink} type="button">
                <Link2 size={14} aria-hidden />
                Copy public leaderboard link
              </button>
            ) : null}
            {admin.selectedTournamentId ? (
              <ConfirmButton
                confirmLabel={`Delete${admin.divisions.length > 0 ? ` (${admin.divisions.length} division${admin.divisions.length === 1 ? "" : "s"})` : ""}?`}
                key={admin.selectedTournamentId}
                onConfirm={() => removeTournament(admin.selectedTournamentId)}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {admin.selectedTournamentId ? (
        <ScheduleBuilderPane admin={admin} />
      ) : (
        <div className="card">
          <p className="subtle">Save a tournament first, then build its schedule here.</p>
        </div>
      )}
    </div>
  );
}
