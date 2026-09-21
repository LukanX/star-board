import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { updateAccountProfileSchema } from "@/lib/validation/account";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updateAccountProfileSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Account name is invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data, error } = await context.supabase
      .from("profiles")
      .update({ display_name: input.data.displayName, updated_at: new Date().toISOString() })
      .eq("id", context.user.id)
      .select("display_name")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Account name could not be saved." }, { status: 503 });
    }

    return NextResponse.json({ displayName: data.display_name });
  } catch {
    return NextResponse.json({ error: "Account service is not configured." }, { status: 503 });
  }
}