"use client";

import { useEffect, useState } from "react";
import { wipeLocal } from "@/lib/wipe";
import { PasswordField } from "../pwfield";

/** Inlogscherm. Het wachtwoord controleert de eigen server (api/login.php); na 2 uur zonder gebruik is opnieuw inloggen nodig. */
export default function Login() {
  const [reden, setReden] = useState<"fout" | "dicht" | "verlopen" | "uit" | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Het inlogscherm draait: geen "start niet op"-melding van het vangnet in app/layout.tsx.
    (window as unknown as { __klaroUp?: boolean }).__klaroUp = true;
    // Op het inlogscherm (uitgelogd, automatisch of zelf): de bewaarde kopie van het logboek op dit toestel weghalen.
    void wipeLocal();
    const q = new URLSearchParams(location.search);
    setReden(q.get("fout") === "2" ? "dicht" : q.has("fout") ? "fout" : q.has("verlopen") ? "verlopen" : q.has("uit") ? "uit" : null);
  }, []);
  return (
    <main className="login">
      <form className="login-card" method="post" action="/api/login.php">
        <h1>Inloggen</h1>
        <p className="muted">Je blijft ingelogd zolang je de app gebruikt; na 2 uur zonder gebruik vraagt hij weer om je wachtwoord.</p>
        {reden === "verlopen" && <p className="login-note">Je bent automatisch uitgelogd. Log opnieuw in.</p>}
        {reden === "uit" && <p className="login-note">Je bent uitgelogd.</p>}
        <PasswordField name="password" autoComplete="current-password" placeholder="Wachtwoord" show={show} onToggle={() => setShow((v) => !v)} autoFocus />
        {reden === "fout" && <p className="login-err">Wachtwoord klopt niet.</p>}
        {reden === "dicht" && <p className="login-err">Te vaak een fout wachtwoord. Probeer het over 15 minuten opnieuw.</p>}
        <button type="submit">Inloggen</button>
      </form>
    </main>
  );
}
