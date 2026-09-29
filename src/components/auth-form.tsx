"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signInAction, signUpAction, type FormState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FormState = {};

export function AuthForm({
  mode,
  nextPath = "/home",
}: {
  mode: "login" | "signup";
  nextPath?: string;
}) {
  const action = mode === "login" ? signInAction : signUpAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isSignup ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">Naam</Label>
          <Input
            id="displayName"
            name="displayName"
            autoComplete="name"
            placeholder="Hoe mogen we je noemen?"
            className="h-11 bg-background px-3 md:text-base"
            maxLength={80}
          />
        </div>
      ) : (
        <input type="hidden" name="next" value={nextPath} />
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 bg-background px-3 md:text-base"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Wachtwoord</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={8}
          className="h-11 bg-background px-3 md:text-base"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="text-sm text-primary">
          {state.notice}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="mt-2 h-11" disabled={pending}>
        {pending ? "Even geduld…" : isSignup ? "Account maken" : "Inloggen"}
      </Button>

      <p className="text-sm text-muted-foreground">
        {isSignup ? (
          <>
            Al een account?{" "}
            <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
              Inloggen
            </Link>
          </>
        ) : (
          <>
            Nog geen account?{" "}
            <Link
              href="/registreren"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Registreren
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
