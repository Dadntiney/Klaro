import { NextRequest, NextResponse } from "next/server";

/** Basic-auth voor de hele site zodra APP_PASSWORD is ingesteld (gebruikersnaam is vrij). */
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
    } catch {}
  }
  return new NextResponse("Inloggen vereist", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="CSV", charset="UTF-8"' },
  });
}
