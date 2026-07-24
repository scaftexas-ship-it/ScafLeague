"use client";

import { UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TeamCreator } from "./team-creator";
import type { AdminData } from "./use-admin-data";

export function TeamsPane({ admin }: { admin: AdminData }) {
  const rosterSizeByTeamId = new Map<string, number>();
  admin.teamMembers.forEach((member) => rosterSizeByTeamId.set(member.team_id, (rosterSizeByTeamId.get(member.team_id) || 0) + 1));

  return (
    <div className="grid two">
      <div className="card stack">
        <div className="section-title">
          <h2>Create Team</h2>
        </div>
        <TeamCreator admin={admin} />
      </div>

      <div className="card">
        <div className="section-title">
          <h2>Teams</h2>
        </div>
        {admin.teams.length > 0 ? (
          <div className="stack">
            {admin.teams.map((team) => {
              const rosterSize = rosterSizeByTeamId.get(team.id) || 0;
              return (
                <div className="spread" key={team.id}>
                  <strong>{team.name}</strong>
                  <span className="pill">{rosterSize === 2 ? "Fixed doubles" : rosterSize === 0 ? "Team only" : `${rosterSize} players`}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<UsersRound size={24} aria-hidden />} title="No teams yet" body="Create one from the form on the left." />
        )}
      </div>
    </div>
  );
}
