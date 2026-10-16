"use client";

import { useEffect, useState } from "react";

/** Inlogscherm: één keer per apparaat, daarna 180 dagen ingelogd. Het wachtwoord controleert de eigen server (api/login.php). */
export default function Login() {
  const [fout, setFout] = useState(false);
  useEffect(() => setFout(new URLSearchParams(location.search).has("fout")), []);
  return (
    <main className="login">
      <form className="login-card" method="post" action="/api/login.php">
        <h1>Inloggen</h1>
        <p className="muted">Eén keer per apparaat; daarna blijf je ingelogd.</p>
        <input type="password" name="password" autoComplete="current-password" placeholder="Wachtwoord" required autoFocus aria-label="Wachtwoord" />
        {fout && <p className="login-err">Wachtwoord klopt niet.</p>}
        <button type="submit">Inloggen</button>
      </form>
    </main>
  );
}
