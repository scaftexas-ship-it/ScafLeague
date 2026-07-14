"use client";

import { useState } from "react";
import { UsersRound } from "lucide-react";
import { createTeam } from "@/lib/admin-data";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";

export function TeamsPane({ admin }: { admin: AdminData }) {
  const [form, setForm] = useState({ name: "", playerAId: "", playerBId: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (!admin.supabase || !admin.adminUser) return;
    if (!form.playerAId || !form.playerBId || form.playerAId === form.playerBId) {
      setMessage("Choose two different players.");
      return;
    }
    const playerA = admin.players.find((player) => player.id === form.playerAId);
    const playerB = admin.players.find((player) => player.id === form.playerBId);
    if (!playerA || !playerB) return;

    const name = form.name.trim() || `${playerA.display_name} / ${playerB.display_name}`;
    if (admin.teams.some((team) => team.name.toLowerCase() === name.toLowerCase())) {
      setMessage("A team with that name already exists.");
      return;
    }

    setSaving(true);
    try {
      await createTeam(admin.supabase, { clubId: admin.adminUser.club_id, name, playerAId: form.playerAId, playerBId: form.playerBId });
      await admin.reloadTeams();
      setForm({ name: "", playerAId: "", playerBId: "" });
      setMessage("Team created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the team.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid two">
      <div className="card stack">
        <div className="section-title">
          <h2>Create Fixed Doubles Team</h2>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Team name (optional)</span>
            <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
          </label>
          <label className="field">
            <span>Player 1</span>
            <select onChange={(event) => setForm((current) => ({ ...current, playerAId: event.target.value }))} value={form.playerAId}>
              <option value="">Select</option>
              {admin.players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Player 2</span>
            <select onChange={(event) => setForm((current) => ({ ...current, playerBId: event.target.value }))} value={form.playerBId}>
              <option value="">Select</option>
              {admin.players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.display_name}
                </option>
              ))}
            </select>
          </label>
          <StatusBanner message={message} />
          <button className="button" disabled={saving} onClick={save} type="button">
            {saving ? "Saving..." : "Create team"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h2>Teams</h2>
        </div>
        {admin.teams.length > 0 ? (
          <div className="stack">
            {admin.teams.map((team) => (
              <div className="spread" key={team.id}>
                <strong>{team.name}</strong>
                <span className="pill">Fixed doubles</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<UsersRound size={24} aria-hidden />} title="No teams yet" body="Create one from the form on the left." />
        )}
      </div>
    </div>
  );
}
