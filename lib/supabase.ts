import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let browserClient: SupabaseClient | undefined;

// Every caller must share this one instance. Supabase's client
// auto-detects auth codes/tokens in the URL on init (e.g. a password
// reset link) and exchanges them for a session -- with multiple
// independent instances, they race to exchange the same one-time-use
// code, and whichever instance loses ends up with no session, later
// failing calls like updateUser() with "Auth session missing" even
// though a valid session exists elsewhere in the same browser.
export function createSupabaseBrowserClient() {
  if (!hasSupabaseConfig()) return undefined;
  if (!browserClient) {
    // Implicit flow instead of the default PKCE: PKCE's one-time "code"
    // sits in plain view in the URL's query string, so email link
    // scanners (Outlook Safe Links, Gmail, corporate security gateways)
    // that pre-fetch links before a human clicks them silently consume
    // it, and the real click then fails with "Auth session missing".
    // PKCE also requires the code_verifier it was requested with, which
    // only exists in the browser that called resetPasswordForEmail.
    // Implicit flow's access token rides in the URL fragment instead,
    // which is never sent in an HTTP request (only readable client-side
    // after the page loads), so it isn't exposed to link-scanning bots,
    // and there's no separate exchange step or stored verifier needed.
    browserClient = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { flowType: "implicit" }
    });
  }
  return browserClient;
}
