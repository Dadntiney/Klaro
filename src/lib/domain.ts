export type ItemKind = "taak" | "herinnering" | "afspraak" | "notitie";
export type ItemStatus = "proposed" | "open" | "done" | "dismissed";
export type CaptureStatus = "pending" | "confirmed" | "dismissed";
export type InterpreterSource = "openai" | "local";
export type Priority = "laag" | "normaal" | "hoog";

export type Preferences = {
  autoActions: boolean;
  proactive: boolean;
  notifications: boolean;
};

export const defaultPreferences: Preferences = {
  autoActions: false,
  proactive: true,
  notifications: true,
};

export type Profile = {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  onboardedAt: string | null;
  preferences: Preferences;
};

export type Capture = {
  id: string;
  rawText: string;
  summary: string | null;
  interpreter: InterpreterSource | null;
  status: CaptureStatus;
  createdAt: string;
  inputKind?: string;
  fileName?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
  category?: string | null;
  archivedAt?: string | null;
  proposal?: unknown;
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
  priority?: Priority;
  category?: string | null;
  location?: string | null;
  recurrence?: string | null;
  snoozedUntil?: string | null;
  parentId?: string | null;
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
