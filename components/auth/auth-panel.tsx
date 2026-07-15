"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { claimPlayerProfileIfEligible } from "@/lib/admin-data";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";
import { StatusBanner } from "@/components/ui/status-banner";
import type { UserRole } from "@/lib/types";

type AppUser = {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  access_disabled: boolean;
};

export function AuthPanel() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(hasSupabaseConfig() ? "" : "Add Supabase credentials to enable live sign-in.");
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  useEffect(() => {
    void checkExistingSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkExistingSession() {
    if (!supabase) {
      setChecking(false);
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setChecking(false);
      return;
    }

    const registeredUser = await getRegisteredUser(data.user.id);
    setChecking(false);
    if (!registeredUser) return;
    setCurrentUser(registeredUser);
    setMessage(`Signed in as ${registeredUser.full_name}.`);
  }

  async function getRegisteredUser(userId: string) {
    if (!supabase) return null;
    const { data: initial, error } = (await supabase.from("users").select("id, role, full_name, email, access_disabled").eq("id", userId).maybeSingle()) as {
      data: AppUser | null;
      error: { message?: string } | null;
    };

    // No public.users row yet -- try auto-claiming a player profile an admin
    // already added under this same email before giving up.
    const data = !error && !initial ? await claimPlayerProfileIfEligible(supabase) : initial;

    if (error || !data) {
      await supabase.auth.signOut();
      setMessage("This login is not registered for SCAF League. Ask an admin to add your user account first.");
      setCurrentUser(null);
      return null;
    }

    if (data.access_disabled) {
      await supabase.auth.signOut();
      setMessage("This login has been disabled by an admin.");
      setCurrentUser(null);
      return null;
    }

    return data;
  }

  function openRoleHome(user: AppUser) {
    router.replace(user.role === "admin" ? "/admin" : "/player");
  }

  async function signIn() {
    if (!supabase) return;
    setSigningIn(true);
    setMessage("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error || !data.user) {
      setSigningIn(false);
      setMessage(error?.message || "Could not sign in.");
      return;
    }

    const registeredUser = await getRegisteredUser(data.user.id);
    setSigningIn(false);
    if (!registeredUser) return;

    setCurrentUser(registeredUser);
    setMessage(`Signed in as ${registeredUser.full_name}.`);
    openRoleHome(registeredUser);
  }

  async function signUp() {
    if (!supabase) return;
    setSigningIn(true);
    setMessage("");
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });

    if (error) {
      setSigningIn(false);
      setMessage(error.message);
      return;
    }

    setPassword("");

    // If email confirmation is off, we already have a session -- try to
    // activate them immediately instead of sending them back to sign in.
    if (data.session && data.user) {
      const registeredUser = await getRegisteredUser(data.user.id);
      setSigningIn(false);
      if (registeredUser) {
        setMode("signin");
        setCurrentUser(registeredUser);
        setMessage(`Signed in as ${registeredUser.full_name}.`);
        openRoleHome(registeredUser);
        return;
      }
      setMode("signin");
      return;
    }

    setSigningIn(false);
    setMode("signin");
    setMessage("Account created. Check your email to confirm it, then ask an admin to add your account before you can access the league.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCurrentUser(null);
    setPassword("");
    setMessage("Signed out.");
  }

  return (
    <div className="form-grid">
      {currentUser ? (
        <div className="section-title">
          <div>
            <h2>{currentUser.full_name}</h2>
            <p className="subtle">{currentUser.email}</p>
          </div>
          <span className="pill blue">{currentUser.role}</span>
        </div>
      ) : null}
      <label className="field">
        <span>Email</span>
        <input autoComplete="email" disabled={checking || Boolean(currentUser)} inputMode="email" onChange={(event) => setEmail(event.target.value)} value={email} />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          disabled={checking || Boolean(currentUser)}
          minLength={6}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </label>
      <div className="toolbar">
        {currentUser ? (
          <>
            <button className="button" onClick={() => openRoleHome(currentUser)} type="button">
              {currentUser.role === "admin" ? <ShieldCheck size={18} aria-hidden /> : <UserRound size={18} aria-hidden />}
              Open {currentUser.role === "admin" ? "admin" : "my matches"}
            </button>
            <button className="button secondary" onClick={signOut} type="button">
              Sign out
            </button>
          </>
        ) : mode === "signup" ? (
          <button className="button" disabled={checking || signingIn || !email || !password} onClick={signUp} type="button">
            <UserPlus size={18} aria-hidden />
            {signingIn ? "Creating account..." : "Create account"}
          </button>
        ) : (
          <button className="button" disabled={checking || signingIn || !email || !password} onClick={signIn} type="button">
            <LogIn size={18} aria-hidden />
            {signingIn ? "Signing in..." : "Sign in"}
          </button>
        )}
      </div>
      {currentUser ? null : (
        <button
          className="link-button"
          disabled={checking || signingIn}
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setMessage("");
          }}
          type="button"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      )}
      <p className="subtle">Only users already added by an admin can access the league.</p>
      <StatusBanner message={message} />
    </div>
  );
}
