"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, LogIn, ShieldCheck, UserPlus, UserRound } from "lucide-react";
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
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [message, setMessage] = useState(hasSupabaseConfig() ? "" : "Add Supabase credentials to enable live sign-in.");
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  useEffect(() => {
    // Handed off from the home page: its own PASSWORD_RECOVERY listener
    // already fired (Supabase's reset-password links redirect to the site's
    // root URL, not necessarily here) and redirected us here with this flag,
    // since a plain existing-session check would otherwise just sign them in
    // and skip past the "set new password" step entirely.
    //
    // Supabase's PKCE redirect only appends "?code=..." here (the
    // "type=recovery" hint only exists on its intermediate verification URL,
    // not the final redirect) -- /login is only ever used as the redirectTo
    // for password resets in this app, so any "code" param landing here means
    // this is a recovery link.
    const isRecoveryLink =
      typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).has("code") || window.location.hash.includes("type=recovery"));

    if (isRecoveryLink || (typeof window !== "undefined" && sessionStorage.getItem("scaf-password-recovery") === "1")) {
      sessionStorage.removeItem("scaf-password-recovery");
      setMode("reset");
      setChecking(false);
      setMessage("Enter a new password.");
    } else {
      void checkExistingSession();
    }

    // Under Supabase's PKCE flow, completing a recovery link exchange fires
    // SIGNED_IN rather than PASSWORD_RECOVERY, so both events are handled the
    // same way here -- the isRecoveryLink check above is what actually
    // decides whether this is a password reset.
    const {
      data: { subscription }
    } = supabase?.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && isRecoveryLink)) {
        setMode("reset");
        setChecking(false);
        setMessage("Enter a new password.");
      }
    }) || { data: { subscription: undefined } };

    return () => subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkExistingSession() {
    if (!supabase) {
      setChecking(false);
      return;
    }

    // If this throws (a stale/corrupted stored session, a network blip),
    // checking must still be cleared -- otherwise every input on this form
    // stays disabled forever, since they're all disabled={checking}.
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      const registeredUser = await getRegisteredUser(data.user.id);
      if (!registeredUser) return;
      setCurrentUser(registeredUser);
      setMessage(`Signed in as ${registeredUser.full_name}.`);
    } catch {
      // No usable session -- fall through to a normal signed-out form.
    } finally {
      setChecking(false);
    }
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
    setConfirmPassword("");

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

  async function sendResetLink() {
    if (!supabase) return;
    setSigningIn(true);
    setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login/`
    });
    setSigningIn(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMode("signin");
    setMessage("If that email is registered, a password reset link has been sent.");
  }

  async function updatePassword() {
    if (!supabase) return;
    setSigningIn(true);
    setMessage("");
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });

    if (error || !data.user) {
      setSigningIn(false);
      setMessage(error?.message || "Could not update the password.");
      return;
    }

    setNewPassword("");
    setConfirmNewPassword("");
    const registeredUser = await getRegisteredUser(data.user.id);
    setSigningIn(false);
    setMode("signin");
    if (!registeredUser) return;

    setCurrentUser(registeredUser);
    setMessage(`Password updated. Signed in as ${registeredUser.full_name}.`);
    openRoleHome(registeredUser);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCurrentUser(null);
    setPassword("");
    setConfirmPassword("");
    setMessage("Signed out.");
  }

  const signupPasswordsMismatch = mode === "signup" && confirmPassword.length > 0 && password !== confirmPassword;
  const resetPasswordsMismatch = mode === "reset" && confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;

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
      {!currentUser && mode !== "reset" ? (
        <label className="field">
          <span>Email</span>
          <input autoComplete="email" disabled={checking} inputMode="email" onChange={(event) => setEmail(event.target.value)} value={email} />
        </label>
      ) : null}
      {!currentUser && (mode === "signin" || mode === "signup") ? (
        <label className="field">
          <span>Password</span>
          <div className="password-field">
            <input
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              disabled={checking}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              type={mode === "signup" && showPassword ? "text" : "password"}
              value={password}
            />
            {mode === "signup" ? (
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                tabIndex={-1}
                type="button"
              >
                {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
            ) : null}
          </div>
        </label>
      ) : null}
      {!currentUser && mode === "signup" ? (
        <label className="field">
          <span>Confirm password</span>
          <div className="password-field">
            <input
              autoComplete="new-password"
              disabled={checking}
              minLength={6}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
            />
          </div>
          {signupPasswordsMismatch ? <span className="field-error">Passwords do not match.</span> : null}
        </label>
      ) : null}
      {!currentUser && mode === "reset" ? (
        <label className="field">
          <span>New password</span>
          <div className="password-field">
            <input
              autoComplete="new-password"
              disabled={checking}
              minLength={6}
              onChange={(event) => setNewPassword(event.target.value)}
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
            />
            <button
              aria-label={showNewPassword ? "Hide password" : "Show password"}
              className="password-toggle"
              onClick={() => setShowNewPassword((current) => !current)}
              tabIndex={-1}
              type="button"
            >
              {showNewPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </div>
        </label>
      ) : null}
      {!currentUser && mode === "reset" ? (
        <label className="field">
          <span>Confirm new password</span>
          <div className="password-field">
            <input
              autoComplete="new-password"
              disabled={checking}
              minLength={6}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              type={showNewPassword ? "text" : "password"}
              value={confirmNewPassword}
            />
          </div>
          {resetPasswordsMismatch ? <span className="field-error">Passwords do not match.</span> : null}
        </label>
      ) : null}
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
          <button
            className="button"
            disabled={checking || signingIn || !email || !password || !confirmPassword || signupPasswordsMismatch}
            onClick={signUp}
            type="button"
          >
            <UserPlus size={18} aria-hidden />
            {signingIn ? "Creating account..." : "Create account"}
          </button>
        ) : mode === "forgot" ? (
          <button className="button" disabled={checking || signingIn || !email} onClick={sendResetLink} type="button">
            <KeyRound size={18} aria-hidden />
            {signingIn ? "Sending..." : "Send reset link"}
          </button>
        ) : mode === "reset" ? (
          <button
            className="button"
            disabled={checking || signingIn || !newPassword || !confirmNewPassword || resetPasswordsMismatch}
            onClick={updatePassword}
            type="button"
          >
            <KeyRound size={18} aria-hidden />
            {signingIn ? "Updating..." : "Update password"}
          </button>
        ) : (
          <button className="button" disabled={checking || signingIn || !email || !password} onClick={signIn} type="button">
            <LogIn size={18} aria-hidden />
            {signingIn ? "Signing in..." : "Sign in"}
          </button>
        )}
      </div>
      {!currentUser && mode === "signin" ? (
        <button
          className="link-button"
          disabled={checking || signingIn}
          onClick={() => {
            setMode("forgot");
            setMessage("");
          }}
          type="button"
        >
          Forgot password?
        </button>
      ) : null}
      {!currentUser && mode !== "reset" ? (
        <button
          className="link-button"
          disabled={checking || signingIn}
          onClick={() => {
            setMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup");
            setMessage("");
          }}
          type="button"
        >
          {mode === "signup" ? "Already have an account? Sign in" : mode === "forgot" ? "Back to sign in" : "New here? Create an account"}
        </button>
      ) : null}
      <p className="subtle">Only users already added by an admin can access the league.</p>
      <StatusBanner message={message} />
    </div>
  );
}
