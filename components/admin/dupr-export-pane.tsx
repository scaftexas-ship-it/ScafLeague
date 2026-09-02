"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { buildDuprCsv } from "@/lib/dupr-export";
import type { DuprKind } from "@/lib/dupr-export";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";

/**
 * Exports the selected pickleball tournament's results as the CSV DUPR takes
 * for bulk upload -- one file for singles, one for doubles, because DUPR
 * validates each against its own header.
 *
 * Admin-only by construction rather than by a check here: useAdminData refuses
 * anyone whose role is not admin, so this pane never renders for a player.
 */
export function DuprExportPane({ admin }: { admin: AdminData }) {
  const [message, setMessage] = useState("");

  const pickleballTournaments = admin.tournaments.filter((tournament) => tournament.sport === "pickleball");
  const selected = pickleballTournaments.find((tournament) => tournament.id === admin.selectedTournamentId);

  // The tournament choice is shared with the rest of the admin workspace, so
  // arriving here from a badminton or tennis pane leaves it pointing at a sport
  // DUPR does not take. Without this the dropdown showed a pickleball name
  // (nothing matched its value, so the browser drew the first option) while
  // the pane behaved as though nothing were chosen.
  useEffect(() => {
    if (!selected && pickleballTournaments.length > 0) {
      admin.setSelectedTournamentId(pickleballTournaments[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, pickleballTournaments.length]);

  const input = useMemo(
    () => ({
      matches: admin.matches,
      matchSets: admin.matchSets,
      entries: admin.divisionEntries,
      players: admin.players,
      teamMembers: admin.teamMembers
    }),
    [admin.matches, admin.matchSets, admin.divisionEntries, admin.players, admin.teamMembers]
  );

  const singles = useMemo(() => (selected ? buildDuprCsv("singles", input) : null), [selected, input]);
  const doubles = useMemo(() => (selected ? buildDuprCsv("doubles", input) : null), [selected, input]);

  function download(kind: DuprKind) {
    const built = kind === "singles" ? singles : doubles;
    if (!built || !selected) return;
    if (built.rowCount === 0) {
      setMessage(`No ${kind} results to export for ${selected.name} yet.`);
      return;
    }

    // Built in the browser: this app is a static export, so there is no server
    // to generate the file on.
    const blob = new Blob([built.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.name.replace(/[^A-Za-z0-9]+/g, "-")}-${kind}-DUPR.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setMessage(`Downloaded ${built.rowCount} ${kind} match${built.rowCount === 1 ? "" : "es"}.`);
  }

  if (pickleballTournaments.length === 0) {
    return (
      <div className="card">
        <div className="section-title">
          <h2>DUPR Export</h2>
          <FileSpreadsheet size={22} aria-hidden />
        </div>
        <EmptyState icon={<FileSpreadsheet size={24} aria-hidden />} title="No pickleball tournaments" body="DUPR only takes pickleball results." />
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="section-title">
        <h2>DUPR Export</h2>
        <FileSpreadsheet size={22} aria-hidden />
      </div>
      <p className="subtle">
        Match results in DUPR&apos;s bulk-upload format. Singles and doubles are separate files because DUPR validates each against its own
        column layout.
      </p>

      <label className="field">
        <span>Pickleball tournament</span>
        <select onChange={(event) => admin.setSelectedTournamentId(event.target.value)} value={admin.selectedTournamentId}>
          {pickleballTournaments.map((tournament) => (
            <option key={tournament.id} value={tournament.id}>
              {tournament.name}
            </option>
          ))}
        </select>
      </label>

      <StatusBanner message={message} />

      {!selected ? (
        <p className="subtle">Choose a pickleball tournament above.</p>
      ) : (
        <>
          <div className="toolbar">
            <button className="button" disabled={!singles?.rowCount} onClick={() => download("singles")} type="button">
              <Download size={16} aria-hidden />
              Singles CSV ({singles?.rowCount ?? 0})
            </button>
            <button className="button" disabled={!doubles?.rowCount} onClick={() => download("doubles")} type="button">
              <Download size={16} aria-hidden />
              Doubles CSV ({doubles?.rowCount ?? 0})
            </button>
          </div>

          {/* Named outright, because DUPR rejects a row whose id it cannot
              match and the admin would otherwise find out only on upload. */}
          {(singles?.missingDuprIds.length || doubles?.missingDuprIds.length) ? (
            <div className="stack">
              <strong>Players with no DUPR id</strong>
              <p className="subtle">
                Their rows go out with a name only, which DUPR may not match. Add the id in People &mdash; it is the six-character code, stored
                in the DUPR field.
              </p>
              <p className="subtle">
                {Array.from(new Set([...(singles?.missingDuprIds || []), ...(doubles?.missingDuprIds || [])])).sort().join(", ")}
              </p>
            </div>
          ) : null}

          {(singles?.skipped.length || doubles?.skipped.length) ? (
            <div className="stack">
              <strong>Not included</strong>
              <ul className="walkathon-entry-list">
                {[...(singles?.skipped || []), ...(doubles?.skipped || [])].map((item, index) => (
                  <li key={`${item.label}-${index}`}>
                    <span>{item.label}</span>
                    <span className="subtle">{item.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
