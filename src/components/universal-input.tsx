"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Camera, Mic, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { submitInputAction, type ActionState } from "@/lib/life-actions";

export function UniversalInput({ initialText = "" }: { initialText?: string }) {
  const [state, action, pending] = useActionState(submitInputAction, {} as ActionState);
  const [text, setText] = useState(initialText);
  const [fileName, setFileName] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [drag, setDrag] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const draft = sessionStorage.getItem("klaro-draft");
      if (!draft) return;
      sessionStorage.removeItem("klaro-draft");
      setText(draft);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function assignFile(file: File | null) {
    const input = fileRef.current;
    if (!input) return;
    const transfer = new DataTransfer();
    if (file) transfer.items.add(file);
    input.files = transfer.files;
    setFileName(file?.name ?? null);
  }

  function startSpeech() {
    const Recognition = (
      window as Window & {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }
    ).SpeechRecognition ?? (
      window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }
    ).webkitSpeechRecognition;
    if (!Recognition) {
      setFileName("Spraakherkenning werkt niet in deze browser. Voeg anders een audiobestand toe.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "nl-NL";
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) setText((current) => (current ? `${current} ${transcript}` : transcript));
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  return (
    <form
      id="invoer"
      ref={formRef}
      action={action}
      className={`rounded-3xl bg-card p-3 ring-1 transition ${drag ? "ring-primary" : "ring-foreground/10"}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDrag(false);
        assignFile(event.dataTransfer.files?.[0] ?? null);
      }}
    >
      <label htmlFor="klaro-input" className="sr-only">
        Waar kan ik je vandaag mee helpen?
      </label>
      <textarea
        id="klaro-input"
        name="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="Typ gewoon wat je nodig hebt."
        className="w-full resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
      />
      <input ref={fileRef} type="file" name="file" className="hidden" accept="image/*,audio/*,.pdf,.txt,.md,application/pdf,text/plain" />
      {fileName ? <p className="px-2 text-sm text-muted-foreground">{fileName}</p> : null}
      {state.error ? (
        <p role="alert" className="px-2 pb-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
        <IconButton label="Bestand toevoegen" onClick={() => fileRef.current?.click()}>
          <Paperclip />
        </IconButton>
        <IconButton label="Foto maken">
          <Camera />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Foto maken"
            onChange={(event) => assignFile(event.target.files?.[0] ?? null)}
          />
        </IconButton>
        <IconButton label={listening ? "Luistert" : "Spraakbericht"} onClick={startSpeech}>
          <Mic />
        </IconButton>
        <Button type="submit" disabled={pending} className="ml-auto h-11 rounded-full px-5">
          {pending ? "Even kijken wat dit is…" : "Regelen"}
        </Button>
      </div>
    </form>
  );
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="relative flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  start: () => void;
  onresult: ((event: { results?: Array<Array<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
