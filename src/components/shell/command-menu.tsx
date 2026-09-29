"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const COMMANDS = [
  { label: "Nieuwe invoer", href: "/home#invoer" },
  { label: "Nieuwe taak", href: "/taken" },
  { label: "Nieuwe herinnering", href: "/herinneringen" },
  { label: "Zoek document", href: "/zoeken" },
  { label: "Open assistent", href: "/assistent" },
  { label: "Inbox", href: "/inbox" },
  { label: "Vandaag", href: "/vandaag" },
  { label: "Agenda", href: "/agenda" },
  { label: "Instellingen", href: "/instellingen" },
];

export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = COMMANDS.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 px-4 pt-[12vh]" role="presentation">
      <div role="dialog" aria-label="Zoeken en acties" className="w-full max-w-lg rounded-3xl bg-card p-3 shadow-xl ring-1 ring-foreground/10">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zoek of start een actie"
          aria-label="Zoek of start een actie"
          className="h-12 w-full rounded-2xl bg-background px-4 outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring"
        />
        <ul className="mt-2">
          {results.map((command) => (
            <li key={command.href}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center rounded-2xl px-3 text-left hover:bg-muted"
                onClick={() => {
                  setOpen(false);
                  router.push(command.href);
                }}
              >
                {command.label}
              </button>
            </li>
          ))}
          {query.trim().length > 1 ? (
            <li>
              <button
                type="button"
                className="flex min-h-11 w-full items-center rounded-2xl px-3 text-left hover:bg-muted"
                onClick={() => {
                  setOpen(false);
                  router.push(`/zoeken?q=${encodeURIComponent(query.trim())}`);
                }}
              >
                Zoek “{query.trim()}” in je gegevens
              </button>
            </li>
          ) : null}
        </ul>
        <p className="px-3 py-2 text-xs text-muted-foreground">Sneltoets ⌘K of Ctrl+K. Gewoon typen kan ook.</p>
      </div>
    </div>
  );
}
