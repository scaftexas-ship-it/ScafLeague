import Link from "next/link";
import { CalendarPlus, ClipboardList, Medal, UsersRound } from "lucide-react";

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">SCAF League</p>
          <h1>Tournament dashboard</h1>
          <p className="hero-copy">
            Mobile tournament operations for weekly round robin play, division standings, player registration, score posting, and forfeit handling. Create your first tournament from the admin workspace.
          </p>
          <div className="toolbar">
            <Link className="button" href="/admin">
              <CalendarPlus size={18} aria-hidden />
              Admin workspace
            </Link>
            <Link className="button secondary" href="/player">
              <ClipboardList size={18} aria-hidden />
              My matches
            </Link>
          </div>
        </div>
        <div className="grid two">
          <div className="card metric">
            <span className="pill">Setup</span>
            <strong>0</strong>
            <p className="subtle">Active divisions</p>
          </div>
          <div className="card metric">
            <span className="pill blue">Round robin</span>
            <strong>0</strong>
            <p className="subtle">Matches will appear after scheduling</p>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <div className="section-title">
            <h2>All Games</h2>
            <span className="pill orange">weekly windows</span>
          </div>
          <EmptyState
            icon={<ClipboardList size={24} aria-hidden />}
            title="No matches scheduled"
            body="Once an admin creates divisions, adds entries, and generates a schedule, tournament games will appear here."
          />
        </div>

        <div className="card">
          <div className="section-title">
            <h2>Leaderboards</h2>
            <Medal size={22} aria-hidden />
          </div>
          <EmptyState
            icon={<Medal size={24} aria-hidden />}
            title="No standings yet"
            body="Leaderboards are calculated from posted match results and forfeits."
          />
        </div>
      </section>

      <section className="grid three" style={{ marginTop: 14 }}>
        <div className="card">
          <UsersRound size={24} aria-hidden />
          <h3>Player registration</h3>
          <p className="subtle">Players request divisions and admins approve before scheduling.</p>
        </div>
        <div className="card">
          <ClipboardList size={24} aria-hidden />
          <h3>Score rules</h3>
          <p className="subtle">Wins earn 4 points. Played losses earn 1 point plus a set-win bonus.</p>
        </div>
        <div className="card">
          <CalendarPlus size={24} aria-hidden />
          <h3>Schedule windows</h3>
          <p className="subtle">Each match has one schedule week followed by one extension week.</p>
        </div>
      </section>
    </main>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p className="subtle">{body}</p>
    </div>
  );
}
