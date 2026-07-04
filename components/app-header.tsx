"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ShieldCheck, Trophy, UserRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type UserRole = "admin" | "player";
type RoleRow = {
  role?: UserRole;
  access_disabled?: boolean | null;
};

export function AppHeader() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [role, setRole] = useState<UserRole | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void loadRole();
    const {
      data: { subscription }
    } = supabase?.auth.onAuthStateChange(() => {
      void loadRole();
    }) || { data: { subscription: undefined } };

    return () => {
      subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRole() {
    if (!supabase) {
      setChecked(true);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setRole(null);
      setChecked(true);
      return;
    }

    let { data, error } = (await supabase.from("users").select("role, access_disabled").eq("id", authData.user.id).maybeSingle()) as {
      data: RoleRow | null;
      error: { message?: string } | null;
    };
    if (error && isMissingAccessDisabledColumn(error)) {
      const fallback = await supabase.from("users").select("role").eq("id", authData.user.id).maybeSingle();
      data = fallback.data as RoleRow | null;
      error = fallback.error;
    }

    setRole(error || data?.access_disabled ? null : data?.role || null);
    setChecked(true);
  }

  return (
    <header className="topbar">
      <Link className="brand" href="/">
        <Trophy size={24} aria-hidden />
        <span>SCAF League</span>
      </Link>
      <nav className="nav-actions" aria-label="Primary">
        {checked && role === "admin" ? (
          <Link href="/admin" aria-label="Admin">
            <ShieldCheck size={20} />
          </Link>
        ) : null}
        {checked && role ? (
          <Link href="/player" aria-label="Player matches">
            <UserRound size={20} />
          </Link>
        ) : null}
        <Link href="/login" aria-label="Login">
          <CalendarDays size={20} />
        </Link>
      </nav>
    </header>
  );
}

function isMissingAccessDisabledColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  return message.includes("access_disabled") || message.includes("schema cache");
}
