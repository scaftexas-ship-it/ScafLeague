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
    browserClient = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return browserClient;
}
