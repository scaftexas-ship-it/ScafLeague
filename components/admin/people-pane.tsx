"use client";

import { useRef, useState } from "react";
import { Ban, CheckCircle2 } from "lucide-react";
import { addPlayer, linkUserToPlayer, toggleUserAccess, updateUserRole } from "@/lib/admin-data";
import { isServiceRoleMissingError, parsePeopleImportFile, PeopleImportError } from "@/lib/people-import";
import type { UserRole } from "@/lib/types";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminData } from "./use-admin-data";

type PlayerProfileMode = "__new" | "" | string;

export function PeoplePane({ admin }: { admin: AdminData }) {
  const [inviteForm, setInviteForm] = useState({
    fullName: "",
    email: "",
    mobileNumber: "",
    password: "",
    role: "player" as UserRole,
    rating: "",
    playerProfileMode: "__new" as PlayerProfileMode
  });
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkForm, setLinkForm] = useState({ userId: "", playerProfileId: "" });
  const [linking, setLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState("");

  const [updatingUserId, setUpdatingUserId] = useState("");
  const [accessMessage, setAccessMessage] = useState("");

  async function inviteUser() {
    if (!admin.supabase || !admin.adminUser) return;
    if (!inviteForm.fullName.trim() || !inviteForm.email.trim()) {
      setInviteMessage("Enter the person's name and email.");
      return;
    }
    if (inviteForm.password && inviteForm.password.length < 6) {
      setInviteMessage("Passwords must be at least 6 characters, or leave it blank to send an email invite.");
      return;
    }

    setInviting(true);
    setInviteMessage("");
    try {
      const { data: sessionData } = await admin.supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setInviteMessage("Your session expired. Sign in again.");
        return;
      }

      const response = await fetch("/api/admin/users/invite/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: inviteForm.email,
          fullName: inviteForm.fullName,
          password: inviteForm.password || undefined,
          role: inviteForm.role,
          mobileNumber: inviteForm.mobileNumber,
          rating: inviteForm.rating,
          createPlayerProfile: inviteForm.role === "player" && inviteForm.playerProfileMode === "__new",
          playerProfileId: inviteForm.playerProfileMode !== "__new" && inviteForm.playerProfileMode ? inviteForm.playerProfileMode : undefined
        })
      });
      const result = await response.json();
      if (!response.ok) {
        setInviteMessage(result.error || "Could not invite the user.");
        return;
      }

      await Promise.all([admin.reloadAppUsers(), admin.reloadPlayers()]);
      setInviteForm({ fullName: "", email: "", mobileNumber: "", password: "", role: "player", rating: "", playerProfileMode: "__new" });
      setInviteMessage(inviteForm.password ? "Login created." : "Invite sent.");
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : "Could not invite the user.");
    } finally {
      setInviting(false);
    }
  }

  async function importPeople(file: File) {
    if (!admin.supabase || !admin.adminUser) return;
    setImporting(true);
    setImportMessage("Importing...");

    try {
      const rows = await parsePeopleImportFile(file);
      const { data: sessionData } = await admin.supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setImportMessage("Your session expired. Sign in again.");
        return;
      }

      let imported = 0;
      let profilesOnly = 0;
      let failed = 0;

      for (const row of rows) {
        const response = await fetch("/api/admin/users/invite/", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            email: row.email,
            fullName: row.fullName,
            password: row.password,
            role: row.role,
            mobileNumber: row.mobileNumber,
            rating: row.rating,
            createPlayerProfile: row.createPlayerProfile
          })
        });

        if (response.ok) {
          imported += 1;
          continue;
        }

        const result = await response.json().catch(() => ({ error: "" }));
        if (response.status === 501 && isServiceRoleMissingError(result.error) && row.role === "player" && row.createPlayerProfile) {
          try {
            await addPlayer(admin.supabase, {
              clubId: admin.adminUser.club_id,
              displayName: row.fullName,
              mobileNumber: row.mobileNumber || "",
              rating: row.rating || ""
            });
            profilesOnly += 1;
          } catch {
            failed += 1;
          }
          continue;
        }

        failed += 1;
      }

      await Promise.all([admin.reloadAppUsers(), admin.reloadPlayers()]);

      if (profilesOnly > 0) {
        setImportMessage(`${imported + profilesOnly} of ${rows.length} imported. ${profilesOnly} were player profiles only (logins skipped: SUPABASE_SERVICE_ROLE_KEY isn't configured).`);
      } else if (failed > 0) {
        setImportMessage(`${imported} of ${rows.length} imported. ${failed} had errors.`);
      } else {
        setImportMessage(`Imported ${imported} people.`);
      }
    } catch (error) {
      setImportMessage(error instanceof PeopleImportError ? error.message : error instanceof Error ? error.message : "Could not import the file.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function linkUser() {
    if (!admin.supabase || !admin.adminUser) return;
    if (!linkForm.userId || !linkForm.playerProfileId) {
      setLinkMessage("Choose a user login and a player profile.");
      return;
    }
    setLinking(true);
    try {
      await linkUserToPlayer(admin.supabase, { userId: linkForm.userId, playerProfileId: linkForm.playerProfileId, clubId: admin.adminUser.club_id });
      await admin.reloadPlayers();
      setLinkForm({ userId: "", playerProfileId: "" });
      setLinkMessage("Profile linked.");
    } catch (error) {
      setLinkMessage(error instanceof Error ? error.message : "Could not link the profile.");
    } finally {
      setLinking(false);
    }
  }

  async function changeRole(userId: string, role: UserRole) {
    if (!admin.supabase || !admin.adminUser) return;
    if (userId === admin.adminUser.id && role !== "admin") {
      setAccessMessage("You can't remove your own admin role.");
      return;
    }
    setUpdatingUserId(userId);
    try {
      await updateUserRole(admin.supabase, userId, role);
      await admin.reloadAppUsers();
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : "Could not update the role.");
    } finally {
      setUpdatingUserId("");
    }
  }

  async function toggleAccess(userId: string, currentlyDisabled: boolean) {
    if (!admin.supabase || !admin.adminUser) return;
    if (userId === admin.adminUser.id && !currentlyDisabled) {
      setAccessMessage("You can't disable your own account.");
      return;
    }
    setUpdatingUserId(userId);
    try {
      await toggleUserAccess(admin.supabase, userId, !currentlyDisabled);
      await admin.reloadAppUsers();
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : "Could not update account access.");
    } finally {
      setUpdatingUserId("");
    }
  }

  const playerLoginUsers = admin.appUsers.filter((user) => user.role === "player");

  return (
    <div className="stack">
      <div className="grid two">
        <div className="card stack">
          <div className="section-title">
            <h2>Add User And Player</h2>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Full name</span>
              <input onChange={(event) => setInviteForm((current) => ({ ...current, fullName: event.target.value }))} value={inviteForm.fullName} />
            </label>
            <label className="field">
              <span>Email</span>
              <input inputMode="email" onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} value={inviteForm.email} />
            </label>
            <label className="field">
              <span>Mobile number</span>
              <input
                inputMode="tel"
                onChange={(event) => setInviteForm((current) => ({ ...current, mobileNumber: event.target.value }))}
                placeholder="15551234567"
                value={inviteForm.mobileNumber}
              />
            </label>
            <label className="field">
              <span>Temporary password</span>
              <input
                minLength={6}
                onChange={(event) => setInviteForm((current) => ({ ...current, password: event.target.value }))}
                type="password"
                value={inviteForm.password}
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value as UserRole }))} value={inviteForm.role}>
                <option value="player">Player</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="field">
              <span>Rating</span>
              <input
                disabled={inviteForm.role !== "player"}
                onChange={(event) => setInviteForm((current) => ({ ...current, rating: event.target.value }))}
                value={inviteForm.rating}
              />
            </label>
            <label className="field">
              <span>Player profile</span>
              <select
                disabled={inviteForm.role !== "player"}
                onChange={(event) => setInviteForm((current) => ({ ...current, playerProfileMode: event.target.value }))}
                value={inviteForm.playerProfileMode}
              >
                <option value="__new">Create new player profile</option>
                <option value="">No player profile</option>
                {admin.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.display_name}
                    {player.user_id ? " (already linked)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <StatusBanner message={inviteMessage} />
            <button className="button" disabled={inviting} onClick={inviteUser} type="button">
              {inviting ? "Saving..." : inviteForm.password ? "Create login" : "Send invite"}
            </button>
            <p className="subtle">Leave password blank to send an email invite. Creating logins requires SUPABASE_SERVICE_ROLE_KEY in .env.local.</p>
          </div>
        </div>

        <div className="card stack">
          <div className="section-title">
            <h2>Upload People</h2>
          </div>
          <div className="toolbar">
            <a className="button secondary small" href="/api/templates/player-import/xlsx/">
              Download Excel template
            </a>
            <a className="button secondary small" href="/api/templates/player-import/csv/">
              Download CSV template
            </a>
          </div>
          <label className="field">
            <span>Import file</span>
            <input
              accept=".csv,.tsv,.txt,.xls,.xlsx"
              disabled={importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importPeople(file);
              }}
              ref={fileInputRef}
              type="file"
            />
          </label>
          <p className="subtle">
            Upload CSV, TSV, XLS, or XLSX with columns: full_name, email, mobile_number, role, password, rating, create_player_profile. Without
            SUPABASE_SERVICE_ROLE_KEY, player profiles import but login accounts are skipped.
          </p>
          <StatusBanner message={importMessage} />

          <div className="section-title">
            <h2>Link Existing Login</h2>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>User login</span>
              <select onChange={(event) => setLinkForm((current) => ({ ...current, userId: event.target.value }))} value={linkForm.userId}>
                <option value="">Select a login</option>
                {playerLoginUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.email})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Player profile</span>
              <select onChange={(event) => setLinkForm((current) => ({ ...current, playerProfileId: event.target.value }))} value={linkForm.playerProfileId}>
                <option value="">Select a profile</option>
                {admin.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.display_name}
                    {player.user_id ? " (linked)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <StatusBanner message={linkMessage} />
            <button className="button secondary" disabled={linking} onClick={linkUser} type="button">
              Link profile
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h2>User Access</h2>
        </div>
        <StatusBanner message={accessMessage} />
        {admin.appUsers.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Linked player</th>
                  <th>Role</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {admin.appUsers.map((user) => {
                  const linkedPlayer = admin.players.find((player) => player.user_id === user.id);
                  return (
                    <tr key={user.id}>
                      <td>{user.full_name}</td>
                      <td>{user.email}</td>
                      <td>
                        {linkedPlayer ? (
                          <>
                            {linkedPlayer.display_name}
                            {linkedPlayer.mobile_number ? <span className="subtle"> · {linkedPlayer.mobile_number}</span> : null}
                          </>
                        ) : (
                          <span className="subtle">No linked player profile</span>
                        )}
                      </td>
                      <td>
                        <select disabled={updatingUserId === user.id} onChange={(event) => changeRole(user.id, event.target.value as UserRole)} value={user.role}>
                          <option value="player">Player</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="button secondary small"
                          disabled={updatingUserId === user.id}
                          onClick={() => toggleAccess(user.id, user.access_disabled)}
                          type="button"
                        >
                          {user.access_disabled ? <CheckCircle2 size={14} aria-hidden /> : <Ban size={14} aria-hidden />}
                          {user.access_disabled ? "Enable" : "Disable"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Ban size={24} aria-hidden />} title="No app users" body="Invite your first user above." />
        )}
      </div>
    </div>
  );
}
