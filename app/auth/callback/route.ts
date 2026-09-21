import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function getSafeNextPath(requestUrl: URL) {
  const requestedNext = requestUrl.searchParams.get("next");
  return requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/campaigns";
}

function getEmailErrorNextPath(nextPath: string, requestUrl: URL) {
  const destination = new URL(nextPath, requestUrl);

  if (destination.pathname === "/account") {
    destination.searchParams.set("email", "error");
  }

  return `${destination.pathname}${destination.search}`;
}

function getCallbackErrorRedirect(requestUrl: URL, nextPath: string) {
  const loginUrl = new URL("/login", requestUrl);
  loginUrl.searchParams.set("error", "auth_callback");

  if (nextPath === "/login/reset-password") {
    loginUrl.searchParams.set("mode", "reset");
  } else {
    loginUrl.searchParams.set("next", getEmailErrorNextPath(nextPath, requestUrl));
  }

  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl);

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return getCallbackErrorRedirect(requestUrl, nextPath);
    }
  } else if (requestUrl.searchParams.get("error")) {
    return getCallbackErrorRedirect(requestUrl, nextPath);
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
