import type { AdminData } from "./use-admin-data";

export function SettingsPane({ admin }: { admin: AdminData }) {
  return (
    <div className="grid two">
      <div className="card stack">
        <div className="section-title">
          <h2>App Settings</h2>
        </div>
        <div className="stack">
          <div className="spread">
            <span className="subtle">Admin</span>
            <strong>{admin.adminUser?.full_name}</strong>
          </div>
          <div className="spread">
            <span className="subtle">Login email</span>
            <strong>{admin.adminUser?.email}</strong>
          </div>
          <div className="spread">
            <span className="subtle">Tournaments</span>
            <strong>{admin.tournaments.length}</strong>
          </div>
          <div className="spread">
            <span className="subtle">Players</span>
            <strong>{admin.players.length}</strong>
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="section-title">
          <h2>Import Setup</h2>
        </div>
        {admin.serviceRoleConfigured === null ? (
          <p className="subtle">Checking whether bulk login creation is enabled...</p>
        ) : admin.serviceRoleConfigured ? (
          <p className="status-banner" data-tone="success">
            SUPABASE_SERVICE_ROLE_KEY is configured. Invited users and bulk imports can create real logins.
          </p>
        ) : (
          <p className="status-banner" data-tone="error">
            Add SUPABASE_SERVICE_ROLE_KEY to your deployment's environment variables to let the People tab create logins. Until then,
            invites and imports will only create player profiles.
          </p>
        )}
      </div>
    </div>
  );
}
