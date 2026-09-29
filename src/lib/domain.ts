export type ItemKind = "taak" | "herinnering";
export type ItemStatus = "proposed" | "open" | "done" | "dismissed";
export type CaptureStatus = "pending" | "confirmed" | "dismissed";
export type InterpreterSource = "openai" | "local";

export type Profile = {
  id: string;
  email: string;
  displayName: string | null;
};

export type Capture = {
  id: string;
  rawText: string;
  summary: string | null;
  interpreter: InterpreterSource | null;
  status: CaptureStatus;
  createdAt: string;
};

export type KlaroItem = {
  id: string;
  captureId: string | null;
  kind: ItemKind;
  title: string;
  notes: string | null;
  dueAt: string | null;
  remindAt: string | null;
  status: ItemStatus;
  createdAt: string;
};

export type NewItem = {
  kind: ItemKind;
  title: string;
  notes: string | null;
  dueAt: string | null;
  remindAt: string | null;
};

export type ConfirmedItem = {
  id?: string;
  kind: ItemKind;
  title: string;
  notes: string | null;
  dueAt: string | null;
  remindAt: string | null;
};

export type AuthResult =
  | { ok: true; needsConfirmation?: boolean }
  | { ok: false; error: string };
