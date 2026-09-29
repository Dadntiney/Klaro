"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function LandingCapture() {
  const router = useRouter();
  const [text, setText] = useState("");

  function continueWithDraft() {
    const value = text.trim();
    if (value) sessionStorage.setItem("klaro-draft", value);
    router.push("/registreren");
  }

  return (
    <form
      className="mt-10 max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        continueWithDraft();
      }}
    >
      <label htmlFor="landing-input" className="sr-only">
        Gooi het erin
      </label>
      <Textarea
        id="landing-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Herinner me morgen om 9 uur om de verzekering te bellen. En koop melk."
        className="min-h-32 resize-none rounded-2xl bg-card px-4 py-4 text-base shadow-sm md:text-base"
        maxLength={4000}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="h-11 px-5">
          Aan de slag
        </Button>
        <p className="text-sm text-muted-foreground">Daarna maak je een account.</p>
      </div>
    </form>
  );
}
