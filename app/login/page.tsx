/** Inlogscherm: één keer per apparaat, daarna 180 dagen ingelogd. */
export default function Login({ searchParams }: { searchParams: { fout?: string } }) {
  return (
    <main className="login">
      <form className="login-card" method="post" action="/api/login">
        <h1>Inloggen</h1>
        <p className="muted">Eén keer per apparaat; daarna blijf je ingelogd.</p>
        <input type="password" name="password" autoComplete="current-password" placeholder="Wachtwoord" required autoFocus aria-label="Wachtwoord" />
        {searchParams.fout && <p className="login-err">Wachtwoord klopt niet.</p>}
        <button type="submit">Inloggen</button>
      </form>
    </main>
  );
}
