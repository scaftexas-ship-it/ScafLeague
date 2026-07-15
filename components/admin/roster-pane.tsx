"use client";

import { useState } from "react";
import { UserCog } from "lucide-react";
import { replaceDivisionEntryPlayer, replaceTeamMember } from "@/lib/admin-data";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";

/** Lets an admin swap a player out of a singles entry or a doubles team mid-tournament (injury, withdrawal, etc.) without disturbing the already-generated schedule, since matches reference the entry/team id rather than the player directly. */
export function RosterPane({ admin }: { admin: AdminData }) {
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");
  const [replacementByEntry, setReplacementByEntry] = useState<Record<string, string>>({});

  const divisionIds = new Set(admin.divisions.map((division) => division.id));
  const entries = admin.divisionEntries.filter((entry) => divisionIds.has(entry.division_id));

  async function replaceSingles(entryId: string, playerId: string) {
    const newPlayer = admin.players.find((player) => player.id === playerId);
    if (!admin.supabase || !newPlayer) return;
    setSavingKey(entryId);
    setMessage("");
    try {
      await replaceDivisionEntryPlayer(admin.supabase, entryId, playerId, newPlayer.display_name);
      await admin.reloadDivisions();
      setMessage(`Replaced with ${newPlayer.display_name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not replace the player.");
    } finally {
      setSavingKey("");
    }
  }

  async function replaceDoubles(teamId: string, oldPlayerId: string, newPlayerId: string) {
    const newPlayer = admin.players.find((player) => player.id === newPlayerId);
    if (!admin.supabase || !newPlayer) return;
    setSavingKey(`${teamId}:${oldPlayerId}`);
    setMessage("");
    try {
      await replaceTeamMember(admin.supabase, teamId, oldPlayerId, newPlayerId);
      await admin.reloadTeams();
      setMessage(`Replaced with ${newPlayer.display_name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not replace the player.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <div className="card stack">
      <div className="section-title">
        <h2>Roster</h2>
      </div>
      <p className="subtle">Replace a player mid-tournament (injury, withdrawal). Scheduled and future matches carry over unchanged.</p>
      <StatusBanner message={message} />

      {entries.length === 0 ? (
        <EmptyState icon={<UserCog size={24} aria-hidden />} title="No entries yet" body="Generate a schedule from the Tournaments tab first." />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Division</th>
                <th>Entry</th>
                <th>Replace with</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const division = admin.divisions.find((item) => item.id === entry.division_id);

                if (entry.player_id) {
                  const key = entry.id;
                  const otherPlayerIds = new Set(entries.filter((item) => item.id !== entry.id).map((item) => item.player_id).filter(Boolean));
                  const options = admin.players.filter((player) => player.id === entry.player_id || !otherPlayerIds.has(player.id));
                  return (
                    <tr key={entry.id}>
                      <td>{division?.name || "Division"}</td>
                      <td>{entry.label}</td>
                      <td>
                        <select
                          disabled={savingKey === key}
                          onChange={(event) => setReplacementByEntry((current) => ({ ...current, [key]: event.target.value }))}
                          value={replacementByEntry[key] || entry.player_id}
                        >
                          {options.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.display_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="button secondary small"
                          disabled={savingKey === key || !replacementByEntry[key] || replacementByEntry[key] === entry.player_id}
                          onClick={() => replaceSingles(entry.id, replacementByEntry[key])}
                          type="button"
                        >
                          {savingKey === key ? "Saving..." : "Replace"}
                        </button>
                      </td>
                    </tr>
                  );
                }

                if (entry.team_id) {
                  const members = admin.teamMembers.filter((member) => member.team_id === entry.team_id);
                  return members.map((member) => {
                    const key = `${entry.team_id}:${member.player_id}`;
                    const currentPlayer = admin.players.find((player) => player.id === member.player_id);
                    const teammateIds = new Set(members.filter((item) => item.player_id !== member.player_id).map((item) => item.player_id));
                    const rosterPlayerIds = new Set(entries.flatMap((item) => (item.player_id ? [item.player_id] : [])));
                    const teamPlayerIds = new Set(admin.teamMembers.map((item) => item.player_id));
                    const options = admin.players.filter(
                      (player) => player.id === member.player_id || (!teammateIds.has(player.id) && !rosterPlayerIds.has(player.id) && !teamPlayerIds.has(player.id))
                    );
                    return (
                      <tr key={key}>
                        <td>{division?.name || "Division"}</td>
                        <td>
                          {entry.label} &middot; {currentPlayer?.display_name || "Player"}
                        </td>
                        <td>
                          <select
                            disabled={savingKey === key}
                            onChange={(event) => setReplacementByEntry((current) => ({ ...current, [key]: event.target.value }))}
                            value={replacementByEntry[key] || member.player_id}
                          >
                            {options.map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.display_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            className="button secondary small"
                            disabled={savingKey === key || !replacementByEntry[key] || replacementByEntry[key] === member.player_id}
                            onClick={() => entry.team_id && replaceDoubles(entry.team_id, member.player_id, replacementByEntry[key])}
                            type="button"
                          >
                            {savingKey === key ? "Saving..." : "Replace"}
                          </button>
                        </td>
                      </tr>
                    );
                  });
                }

                return null;
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
