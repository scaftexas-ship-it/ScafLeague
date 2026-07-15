"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, LogOut, ShieldCheck, Trophy, UserRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { UserRole } from "@/lib/types";

type RoleRow = {
  role: UserRole;
  access_disabled: boolean;
};

export function AppHeader() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [role, setRole] = useState<UserRole | null>(null);
  const [checked, setChecked] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    void loadRole();
    void loadLogo();
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

  async function loadLogo() {
    if (!supabase) return;
    const { data } = await supabase.from("clubs").select("logo_url").limit(1).maybeSingle();
    setLogoUrl((data as { logo_url: string | null } | null)?.logo_url || null);
  }

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

    const { data, error } = (await supabase.from("users").select("role, access_disabled").eq("id", authData.user.id).maybeSingle()) as {
      data: RoleRow | null;
      error: { message?: string } | null;
    };

    setRole(error || data?.access_disabled ? null : data?.role || null);
    setChecked(true);
  }

  async function signOut() {
    if (!supabase) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    setRole(null);
    setSigningOut(false);
    router.replace("/login");
  }

  return (
    <header className="topbar">
      <Link className="brand" href="/">
        {logoUrl ? <img alt="" className="brand-logo" src={logoUrl} /> : <Trophy size={22} aria-hidden />}
        <span>SCAF League</span>
      </Link>
      <nav className="nav-actions" aria-label="Primary">
        {checked && role === "admin" ? (
          <Link className="icon-link" href="/admin" aria-label="Admin">
            <ShieldCheck size={20} />
          </Link>
        ) : null}
        {checked && role ? (
          <Link className="icon-link" href="/player" aria-label="Player matches">
            <UserRound size={20} />
          </Link>
        ) : null}
        {checked && role ? (
          <button className="icon-link" disabled={signingOut} onClick={signOut} aria-label="Sign out" type="button">
            <LogOut size={20} />
          </button>
        ) : (
          <Link className="icon-link" href="/login" aria-label="Login">
            <CalendarDays size={20} />
          </Link>
        )}
      </nav>
    </header>
  );
}
