"use client";

import { useEffect, useMemo, useState } from "react";
import { Gauge, Search } from "lucide-react";
import { loadPickleballRatingInput } from "@/lib/pickleball-rating-data";
import { PROVISIONAL_MATCHES, buildRatingRows, formatRating } from "@/lib/pickleball-rating";
import type { PlayerRating, RatingInput } from "@/lib/pickleball-rating";
import type { PlayerProfileRow } from "@/lib/admin-data";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBanner } from "@/components/ui/status-banner";

type SortKey = "singles" | "doubles";

/** One player's rating cell: the number, whether it is provisional, and their record. */
function RatingCell({ rating }: { rating?: PlayerRating }) {
  if (!rating) return <span className="subtle">&mdash;</span>;
  return (
    <span className="rating-cell">
      <strong>{formatRating(rating.rating)}</strong>
      {rating.provisional ? <span className="pill">provisional</span> : null}
      <span className="subtle">
        {rating.wins}-{rating.losses}
      </span>
    </span>
  );
}

/**
 * Club pickleball ratings, singles and doubles side by side.
 *
 * Computed from results on every load rather than stored: correcting a score
 * re-derives the ratings that followed it, where a stored number would quietly
 * keep the old answer.
 */
export function RatingPanel({
  clubId,
  highlightPlayerIds = [],
  players,
  supabase
}: {
  clubId: string;
  highlightPlayerIds?: string[];
  players: PlayerProfileRow[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const [input, setInput] = useState<RatingInput | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("singles");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!supabase || !clubId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadPickleballRatingInput(supabase, clubId);
        if (!cancelled) setInput(loaded);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not load ratings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, clubId]);

  const rows = useMemo(() => (input ? buildRatingRows(players, input) : []), [players, input]);

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const filtered = query ? rows.filter((row) => row.player.display_name.toLowerCase().includes(query)) : rows;
    return [...filtered].sort((a, b) => {
      const value = (row: typeof a) => (sortBy === "singles" ? row.singles?.rating : row.doubles?.rating);
      // Players with no rating in the chosen format sort last rather than as zero.
      const av = value(a);
      const bv = value(b);
      if (av === undefined && bv === undefined) return a.player.display_name.localeCompare(b.player.display_name);
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return bv - av || a.player.display_name.localeCompare(b.player.display_name);
    });
  }, [rows, query, sortBy]);

  if (loading) {
    return (
      <div className="card">
        <p className="subtle">Working out ratings...</p>
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="section-title">
        <h2>Pickleball Ratings</h2>
        <Gauge size={22} aria-hidden />
      </div>
      <p className="subtle">
        A club rating on the same 2&ndash;8 scale DUPR uses, worked out from results posted here. It is not a DUPR rating and counts only
        inside this league. Point margins count, not just wins, and beating a stronger opponent is worth more.
      </p>

      <StatusBanner message={message} />

      {rows.length === 0 ? (
        <EmptyState icon={<Gauge size={24} aria-hidden />} title="No ratings yet" body="Ratings appear once pickleball scores are posted." />
      ) : (
        <>
          <div className="field-row">
            <label className="field">
              <span>Order by</span>
              <SegmentedControl
                ariaLabel="Order ratings by"
                onChange={setSortBy}
                options={[
                  { value: "singles", label: "Singles" },
                  { value: "doubles", label: "Doubles" }
                ]}
                value={sortBy}
              />
            </label>
            <label className="field">
              <span>Find a player</span>
              <div className="input-with-icon">
                <Search size={16} aria-hidden />
                <input onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" value={search} />
              </div>
            </label>
          </div>

          <div className="points-table-scroll" role="region" aria-label="Pickleball ratings">
            <table className="points-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Player</th>
                  <th scope="col">Singles</th>
                  <th scope="col">Doubles</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <tr key={row.player.id} data-me={highlightPlayerIds.includes(row.player.id) ? "true" : undefined}>
                    <td>{index + 1}</td>
                    <th scope="row">{row.player.display_name}</th>
                    <td>
                      <RatingCell rating={row.singles} />
                    </td>
                    <td>
                      <RatingCell rating={row.doubles} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visible.length === 0 ? <p className="subtle">Nobody matches that search.</p> : null}

          <p className="subtle">
            Everyone starts at 3.500. A rating stays <strong>provisional</strong> until {PROVISIONAL_MATCHES} matches back it up, and moves
            further per match until then. Singles and doubles are rated separately.
          </p>
        </>
      )}
    </div>
  );
}
