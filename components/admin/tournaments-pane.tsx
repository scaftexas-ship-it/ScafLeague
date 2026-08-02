"use client";

import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { createTournament, deleteTournament, updateClubScoringRules, updateTournament, uploadTournamentLogo } from "@/lib/admin-data";
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
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const selectedTournament = admin.tournaments.find((tournament) => tournament.id === admin.selectedTournamentId);

  // The form used to only ever create. Selecting a tournament and changing its
  // dates silently did nothing, because save() always called createTournament
  // and the fields never loaded the selected tournament's values. Now the form
  // edits whatever is selected, and creating is an explicit mode.
  const [creatingNew, setCreatingNew] = useState(false);

  useEffect(() => {
    if (creatingNew || !selectedTournament) return;
    setForm({
      name: selectedTournament.name,
      sport: selectedTournament.sport,
      startDate: selectedTournament.start_date,
      endDate: selectedTournament.end_date
    });
    setMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.selectedTournamentId, creatingNew]);

  function startNewTournament() {
    setCreatingNew(true);
    setForm({ name: "", sport: "pickleball", startDate: today, endDate: today });
    setMessage("");
  }

  function cancelNewTournament() {
    setCreatingNew(false);
    setMessage("");
  }

  const [scoringForm, setScoringForm] = useState({
    pointsPerWin: String(SCORING_RULES.pointsPerWin),
    pointsPerPlayedLoss: String(SCORING_RULES.pointsPerPlayedLoss),
    bonusPointPerSetWonWhenLost: String(SCORING_RULES.bonusPointPerSetWonWhenLost)
  });
  const [savingScoring, setSavingScoring] = useState(false);
  const [scoringMessage, setScoringMessage] = useState("");

  useEffect(() => {
    if (!admin.club) return;
    setScoringForm({
      pointsPerWin: String(admin.club.points_per_win),
      pointsPerPlayedLoss: String(admin.club.points_per_played_loss),
      bonusPointPerSetWonWhenLost: String(admin.club.bonus_point_per_set_won_when_lost)
    });
  }, [admin.club]);

  async function saveScoringRules() {
    if (!admin.supabase || !admin.adminUser) return;
    const rules = {
      pointsPerWin: Number(scoringForm.pointsPerWin),
      pointsPerPlayedLoss: Number(scoringForm.pointsPerPlayedLoss),
      bonusPointPerSetWonWhenLost: Number(scoringForm.bonusPointPerSetWonWhenLost)
    };
    if (!Number.isInteger(rules.pointsPerWin) || !Number.isInteger(rules.pointsPerPlayedLoss) || !Number.isInteger(rules.bonusPointPerSetWonWhenLost)) {
      setScoringMessage("Enter whole numbers for each point value.");
      return;
    }
    setSavingScoring(true);
    setScoringMessage("");
    try {
      await updateClubScoringRules(admin.supabase, admin.adminUser.club_id, rules);
      await admin.reloadClub();
      setScoringMessage("Scoring rules updated. Applies to every tournament's standings going forward.");
    } catch (error) {
      setScoringMessage(error instanceof Error ? error.message : "Could not save the scoring rules.");
    } finally {
      setSavingScoring(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!admin.supabase || !admin.selectedTournamentId) return;
    setUploadingLogo(true);
    setLogoMessage("");
    try {
      await uploadTournamentLogo(admin.supabase, admin.selectedTournamentId, file);
      await admin.reloadTournaments();
      setLogoMessage("Logo updated.");
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "Could not upload the logo.");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function save() {
    if (!admin.supabase || !admin.adminUser) return;
    if (!form.name.trim()) {
      setMessage("Enter a tournament name.");
      return;
    }

    if (form.endDate < form.startDate) {
      setMessage("The end date can't be before the start date.");
      return;
    }

    const editingExisting = !creatingNew && Boolean(admin.selectedTournamentId);

    setSaving(true);
    try {
      if (editingExisting) {
        await updateTournament(admin.supabase, admin.selectedTournamentId, {
          name: form.name.trim(),
          sport: form.sport,
          startDate: form.startDate,
          endDate: form.endDate
        });
        await admin.reloadTournaments();
        setMessage("Tournament updated. Matches that were already generated keep their own dates -- reschedule those from the Matches tab.");
        return;
      }

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
      setCreatingNew(false);
      setMessage("Tournament created.");
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
          <h2>{creatingNew || !admin.selectedTournamentId ? "New Tournament" : `Editing: ${selectedTournament?.name ?? ""}`}</h2>
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

          <StatusBanner message={message} />
          <div className="toolbar">
            <button className="button" disabled={saving || !admin.adminUser} onClick={save} type="button">
              {saving ? "Saving..." : creatingNew || !admin.selectedTournamentId ? "Create tournament" : "Update tournament"}
            </button>
            {creatingNew ? (
              admin.tournaments.length > 0 ? (
                <button className="button secondary" disabled={saving} onClick={cancelNewTournament} type="button">
                  Cancel
                </button>
              ) : null
            ) : (
              <button className="button secondary" disabled={saving} onClick={startNewTournament} type="button">
                New tournament
              </button>
            )}
          </div>
        </div>

        <div className="admin-scoring-note">
          <strong>Scoring</strong>
          <p className="subtle">Applies to every tournament in this club's standings.</p>
          <div className="field-row">
            <label className="field">
              <span>Points for a win</span>
              <input
                min={0}
                onChange={(event) => setScoringForm((current) => ({ ...current, pointsPerWin: event.target.value }))}
                type="number"
                value={scoringForm.pointsPerWin}
              />
            </label>
            <label className="field">
              <span>Points for a played loss</span>
              <input
                min={0}
                onChange={(event) => setScoringForm((current) => ({ ...current, pointsPerPlayedLoss: event.target.value }))}
                type="number"
                value={scoringForm.pointsPerPlayedLoss}
              />
            </label>
            <label className="field">
              <span>Bonus point per set won when losing</span>
              <input
                min={0}
                onChange={(event) => setScoringForm((current) => ({ ...current, bonusPointPerSetWonWhenLost: event.target.value }))}
                type="number"
                value={scoringForm.bonusPointPerSetWonWhenLost}
              />
            </label>
          </div>
          <StatusBanner message={scoringMessage} />
          <button className="button secondary small" disabled={savingScoring || !admin.adminUser} onClick={saveScoringRules} type="button">
            {savingScoring ? "Saving..." : "Save scoring rules"}
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

        {admin.selectedTournamentId ? (
          <div className="stack">
            <div className="spread">
              <span className="subtle">Leaderboard logo</span>
              {selectedTournament?.logo_url ? (
                <img alt="Tournament logo" className="club-logo-preview" src={selectedTournament.logo_url} />
              ) : (
                <span className="subtle">No logo set</span>
              )}
            </div>
            <label className="field">
              <span>Upload a logo for this tournament's public leaderboard</span>
              <input
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                disabled={uploadingLogo}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadLogo(file);
                }}
                ref={logoInputRef}
                type="file"
              />
            </label>
            <p className="subtle">PNG, JPG, SVG, or WebP, up to 2 MB. Shown on this tournament's public leaderboard link -- lets different sports clubs share this app with their own branding instead of one logo for everyone.</p>
            <StatusBanner message={logoMessage} />
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
