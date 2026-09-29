import "server-only";

import { interpretNote } from "@/lib/ai/interpret";
import type { InterpretedItem } from "@/lib/ai/schema";
import type { ConfirmedItem, Profile } from "@/lib/domain";
import { backendMode } from "@/lib/env";
import {
  demoCompleteItem,
  demoConfirmCapture,
  demoDismissCapture,
  demoGetCapture,
  demoGetProfile,
  demoInsertCapture,
  demoInsertItems,
  demoListItemsByCapture,
  demoListOpenItems,
  demoSignIn,
  demoSignOut,
  demoSignUp,
  demoUpdateCapture,
} from "@/lib/data/demo-store";
import {
  supabaseCompleteItem,
  supabaseConfirmCapture,
  supabaseDismissCapture,
  supabaseGetCapture,
  supabaseGetProfile,
  supabaseInsertCapture,
  supabaseInsertItems,
  supabaseListItemsByCapture,
  supabaseListOpenItems,
  supabaseSignIn,
  supabaseSignOut,
  supabaseSignUp,
  supabaseUpdateCapture,
} from "@/lib/data/supabase-store";

const UNCONFIGURED = "Klaro is nog niet gekoppeld aan Supabase. Zie .env.example.";

export async function getProfile(): Promise<Profile | null> {
  try {
    if (backendMode() === "supabase") return await supabaseGetProfile();
    if (backendMode() === "demo") return await demoGetProfile();
    return null;
  } catch {
    return null;
  }
}

export async function signUpAccount(input: {
  email: string;
  password: string;
  displayName?: string;
  origin: string;
}) {
  const mode = backendMode();
  if (mode === "unconfigured") return { ok: false as const, error: UNCONFIGURED };
  if (mode === "demo") return demoSignUp(input);
  return supabaseSignUp(input);
}

export async function signInAccount(input: { email: string; password: string }) {
  const mode = backendMode();
  if (mode === "unconfigured") return { ok: false as const, error: UNCONFIGURED };
  if (mode === "demo") return demoSignIn(input);
  return supabaseSignIn(input);
}

export async function signOutAccount() {
  if (backendMode() === "supabase") await supabaseSignOut();
  else if (backendMode() === "demo") await demoSignOut();
}

export async function submitCapture(rawText: string) {
  const mode = backendMode();
  if (mode === "unconfigured") throw new Error(UNCONFIGURED);

  const insert = mode === "supabase" ? supabaseInsertCapture : demoInsertCapture;
  const insertItems = mode === "supabase" ? supabaseInsertItems : demoInsertItems;
  const update = mode === "supabase" ? supabaseUpdateCapture : demoUpdateCapture;
  const list = mode === "supabase" ? supabaseListItemsByCapture : demoListItemsByCapture;

  const capture = await insert(rawText);
  const interpretation = await interpretNote(rawText);
  const items: InterpretedItem[] = interpretation.items;

  await insertItems(
    capture.id,
    items.map((item) => ({
      kind: item.kind,
      title: item.title,
      notes: item.notes,
      dueAt: item.dueAt,
      remindAt: item.remindAt,
    })),
  );
  await update(capture.id, {
    summary: interpretation.summary,
    interpreter: interpretation.source,
  });

  const stored = await list(capture.id);
  return {
    captureId: capture.id,
    degraded: Boolean(interpretation.degraded),
    itemCount: stored.length,
  };
}

export async function getConfirmation(captureId: string) {
  const mode = backendMode();
  if (mode === "unconfigured") return null;
  const getCapture = mode === "supabase" ? supabaseGetCapture : demoGetCapture;
  const list = mode === "supabase" ? supabaseListItemsByCapture : demoListItemsByCapture;
  const capture = await getCapture(captureId);
  if (!capture) return null;
  const items = await list(captureId);
  return { capture, items };
}

export async function confirmCapture(captureId: string, items: ConfirmedItem[]) {
  if (backendMode() === "supabase") return supabaseConfirmCapture(captureId, items);
  if (backendMode() === "demo") return demoConfirmCapture(captureId, items);
  throw new Error(UNCONFIGURED);
}

export async function dismissCapture(captureId: string) {
  if (backendMode() === "supabase") return supabaseDismissCapture(captureId);
  if (backendMode() === "demo") return demoDismissCapture(captureId);
  throw new Error(UNCONFIGURED);
}

export async function listOpenItems() {
  if (backendMode() === "supabase") return supabaseListOpenItems();
  if (backendMode() === "demo") return demoListOpenItems();
  return [];
}

export async function completeItem(id: string) {
  if (backendMode() === "supabase") return supabaseCompleteItem(id);
  if (backendMode() === "demo") return demoCompleteItem(id);
  throw new Error(UNCONFIGURED);
}
