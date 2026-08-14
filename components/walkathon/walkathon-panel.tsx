"use client";

import { useEffect, useMemo, useState } from "react";
import { Footprints, Medal, Trash2 } from "lucide-react";
import {
  deleteStepEntry,
  listParticipants,
  listStepEntries,
  listWalkathons,
  postStepEntry
} from "@/lib/walkathon-data";
import type { WalkathonRow, WalkathonStepEntryRow } from "@/lib/walkathon-data";
import { buildLeaderboard, formatSteps, periodRange, totalSteps, weekStartIso } from "@/lib/walkathon";
import type { StepPeriod } from "@/lib/walkathon";
import { todayIso } from "@/lib/format";
import type { PlayerProfileRow } from "@/lib/admin-data";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBanner } from "@/components/ui/status-banner";

/**
 * The player's walkathon: log steps, see where you stand.
 *
 * `myPlayerIds` is a list rather than one id because a login can own more than
 * one profile in this club; only the ones actually registered can post, and
 * the database enforces that regardless of what this component renders.
 */
export function WalkathonPanel({
  myPlayerIds,
  players,
  supabase
}: {
  myPlayerIds: string[];
  players: PlayerProfileRow[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const [walkathons, setWalkathons] = useState<WalkathonRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [entries, setEntries] = useState<WalkathonStepEntryRow[]>([]);
  const [period, setPeriod] = useState<StepPeriod>("week");
  const [mode, setMode] = useState<"day" | "week">("day");
  const [stepsInput, setStepsInput] = useState("");
  const [dateInput, setDateInput] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const today = todayIso();
  const selected = walkathons.find((walkathon) => walkathon.id === selectedId);
  const myRegisteredId = myPlayerIds.find((id) => participantIds.includes(id)) || "";
  const playerName = (id: string) => players.find((player) => player.id === id)?.display_name || "Player";

  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return;
        const { data: appUser } = await supabase.from("users").select("club_id").eq("id", authData.user.id).maybeSingle();
        if (!appUser?.club_id) return;
        const rows = await listWalkathons(supabase, appUser.club_id);
        setWalkathons(rows);
        setSelectedId((current) => current || rows[0]?.id || "");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load walkathons.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !selectedId) return;
    void reload(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function reload(walkathonId: string) {
    try {
      const [people, steps] = await Promise.all([listParticipants(supabase, walkathonId), listStepEntries(supabase, walkathonId)]);
      setParticipantIds(people.map((person) => person.player_id));
      setEntries(steps);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load this walkathon.");
    }
  }

  const { start, end } = useMemo(() => periodRange(period, today), [period, today]);

  const leaderboard = useMemo(
    () => buildLeaderboard(participantIds, entries, start, end),
    [participantIds, entries, start, end]
  );

  const myEntries = entries.filter((entry) => entry.player_id === myRegisteredId);
  const myTotal = totalSteps(myEntries, start, end);
  const myRank = leaderboard.find((row) => row.playerId === myRegisteredId)?.rank;

  async function handlePost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const steps = Number(stepsInput);
    if (!Number.isFinite(steps) || steps < 0) {
      setMessage("Enter your step count as a whole number.");
      return;
    }
    if (!myRegisteredId || !selected) return;

    setSaving(true);
    try {
      await postStepEntry(supabase, {
        walkathonId: selected.id,
        playerId: myRegisteredId,
        // A weekly total is filed against the Monday of whichever week the
        // chosen date falls in, so it lands in exactly one week.
        entryDate: mode === "week" ? weekStartIso(dateInput) : dateInput,
        coversWeek: mode === "week",
        steps: Math.round(steps)
      });
      setStepsInput("");
      await reload(selected.id);
      setMessage(mode === "week" ? "Weekly steps saved." : "Steps saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save those steps.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    setMessage("");
    try {
      await deleteStepEntry(supabase, entryId);
      if (selected) await reload(selected.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove that entry.");
    }
  }

  if (loading) {
    return (
      <div className="card">
        <p className="subtle">Loading walkathon...</p>
      </div>
    );
  }

  if (walkathons.length === 0) {
    return (
      <div className="card">
        <div className="section-title">
          <h2>Walkathon</h2>
          <Footprints size={22} aria-hidden />
        </div>
        <EmptyState icon={<Footprints size={24} aria-hidden />} title="No walkathon yet" body="An admin has to create one before steps can be logged." />
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="section-title">
        <h2>Walkathon</h2>
        <Footprints size={22} aria-hidden />
      </div>

      {walkathons.length > 1 ? (
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
      ) : null}

      {selected ? (
        <p className="subtle">
          {selected.name} &middot; {selected.start_date} to {selected.end_date}
        </p>
      ) : null}

      <StatusBanner message={message} />

      {myRegisteredId ? (
        <form className="stack walkathon-logger" onSubmit={handlePost}>
          <div className="spread">
            <strong>Log your steps</strong>
            <SegmentedControl
              ariaLabel="Log steps for"
              onChange={setMode}
              options={[
                { value: "day", label: "A day" },
                { value: "week", label: "A week" }
              ]}
              value={mode}
            />
          </div>
          <div className="field-row">
            <label className="field">
              <span>{mode === "week" ? "Any date in that week" : "Date"}</span>
              <input
                max={selected?.end_date}
                min={selected?.start_date}
                onChange={(event) => setDateInput(event.target.value)}
                type="date"
                value={dateInput}
              />
            </label>
            <label className="field">
              <span>{mode === "week" ? "Steps that week" : "Steps that day"}</span>
              <input
                inputMode="numeric"
                min="0"
                onChange={(event) => setStepsInput(event.target.value)}
                placeholder="e.g. 8500"
                type="number"
                value={stepsInput}
              />
            </label>
          </div>
          {mode === "week" ? (
            <p className="subtle">Posting a week total for the week beginning {weekStartIso(dateInput)}.</p>
          ) : null}
          <button className="button" disabled={saving || stepsInput === ""} type="submit">
            {saving ? "Saving..." : "Save steps"}
          </button>
        </form>
      ) : (
        <p className="status-banner" data-tone="error">
          You are not registered for this walkathon yet. Ask an admin to add you and you will be able to post your steps.
        </p>
      )}

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

      {myRegisteredId ? (
        <div className="walkathon-mine">
          <span className="subtle">Your steps {period === "all" ? "overall" : period === "week" ? "this week" : "this month"}</span>
          <strong>{formatSteps(myTotal)}</strong>
          {myRank ? <span className="pill blue">Rank {myRank}</span> : null}
        </div>
      ) : null}

      <div className="points-table-scroll" role="region" aria-label="Walkathon leaderboard">
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
              <tr key={row.playerId} data-me={row.playerId === myRegisteredId ? "true" : undefined}>
                <td>{row.rank}</td>
                <th scope="row">{playerName(row.playerId)}</th>
                <td>{formatSteps(row.steps)}</td>
                <td>{row.entries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {leaderboard.length === 0 ? (
        <EmptyState icon={<Medal size={24} aria-hidden />} title="Nobody registered yet" body="An admin registers players for the walkathon." />
      ) : null}

      {myEntries.length > 0 ? (
        <div className="stack">
          <strong>Your posts</strong>
          <ul className="walkathon-entry-list">
            {myEntries.map((entry) => (
              <li key={entry.id}>
                <span>
                  {entry.covers_week ? `Week of ${entry.entry_date}` : entry.entry_date}
                  {entry.covers_week ? <span className="pill">weekly</span> : null}
                </span>
                <strong>{formatSteps(entry.steps)}</strong>
                <button aria-label={`Remove steps for ${entry.entry_date}`} className="link-button" onClick={() => handleDelete(entry.id)} type="button">
                  <Trash2 size={14} aria-hidden /> Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
