"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, Footprints, Settings, ShieldCheck, Trophy, Users } from "lucide-react";
import { StatusBanner } from "@/components/ui/status-banner";
import { useAdminData } from "./use-admin-data";
import { TournamentsPane } from "./tournaments-pane";
import { PeoplePane } from "./people-pane";
import { MatchManagementPane } from "./match-management-pane";
import { TeamsPane } from "./teams-pane";
import { SettingsPane } from "./settings-pane";
import { WalkathonPane } from "./walkathon-pane";

type AdminSection = "tournaments" | "players" | "admin" | "teams" | "walkathon" | "settings";

const SECTIONS: Array<{ id: AdminSection; label: string; title: string; description: string; icon: typeof Trophy }> = [
  { id: "tournaments", label: "Tournaments", title: "Tournaments & Schedules", description: "Create tournaments and build weekly schedules.", icon: Trophy },
  { id: "players", label: "People", title: "People", description: "Add players and admins, and manage login access.", icon: Users },
  { id: "admin", label: "Matches", title: "Match Management", description: "Review and correct every scheduled match.", icon: ClipboardList },
  { id: "teams", label: "Teams", title: "Teams", description: "Manage fixed doubles teams.", icon: ShieldCheck },
  { id: "walkathon", label: "Walkathon", title: "Walkathon", description: "Register walkers and track step totals.", icon: Footprints },
  { id: "settings", label: "Settings", title: "Settings", description: "Club details and import configuration.", icon: Settings }
];

export function AdminWorkspace() {
  const admin = useAdminData();
  const [activeSection, setActiveSection] = useState<AdminSection>("players");

  if (admin.loading || !admin.adminUser) {
    return (
      <section className="hero">
        <div>
          <p className="eyebrow">Admin access required</p>
          <h1>SCAF League control center</h1>
          <p className="hero-copy">
            Admin-only features live here: tournaments, schedules, people, match corrections, and club settings. Sign in with an admin
            account to continue.
          </p>
          <div className="toolbar">
            <Link className="button" href="/login">
              Open login
            </Link>
            <Link className="button secondary" href="/player">
              My matches
            </Link>
          </div>
        </div>
        <div className="card">
          <StatusBanner testId="admin-status" message={admin.loading ? "Checking admin access..." : admin.message} />
        </div>
      </section>
    );
  }

  const active = SECTIONS.find((section) => section.id === activeSection)!;

  return (
    <div className="stack">
      <div className="admin-header">
        <h1>{active.title}</h1>
        <p className="subtle">{active.description}</p>
      </div>

      <div className="admin-layout">
        <nav className="admin-sidebar" aria-label="Admin sections">
          {SECTIONS.map((section) => (
            <button
              aria-current={section.id === activeSection}
              className="admin-nav-item"
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              type="button"
            >
              <section.icon size={18} aria-hidden />
              {section.label}
            </button>
          ))}
        </nav>

        <div className="admin-content">
          <StatusBanner message={admin.message} tone="error" />
          {activeSection === "tournaments" ? <TournamentsPane admin={admin} /> : null}
          {activeSection === "players" ? <PeoplePane admin={admin} /> : null}
          {activeSection === "admin" ? <MatchManagementPane admin={admin} /> : null}
          {activeSection === "teams" ? <TeamsPane admin={admin} /> : null}
          {activeSection === "walkathon" ? <WalkathonPane admin={admin} /> : null}
          {activeSection === "settings" ? <SettingsPane admin={admin} /> : null}
        </div>
      </div>
    </div>
  );
}
