import { createClient } from "@supabase/supabase-js";
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
//
// Uses the plain supabase-js client rather than @supabase/ssr: this app
// is a fully static export with no server runtime to share cookie-based
// sessions with, and @supabase/ssr's createBrowserClient hardcodes
// flowType: "pkce" internally (it overrides any flowType passed in), so
// it offers no way to actually get implicit-flow behavior.
//
// Implicit flow instead of PKCE: PKCE's one-time "code" sits in plain
// view in the URL's query string, so email link scanners (Outlook Safe
// Links, Gmail, corporate security gateways) that pre-fetch links before
// a human clicks them silently consume it, and the real click then fails
// with "Auth session missing". PKCE also requires the code_verifier it
// was requested with, which only exists in the browser that called
// resetPasswordForEmail. Implicit flow's access token rides in the URL
// fragment instead, which is never sent in an HTTP request (only
// readable client-side after the page loads), so it isn't exposed to
// link-scanning bots, and there's no separate exchange step or stored
// verifier needed.
export function createSupabaseBrowserClient() {
  if (!hasSupabaseConfig()) return undefined;
  if (!browserClient) {
    browserClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { flowType: "implicit", persistSession: true, detectSessionInUrl: true }
    });
  }
  return browserClient;
}
