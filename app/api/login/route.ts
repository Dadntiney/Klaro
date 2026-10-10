import { NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_DAYS, authToken, sameText } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Wachtwoord controleren en het apparaat 180 dagen ingelogd houden. */
export async function POST(req: Request) {
  const password = process.env.APP_PASSWORD;
  const form = await req.formData().catch(() => null);
  const given = String(form?.get("password") ?? "");
  const back = new URL("/", req.url);
  if (!password || !sameText(given, password)) {
    await new Promise((r) => setTimeout(r, 800)); // raden afremmen
    return NextResponse.redirect(new URL("/login?fout=1", req.url), 303);
  }
  const res = NextResponse.redirect(back, 303);
  res.cookies.set(AUTH_COOKIE, await authToken(password), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_DAYS * 24 * 3600,
  });
  return res;
}
