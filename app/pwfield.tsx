"use client";

/** Wachtwoordveld met een oogje om het wachtwoord even te laten zien. */
export function PasswordField({ name, autoComplete, placeholder, show, onToggle, autoFocus }: { name: string; autoComplete: string; placeholder: string; show: boolean; onToggle: () => void; autoFocus?: boolean }) {
  return (
    <span className="pwfield">
      <input type={show ? "text" : "password"} name={name} autoComplete={autoComplete} placeholder={placeholder} required autoFocus={autoFocus} aria-label={placeholder} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" className="pweye" onClick={onToggle} aria-label={show ? "Wachtwoord verbergen" : "Wachtwoord tonen"} aria-pressed={show}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {show && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </span>
  );
}
