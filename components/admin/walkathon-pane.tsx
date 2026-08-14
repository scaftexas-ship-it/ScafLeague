"use client";

import { useEffect, useMemo, useState } from "react";
import { Footprints, Search, UserPlus, X } from "lucide-react";
import {
  createWalkathon,
  listParticipants,
  listStepEntries,
  listWalkathons,
  registerParticipants,
  removeParticipant,
  updateWalkathon
} from "@/lib/walkathon-data";
import type { WalkathonRow, WalkathonStepEntryRow } from "@/lib/walkathon-data";
import { buildLeaderboard, formatSteps, periodRange } from "@/lib/walkathon";
import type { StepPeriod } from "@/lib/walkathon";
import { todayIso } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";

/** Admin side of the walkathon: create one, register who is taking part, and watch the totals. */
export function WalkathonPane({ admin }: { admin: AdminData }) {
  const [walkathons, setWalkathons] = useState<WalkathonRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [entries, setEntries] = useState<WalkathonStepEntryRow[]>([]);
  const [period, setPeriod] = useState<StepPeriod>("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ name: "", startDate: todayIso(), endDate: todayIso() });
  const [editing, setEditing] = useState(false);

  const today = todayIso();
  const selected = walkathons.find((walkathon) => walkathon.id === selectedId);
  const playerName = (id: string) => admin.players.find((player) => player.id === id)?.display_name || "Player";

  useEffect(() => {
    void loadWalkathons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.adminUser?.club_id]);

  useEffect(() => {
    if (!selectedId) return;
    void reload(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function loadWalkathons() {
    if (!admin.supabase || !admin.adminUser?.club_id) return;
    try {
      const rows = await listWalkathons(admin.supabase, admin.adminUser.club_id);
      setWalkathons(rows);
      setSelectedId((current) => current || rows[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load walkathons.");
    }
  }

  async function reload(walkathonId: string) {
    if (!admin.supabase) return;
    try {
      const [people, steps] = await Promise.all([
        listParticipants(admin.supabase, walkathonId),
        listStepEntries(admin.supabase, walkathonId)
      ]);
      setParticipantIds(people.map((person) => person.player_id));
      setEntries(steps);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load this walkathon.");
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin.supabase || !admin.adminUser?.club_id) return;
    if (!form.name.trim()) {
      setMessage("Give the walkathon a name.");
      return;
    }
    if (form.endDate < form.startDate) {
      setMessage("The walkathon can't end before it starts.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (editing && selected) {
        await updateWalkathon(admin.supabase, selected.id, form);
        setMessage("Walkathon updated.");
      } else {
        const created = await createWalkathon(admin.supabase, { clubId: admin.adminUser.club_id, ...form });
        setSelectedId(created.id);
        setMessage("Walkathon created. Register players below so they can post steps.");
      }
      setEditing(false);
      await loadWalkathons();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the walkathon.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(playerId: string) {
    if (!admin.supabase || !selected) return;
    setBusy(true);
    try {
      await registerParticipants(admin.supabase, selected.id, [playerId]);
      await reload(selected.id);
      setMessage(`${playerName(playerId)} registered.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not register that player.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(playerId: string) {
    if (!admin.supabase || !selected) return;
    setBusy(true);
    try {
      await removeParticipant(admin.supabase, selected.id, playerId);
      await reload(selected.id);
      setMessage(`${playerName(playerId)} removed. Any steps they posted stay recorded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove that player.");
    } finally {
      setBusy(false);
    }
  }

  const { start, end } = useMemo(() => periodRange(period, today), [period, today]);
  const leaderboard = useMemo(() => buildLeaderboard(participantIds, entries, start, end), [participantIds, entries, start, end]);

  const query = search.trim().toLowerCase();
  const candidates = admin.players.filter(
    (player) => !participantIds.includes(player.id) && (!query || player.display_name.toLowerCase().includes(query))
  );

  return (
    <div className="card stack">
      <div className="section-title">
        <h2>Walkathon</h2>
        <Footprints size={22} aria-hidden />
      </div>
      <p className="subtle">
        Registered players log their own steps, daily or a week at a time. Only they can post under their name.
      </p>

      <StatusBanner message={message} />

      {walkathons.length > 0 ? (
        <div className="field-row">
          <label className="field">
            <span>Walkathon</span>
            <select onChange={(event) => setSelectedId(event.target.value)} value={selectedId}>
              {walkathons.map((walkathon) => (
                <option key={walkathon.id} value={walkathon.id}>
                  {walkathon.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button
              className="button secondary"
              onClick={() => {
                if (!selected) return;
                setEditing(true);
                setForm({ name: selected.name, startDate: selected.start_date, endDate: selected.end_date });
              }}
              type="button"
            >
              Edit dates
            </button>
          </div>
        </div>
      ) : null}

      <form className="stack" onSubmit={handleCreate}>
        <strong>{editing ? "Edit walkathon" : "New walkathon"}</strong>
        <label className="field">
          <span>Name</span>
          <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Starts</span>
            <input
              onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
              type="date"
              value={form.startDate}
            />
          </label>
          <label className="field">
            <span>Ends</span>
            <input
              onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
              type="date"
              value={form.endDate}
            />
          </label>
        </div>
        <div className="spread">
          <button className="button" disabled={busy} type="submit">
            {editing ? "Save changes" : "Create walkathon"}
          </button>
          {editing ? (
            <button className="link-button" onClick={() => setEditing(false)} type="button">
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {selected ? (
        <>
          <div className="section-title">
            <h3>Registered players ({participantIds.length})</h3>
          </div>
          {participantIds.length > 0 ? (
            <ul className="walkathon-entry-list">
              {participantIds.map((playerId) => (
                <li key={playerId}>
                  <span>{playerName(playerId)}</span>
                  <button className="link-button" disabled={busy} onClick={() => handleRemove(playerId)} type="button">
                    <X size={14} aria-hidden /> Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<UserPlus size={24} aria-hidden />} title="Nobody registered yet" body="Add players below so they can start posting steps." />
          )}

          <label className="field">
            <span>Add a player</span>
            <div className="input-with-icon">
              <Search size={16} aria-hidden />
              <input onChange={(event) => setSearch(event.target.value)} placeholder="Search players" value={search} />
            </div>
          </label>
          {query ? (
            <ul className="walkathon-entry-list">
              {candidates.slice(0, 12).map((player) => (
                <li key={player.id}>
                  <span>{player.display_name}</span>
                  <button className="link-button" disabled={busy} onClick={() => handleRegister(player.id)} type="button">
                    <UserPlus size={14} aria-hidden /> Register
                  </button>
                </li>
              ))}
              {candidates.length === 0 ? <li className="subtle">Everyone matching that is already registered.</li> : null}
            </ul>
          ) : null}

          <div className="section-title">
            <h3>Totals</h3>
          </div>
          <SegmentedControl
            ariaLabel="Leaderboard period"
            onChange={setPeriod}
            options={[
              { value: "week", label: "This week" },
              { value: "month", label: "This month" },
              { value: "all", label: "All time" }
            ]}
            value={period}
          />
          <div className="points-table-scroll" role="region" aria-label="Walkathon totals">
            <table className="points-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Player</th>
                  <th scope="col">Steps</th>
                  <th scope="col">Posts</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={row.playerId}>
                    <td>{row.rank}</td>
                    <th scope="row">{playerName(row.playerId)}</th>
                    <td>{formatSteps(row.steps)}</td>
                    <td>{row.entries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
