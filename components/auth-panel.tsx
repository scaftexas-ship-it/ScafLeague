"use client";

import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

export function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(hasSupabaseConfig() ? "" : "Add Supabase credentials to enable live sign-in.");
  const supabase = createSupabaseBrowserClient();

  async function signIn() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? error.message : "Signed in successfully.");
  }

  async function signUp() {
    if (!supabase) return;
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : "Account created. Check email settings in Supabase if confirmation is enabled.");
  }

  return (
    <div className="card form-grid">
      <label className="field">
        <span>Email</span>
        <input autoComplete="email" inputMode="email" onChange={(event) => setEmail(event.target.value)} value={email} />
      </label>
      <label className="field">
        <span>Password</span>
        <input autoComplete="current-password" minLength={6} onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
      </label>
      <div className="toolbar">
        <button className="button" onClick={signIn} type="button">
          <LogIn size={18} aria-hidden />
          Sign in
        </button>
        <button className="button secondary" onClick={signUp} type="button">
          <UserPlus size={18} aria-hidden />
          Create account
        </button>
      </div>
      {message ? <p className="subtle">{message}</p> : null}
    </div>
  );
}
