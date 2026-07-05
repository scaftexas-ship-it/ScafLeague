import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type InvitePayload = {
  email?: string;
  fullName?: string;
  password?: string;
  role?: "admin" | "player";
  playerProfileId?: string;
  createPlayerProfile?: boolean;
  rating?: string;
  mobileNumber?: string;
};

type AdminAccessRow = {
  id: string;
  club_id: string;
  role: "admin" | "player";
  access_disabled?: boolean | null;
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
      { error: "Add SUPABASE_SERVICE_ROLE_KEY to .env.local to enable admin login invites." },
      { status: 501 }
    );
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Sign in as an admin before inviting users." }, { status: 401 });
  }

  const body = (await request.json()) as InvitePayload;
  const email = body.email?.trim().toLowerCase();
  const fullName = body.fullName?.trim();
  const password = body.password?.trim();
  const role = body.role === "admin" ? "admin" : "player";
  const playerProfileId = body.playerProfileId?.trim() || null;
  const rating = body.rating?.trim() || null;
  const mobileNumber = body.mobileNumber?.trim() || null;

  if (!email || !fullName) {
    return NextResponse.json({ error: "Enter the user's name and email." }, { status: 400 });
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
    return NextResponse.json({ error: "Sign in as an admin before inviting users." }, { status: 401 });
  }

  let { data: adminUser, error: adminError } = (await serviceClient
    .from("users")
    .select("id, club_id, role, access_disabled")
    .eq("id", user.id)
    .maybeSingle()) as { data: AdminAccessRow | null; error: { message?: string } | null };
  if (adminError && isMissingAccessDisabledColumn(adminError)) {
    const fallback = await serviceClient.from("users").select("id, club_id, role").eq("id", user.id).maybeSingle();
    adminUser = fallback.data as AdminAccessRow | null;
    adminError = fallback.error;
  }

  if (adminError || !adminUser || adminUser.role !== "admin" || adminUser.access_disabled) {
    return NextResponse.json({ error: "Only enabled admins can invite users." }, { status: 403 });
  }

  const authResult = password
    ? await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role }
      })
    : await serviceClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, role },
        redirectTo: new URL("/login", request.url).toString()
      });

  if (authResult.error || !authResult.data.user) {
    return NextResponse.json({ error: authResult.error?.message || "Could not create the login." }, { status: 400 });
  }

  let { error: userError } = await serviceClient.from("users").upsert({
    id: authResult.data.user.id,
    club_id: adminUser.club_id,
    role,
    full_name: fullName,
    email,
    access_disabled: false
  });

  if (userError && isMissingAccessDisabledColumn(userError)) {
    const fallback = await serviceClient.from("users").upsert({
      id: authResult.data.user.id,
      club_id: adminUser.club_id,
      role,
      full_name: fullName,
      email
    });
    userError = fallback.error;
  }

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 400 });
  }

  if (playerProfileId) {
    let { error: profileError } = await serviceClient
      .from("player_profiles")
      .update({ user_id: authResult.data.user.id, mobile_number: mobileNumber })
      .eq("id", playerProfileId)
      .eq("club_id", adminUser.club_id);
    if (profileError && isMissingMobileNumberColumn(profileError)) {
      const fallback = await serviceClient
        .from("player_profiles")
        .update({ user_id: authResult.data.user.id })
        .eq("id", playerProfileId)
        .eq("club_id", adminUser.club_id);
      profileError = fallback.error;
    }

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
  } else if (body.createPlayerProfile && role === "player") {
    let { error: createProfileError } = await serviceClient.from("player_profiles").insert({
      user_id: authResult.data.user.id,
      club_id: adminUser.club_id,
      display_name: fullName,
      mobile_number: mobileNumber,
      rating
    });
    if (createProfileError && isMissingMobileNumberColumn(createProfileError)) {
      const fallback = await serviceClient.from("player_profiles").insert({
        user_id: authResult.data.user.id,
        club_id: adminUser.club_id,
        display_name: fullName,
        rating
      });
      createProfileError = fallback.error;
    }

    if (createProfileError) {
      return NextResponse.json({ error: createProfileError.message }, { status: 400 });
    }
  }

  return NextResponse.json({
    user: {
      id: authResult.data.user.id,
      email,
      full_name: fullName,
      role
    }
  });
}

function isMissingAccessDisabledColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  return message.includes("access_disabled") || message.includes("schema cache");
}

function isMissingMobileNumberColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  return message.includes("mobile_number") || message.includes("schema cache");
}
