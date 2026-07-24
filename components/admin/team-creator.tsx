"use client";

import { useState } from "react";
import { createTeam, createTeams } from "@/lib/admin-data";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";

/**
 * Team creation in one place instead of duplicated between teams-pane.tsx and
 * the schedule builder's inline "build a team" step. Two modes: a fixed
 * doubles pair (pickleball/tennis/badminton, built from two registered
 * players) or name-only teams pasted in bulk -- for sports like volleyball
 * where teams aren't built from individually-registered players at all.
 */
export function TeamCreator({ admin, onCreated }: { admin: AdminData; onCreated?: (teamIds: string[]) => void }) {
  const [mode, setMode] = useState<"pair" | "names">("pair");
  const [pairForm, setPairForm] = useState({ name: "", playerAId: "", playerBId: "" });
  const [namesText, setNamesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function existingNames() {
    return new Set(admin.teams.map((team) => team.name.toLowerCase()));
  }

  async function createPair() {
    if (!admin.supabase || !admin.adminUser) return;
    if (!pairForm.playerAId || !pairForm.playerBId || pairForm.playerAId === pairForm.playerBId) {
      setMessage("Choose two different players.");
      return;
    }
    const playerA = admin.players.find((player) => player.id === pairForm.playerAId);
    const playerB = admin.players.find((player) => player.id === pairForm.playerBId);
    if (!playerA || !playerB) return;

    const name = pairForm.name.trim() || `${playerA.display_name} / ${playerB.display_name}`;
    if (existingNames().has(name.toLowerCase())) {
      setMessage("A team with that name already exists.");
      return;
    }

    setSaving(true);
    try {
      const team = await createTeam(admin.supabase, { clubId: admin.adminUser.club_id, name, playerAId: pairForm.playerAId, playerBId: pairForm.playerBId });
      await admin.reloadTeams();
      onCreated?.([team.id]);
      setPairForm({ name: "", playerAId: "", playerBId: "" });
      setMessage("Team created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the team.");
    } finally {
      setSaving(false);
    }
  }

  async function createNamesOnly() {
    if (!admin.supabase || !admin.adminUser) return;
    const requested = namesText
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean);
    if (requested.length === 0) {
      setMessage("Enter at least one team name.");
      return;
    }

    const existing = existingNames();
    const seen = new Set<string>();
    const names: string[] = [];
    let duplicateCount = 0;
    for (const name of requested) {
      const key = name.toLowerCase();
      if (existing.has(key) || seen.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(key);
      names.push(name);
    }

    if (names.length === 0) {
      setMessage("Every name entered already exists as a team.");
      return;
    }

    setSaving(true);
    try {
      const created = await createTeams(admin.supabase, { clubId: admin.adminUser.club_id, names });
      await admin.reloadTeams();
      onCreated?.(created.map((team) => team.id));
      setNamesText("");
      setMessage(`Created ${created.length} team${created.length === 1 ? "" : "s"}.` + (duplicateCount > 0 ? ` Skipped ${duplicateCount} duplicate name${duplicateCount === 1 ? "" : "s"}.` : ""));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the teams.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <SegmentedControl
        ariaLabel="Team creation mode"
        onChange={(value) => {
          setMode(value);
          setMessage("");
        }}
        options={[
          { value: "pair", label: "Doubles pair" },
          { value: "names", label: "Team names only" }
        ]}
        value={mode}
      />

      {mode === "pair" ? (
        <div className="field-row">
          <label className="field">
            <span>Team name (optional)</span>
            <input onChange={(event) => setPairForm((current) => ({ ...current, name: event.target.value }))} value={pairForm.name} />
          </label>
          <label className="field">
            <span>Player 1</span>
            <select onChange={(event) => setPairForm((current) => ({ ...current, playerAId: event.target.value }))} value={pairForm.playerAId}>
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
            <select onChange={(event) => setPairForm((current) => ({ ...current, playerBId: event.target.value }))} value={pairForm.playerBId}>
              <option value="">Select</option>
              {admin.players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.display_name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="button secondary small" disabled={saving} onClick={createPair} type="button">
              {saving ? "Saving..." : "Create team"}
            </button>
          </div>
        </div>
      ) : (
        <div className="field-row">
          <label className="field" style={{ flex: 1 }}>
            <span>Team names, one per line</span>
            <textarea
              onChange={(event) => setNamesText(event.target.value)}
              placeholder={"Thunder\nLightning\nStorm"}
              rows={4}
              value={namesText}
            />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="button secondary small" disabled={saving} onClick={createNamesOnly} type="button">
              {saving ? "Saving..." : "Add teams"}
            </button>
          </div>
        </div>
      )}

      <StatusBanner message={message} />
    </div>
  );
}
