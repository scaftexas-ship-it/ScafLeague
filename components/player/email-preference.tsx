"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { setWeeklyEmailEnabled } from "@/lib/admin-data";

/**
 * The off switch for the weekly points email.
 *
 * Opt-OUT rather than opt-in: a player who has never heard of the email still
 * gets the first one, with this here to stop it. Every email links back to
 * this page for that reason.
 */
export function EmailPreference({
  playerId,
  supabase
}: {
  playerId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase || !playerId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("player_profiles").select("*").eq("id", playerId).maybeSingle();
      if (cancelled) return;
      // Missing column means the migration has not run yet -- default to on
      // rather than showing the switch in a state that is not real.
      if (error || !data) return;
      setEnabled(data.weekly_email_enabled !== false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, playerId]);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setSaving(true);
    setMessage("");
    try {
      await setWeeklyEmailEnabled(supabase, playerId, next);
      setEnabled(next);
      setMessage(next ? "You'll get the weekly email again." : "Weekly email turned off.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) return null;

  return (
    <div className="card email-preference">
      <div className="email-preference-copy">
        <span className="email-preference-title">
          <Mail size={16} aria-hidden />
          Weekly points email
        </span>
        <span className="subtle">
          A Monday summary of where you sit in your divisions and what you have coming up.
        </span>
        {message ? <span className="subtle">{message}</span> : null}
      </div>
      <label className="email-preference-switch">
        <input checked={enabled} disabled={saving} onChange={toggle} type="checkbox" />
        <span>{enabled ? "On" : "Off"}</span>
      </label>
    </div>
  );
}
