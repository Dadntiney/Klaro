"use client";

import { useEffect, useState } from "react";
import { wipeLocal } from "@/lib/wipe";

/** Inlogscherm. Het wachtwoord controleert de eigen server (api/login.php); na 60 minuten zonder gebruik is opnieuw inloggen nodig. */
export default function Login() {
  const [reden, setReden] = useState<"fout" | "verlopen" | "uit" | null>(null);
  useEffect(() => {
    // Op het inlogscherm (uitgelogd, automatisch of zelf): de bewaarde kopie van het logboek op dit toestel weghalen.
    void wipeLocal();
    const q = new URLSearchParams(location.search);
    setReden(q.has("fout") ? "fout" : q.has("verlopen") ? "verlopen" : q.has("uit") ? "uit" : null);
  }, []);
  return (
    <main className="login">
      <form className="login-card" method="post" action="/api/login.php">
        <h1>Inloggen</h1>
        <p className="muted">Je blijft ingelogd zolang je de app gebruikt; na 60 minuten zonder gebruik log je automatisch uit.</p>
        {reden === "verlopen" && <p className="login-note">Je bent automatisch uitgelogd: de app is 60 minuten niet gebruikt.</p>}
        {reden === "uit" && <p className="login-note">Je bent uitgelogd.</p>}
        <input type="password" name="password" autoComplete="current-password" placeholder="Wachtwoord" required autoFocus aria-label="Wachtwoord" />
        {reden === "fout" && <p className="login-err">Wachtwoord klopt niet.</p>}
        <button type="submit">Inloggen</button>
      </form>
    </main>
  );
}
