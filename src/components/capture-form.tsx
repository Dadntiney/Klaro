"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitCaptureAction, type FormState } from "@/lib/actions";

const initialState: FormState = {};

export function CaptureForm() {
  const [text, setText] = useState("");
  const [state, formAction, pending] = useActionState(submitCaptureAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const draft = sessionStorage.getItem("klaro-draft");
    if (!draft) return;
    sessionStorage.removeItem("klaro-draft");
    const frame = requestAnimationFrame(() => {
      setText(draft);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <label htmlFor="capture" className="sr-only">
        Gooi het erin
      </label>
      <Textarea
        id="capture"
        name="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        placeholder="Gooi het erin…"
        maxLength={4000}
        required
        className="min-h-36 resize-y rounded-2xl bg-card px-4 py-4 text-base shadow-sm md:text-base"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Ctrl of ⌘ + Enter</p>
        <Button type="submit" size="lg" className="h-11 px-5" disabled={pending || !text.trim()}>
          {pending ? "Ik lees het…" : "Regel het"}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
