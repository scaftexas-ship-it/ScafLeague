"use client";

import { useState } from "react";
import { ClipboardX } from "lucide-react";
import { replaceMatchSets, updateMatch } from "@/lib/admin-data";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";
import { MatchEditor } from "./match-editor";
import type { MatchEditPatch } from "./match-editor";
import type { MatchRow } from "@/lib/admin-data";

export function MatchManagementPane({ admin }: { admin: AdminData }) {
  const [savingMatchId, setSavingMatchId] = useState("");
  const [message, setMessage] = useState("");

  async function saveMatch(match: MatchRow, sets: Array<{ setNumber: number; entryAScore: number; entryBScore: number }>, patch: MatchEditPatch) {
    if (!admin.supabase) return;
    setSavingMatchId(match.id);
    try {
      await replaceMatchSets(admin.supabase, match.id, sets);
      await updateMatch(admin.supabase, match.id, patch);
      await admin.reloadDivisions();
      setMessage("Match saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the match.");
    } finally {
      setSavingMatchId("");
    }
  }

  const sortedMatches = [...admin.matches].sort((a, b) => a.schedule_week_start.localeCompare(b.schedule_week_start) || a.round - b.round);

  return (
    <div className="card stack">
      <div className="section-title">
        <h2>Match Management</h2>
      </div>
      <StatusBanner message={message} />
      {sortedMatches.length > 0 ? (
        <div className="match-list">
          {sortedMatches.map((match) => {
            const division = admin.divisions.find((item) => item.id === match.division_id);
            const entryA = admin.divisionEntries.find((entry) => entry.id === match.entry_a_id);
            const entryB = admin.divisionEntries.find((entry) => entry.id === match.entry_b_id);
            const sets = admin.matchSets.filter((set) => set.match_id === match.id);
            return (
              <MatchEditor
                divisionName={division?.name || "Division"}
                entryA={entryA}
                entryB={entryB}
                key={match.id}
                match={match}
                onSave={saveMatch}
                saving={savingMatchId === match.id}
                sets={sets}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<ClipboardX size={24} aria-hidden />} title="No matches yet" body="Generate a schedule from the Tournaments tab first." />
      )}
    </div>
  );
}
