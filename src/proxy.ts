import { NextResponse, type NextRequest } from "next/server";

import { backendMode } from "@/lib/env";
import { updateSupabaseSession } from "@/lib/supabase/session";

const PROTECTED = [/^\/home$/, /^\/bevestigen(?:\/|$)/];
const AUTH_PAGES = [/^\/login$/, /^\/registreren$/];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const mode = backendMode();

  let response = NextResponse.next({ request });
  let isAuthed = false;

  if (mode === "supabase") {
    const session = await updateSupabaseSession(request);
    response = session.response;
    isAuthed = session.isAuthed;
  } else if (mode === "demo") {
    isAuthed = request.cookies.has("klaro_demo_session");
  }

  const isProtected = PROTECTED.some((pattern) => pattern.test(pathname));
  const isAuthPage = AUTH_PAGES.some((pattern) => pattern.test(pathname));

  if (isProtected && !isAuthed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && isAuthed) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
