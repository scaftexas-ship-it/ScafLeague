import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type DeletePayload = {
  userId?: string;
};

type AdminAccessRow = {
  id: string;
  club_id: string;
  role: "admin" | "player";
  access_disabled: boolean;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Add SUPABASE_SERVICE_ROLE_KEY to .env.local to enable deleting logins (missing service_role key)." },
      { status: 501 }
    );
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Sign in as an admin before deleting users." }, { status: 401 });
  }

  const body = (await request.json()) as DeletePayload;
  const targetUserId = body.userId?.trim();
  if (!targetUserId) {
    return NextResponse.json({ error: "No user specified." }, { status: 400 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const {
    data: { user },
    error: authError
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in as an admin before deleting users." }, { status: 401 });
  }

  const { data: adminUser, error: adminError } = (await serviceClient
    .from("users")
    .select("id, club_id, role, access_disabled")
    .eq("id", user.id)
    .maybeSingle()) as { data: AdminAccessRow | null; error: { message?: string } | null };

  if (adminError || !adminUser || adminUser.role !== "admin" || adminUser.access_disabled) {
    return NextResponse.json({ error: "Only enabled admins can delete users." }, { status: 403 });
  }

  if (targetUserId === adminUser.id) {
    return NextResponse.json({ error: "You can't delete your own login." }, { status: 400 });
  }

  const { data: targetUser, error: targetError } = await serviceClient
    .from("users")
    .select("id, club_id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetError || !targetUser || targetUser.club_id !== adminUser.club_id) {
    return NextResponse.json({ error: "That user was not found in your club." }, { status: 404 });
  }

  // Unlink any player profile first (set user_id to null) instead of letting
  // the auth user delete cascade through public.users -> player_profiles,
  // which would silently wipe the profile and, transitively, their entire
  // match history. Deleting the login should only revoke access -- their
  // roster/results stay intact, just no longer tied to a login.
  const { error: unlinkError } = await serviceClient.from("player_profiles").update({ user_id: null }).eq("user_id", targetUserId);
  if (unlinkError) {
    return NextResponse.json({ error: unlinkError.message }, { status: 400 });
  }

  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(targetUserId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ deleted: true });
}
