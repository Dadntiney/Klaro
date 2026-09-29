"use client";

import { useTransition } from "react";

import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/actions";

export function AppHeader({
  email,
  displayName,
}: {
  email: string;
  displayName: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const label = displayName || email;

  return (
    <header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 py-5">
      <Wordmark href="/home" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="max-w-44 truncate">
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
            {email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              startTransition(() => {
                void signOutAction();
              });
            }}
          >
            Uitloggen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
