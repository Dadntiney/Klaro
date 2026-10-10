import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authToken, sameText } from "@/lib/auth";

/**
 * Afscherming van de hele site zodra APP_PASSWORD is ingesteld. Ingelogd via de cookie van het inlogscherm (180 dagen),
 * of via basic-auth (voor scripts en de oude manier). Niet ingelogd: pagina's gaan naar /login, API's krijgen 401.
 */
export async function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const path = req.nextUrl.pathname;
  // Het inlogscherm zelf, de bestanden die het nodig heeft, en de maandelijkse controle (eigen sleutel) zijn vrij.
  if (path === "/login" || path === "/api/login" || path === "/api/audit" || path.startsWith("/_next/") || path === "/favicon.ico") return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && sameText(cookie, await authToken(password))) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      if (sameText(decoded.slice(decoded.indexOf(":") + 1), password)) return NextResponse.next();
    } catch {}
  }

  if (path.startsWith("/api/")) return NextResponse.json({ error: "Inloggen vereist." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}
