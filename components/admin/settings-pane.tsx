"use client";

import { useRef, useState } from "react";
import { uploadClubLogo } from "@/lib/admin-data";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";

export function SettingsPane({ admin }: { admin: AdminData }) {
  const [uploading, setUploading] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadLogo(file: File) {
    if (!admin.supabase || !admin.adminUser) return;
    setUploading(true);
    setLogoMessage("");
    try {
      await uploadClubLogo(admin.supabase, admin.adminUser.club_id, file);
      await admin.reloadClub();
      setLogoMessage("Logo updated.");
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "Could not upload the logo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

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
          <h2>Club Branding</h2>
        </div>
        <div className="spread">
          <span className="subtle">Logo</span>
          {admin.club?.logo_url ? (
            <img alt="Club logo" className="club-logo-preview" src={admin.club.logo_url} />
          ) : (
            <span className="subtle">No logo set</span>
          )}
        </div>
        <label className="field">
          <span>Upload a new logo</span>
          <input
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadLogo(file);
            }}
            ref={fileInputRef}
            type="file"
          />
        </label>
        <p className="subtle">PNG, JPG, SVG, or WebP, up to 2 MB. Shown in the header for every visitor, signed in or not.</p>
        <StatusBanner message={logoMessage} />
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
