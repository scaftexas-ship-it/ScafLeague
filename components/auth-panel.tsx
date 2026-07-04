"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck, UserRound } from "lucide-react";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

type AppUser = {
  id: string;
  role: "admin" | "player";
  full_name: string;
  email: string;
  access_disabled?: boolean | null;
};

export function AuthPanel() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
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
    let { data, error } = (await supabase.from("users").select("id, role, full_name, email, access_disabled").eq("id", userId).maybeSingle()) as {
      data: AppUser | null;
      error: { message?: string } | null;
    };

    if (error && isMissingAccessDisabledColumn(error)) {
      const fallback = await supabase.from("users").select("id, role, full_name, email").eq("id", userId).maybeSingle();
      data = fallback.data as AppUser | null;
      error = fallback.error;
    }

    if (error || !data) {
      await supabase.auth.signOut();
      setMessage("This login is not registered for SCAF League. Ask an admin to add your user account first.");
      setCurrentUser(null);
      return null;
    }

    if ((data as AppUser).access_disabled) {
      await supabase.auth.signOut();
      setMessage("This login has been disabled by an admin.");
      setCurrentUser(null);
      return null;
    }

    return data as AppUser;
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

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCurrentUser(null);
    setPassword("");
    setMessage("Signed out.");
  }

  return (
    <div className="card form-grid">
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
          autoComplete="current-password"
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
        ) : (
          <button className="button" disabled={checking || signingIn || !email || !password} onClick={signIn} type="button">
            <LogIn size={18} aria-hidden />
            {signingIn ? "Signing in..." : "Sign in"}
          </button>
        )}
      </div>
      <p className="subtle">Only users already added by an admin can access the league.</p>
      {message ? <p className="subtle">{message}</p> : null}
    </div>
  );
}

function isMissingAccessDisabledColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  return message.includes("access_disabled") || message.includes("schema cache");
}
