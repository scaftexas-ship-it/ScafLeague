import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  });
}
