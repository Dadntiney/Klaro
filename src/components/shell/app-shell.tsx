"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckCheck,
  FileText,
  House,
  Inbox,
  ListTodo,
  Plus,
  Settings,
  Sparkles,
  SunMedium,
} from "lucide-react";

import { CommandMenu } from "@/components/shell/command-menu";
import { UniversalInput } from "@/components/universal-input";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", label: "Home", icon: House },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/vandaag", label: "Vandaag", icon: SunMedium },
  { href: "/taken", label: "Taken", icon: CheckCheck },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/herinneringen", label: "Herinneringen", icon: Bell },
  { href: "/documenten", label: "Documenten", icon: FileText },
  { href: "/lijsten", label: "Lijsten", icon: ListTodo },
  { href: "/assistent", label: "Assistent", icon: Sparkles },
] as const;

const MOBILE = [NAV[0], NAV[1], NAV[2], NAV[8]];

export function AppShell({
  children,
  name,
}: {
  children: ReactNode;
  name: string;
}) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const composer = openOn === pathname;

  return (
    <div className="min-h-full md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border/80 bg-card/70 px-4 py-5 md:flex">
        <Wordmark href="/home" />
        <p className="mt-1 truncate px-2 text-sm text-muted-foreground">{name}</p>
        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Hoofdmenu">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname.startsWith(item.href)} />
          ))}
        </nav>
        <NavLink href="/instellingen" label="Instellingen" icon={Settings} active={pathname.startsWith("/instellingen")} />
      </aside>

      <div className="min-w-0 pb-24 md:pb-10">
        <CommandMenu />
        {children}
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 px-2 py-2 backdrop-blur md:hidden"
        aria-label="Mobiel menu"
      >
        {MOBILE.slice(0, 2).map((item) => (
          <MobileLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname.startsWith(item.href)} />
        ))}
        <button
          type="button"
          className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
          aria-label="Iets toevoegen"
          onClick={() => setOpenOn(pathname)}
        >
          <Plus />
        </button>
        {MOBILE.slice(2).map((item) => (
          <MobileLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname.startsWith(item.href)} />
        ))}
      </nav>

      {composer ? (
        <div className="fixed inset-0 z-40 flex items-end bg-foreground/30 md:hidden" role="presentation">
          <div
            role="dialog"
            aria-label="Nieuwe invoer"
            className="max-h-[85vh] w-full overflow-auto rounded-t-3xl bg-background p-4 pb-8"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-heading text-2xl">Gooi het erin</p>
              <button type="button" className="text-sm text-muted-foreground" onClick={() => setOpenOn(null)}>
                Sluit
              </button>
            </div>
            <UniversalInput />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof House;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

function MobileLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof House;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 flex-col items-center justify-center gap-1 text-[11px]",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}
