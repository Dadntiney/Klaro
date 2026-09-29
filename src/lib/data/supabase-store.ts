import "server-only";

import type {
  AuthResult,
  Capture,
  ConfirmedItem,
  InterpreterSource,
  KlaroItem,
  NewItem,
  Profile,
} from "@/lib/domain";
import { defaultPreferences } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

type CaptureRow = {
  id: string;
  raw_text: string;
  summary: string | null;
  interpreter: InterpreterSource | null;
  status: Capture["status"];
  created_at: string;
};

type ItemRow = {
  id: string;
  capture_id: string | null;
  kind: KlaroItem["kind"];
  title: string;
  notes: string | null;
  due_at: string | null;
  remind_at: string | null;
  status: KlaroItem["status"];
  created_at: string;
};

function mapCapture(row: CaptureRow): Capture {
  return {
    id: row.id,
    rawText: row.raw_text,
    summary: row.summary,
    interpreter: row.interpreter,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapItem(row: ItemRow): KlaroItem {
  return {
    id: row.id,
    captureId: row.capture_id,
    kind: row.kind,
    title: row.title,
    notes: row.notes,
    dueAt: row.due_at,
    remindAt: row.remind_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapAuthError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "Onjuist e-mailadres of wachtwoord.";
  }
  if (lower.includes("already registered") || lower.includes("already exists")) {
    return "Er bestaat al een account met dit e-mailadres.";
  }
  if (lower.includes("password")) return "Kies een wachtwoord van minstens 8 tekens.";
  if (lower.includes("email")) return "Dit e-mailadres lijkt niet geldig.";
  return "Er ging iets mis. Probeer het opnieuw.";
}

export async function supabaseGetProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone, onboarded_at, preferences")
    .eq("id", data.user.id)
    .maybeSingle();

  const metadataName = data.user.user_metadata?.display_name;
  const prefs = profile?.preferences;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    displayName: profile?.display_name ?? (typeof metadataName === "string" ? metadataName : null),
    timezone: profile?.timezone || "Europe/Amsterdam",
    onboardedAt: profile?.onboarded_at ?? null,
    preferences: {
      ...defaultPreferences,
      ...(prefs && typeof prefs === "object" ? prefs : {}),
    },
  };
}

export async function supabaseSignUp(input: {
  email: string;
  password: string;
  displayName?: string;
  origin: string;
}): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${input.origin}/auth/callback?next=/home`,
      data: { display_name: input.displayName?.trim() || null },
    },
  });

  if (error) return { ok: false, error: mapAuthError(error.message) };
  if (!data.session) return { ok: true, needsConfirmation: true };
  return { ok: true };
}

export async function supabaseSignIn(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) return { ok: false, error: mapAuthError(error.message) };
  return { ok: true };
}

export async function supabaseSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function supabaseInsertCapture(rawText: string): Promise<Capture> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Niet ingelogd.");

  const { data, error } = await supabase
    .from("captures")
    .insert({ user_id: userData.user.id, raw_text: rawText })
    .select("id, raw_text, summary, interpreter, status, created_at")
    .single();

  if (error || !data) throw new Error("De invoer kon niet bewaard worden.");
  return mapCapture(data as CaptureRow);
}

export async function supabaseUpdateCapture(
  id: string,
  patch: Partial<Pick<Capture, "summary" | "interpreter">>,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("captures")
    .update({
      summary: patch.summary,
      interpreter: patch.interpreter,
    })
    .eq("id", id);
  if (error) throw new Error("De invoer kon niet bijgewerkt worden.");
}

export async function supabaseGetCapture(id: string): Promise<Capture | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("captures")
    .select("id, raw_text, summary, interpreter, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapCapture(data as CaptureRow);
}

export async function supabaseInsertItems(captureId: string, items: NewItem[]) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Niet ingelogd.");

  const { data, error } = await supabase
    .from("items")
    .insert(
      items.map((item) => ({
        user_id: userData.user.id,
        capture_id: captureId,
        kind: item.kind,
        title: item.title,
        notes: item.notes,
        due_at: item.dueAt,
        remind_at: item.remindAt,
        status: "proposed",
      })),
    )
    .select("id, capture_id, kind, title, notes, due_at, remind_at, status, created_at");

  if (error || !data) throw new Error("De voorstellen konden niet bewaard worden.");
  return (data as ItemRow[]).map(mapItem);
}

export async function supabaseListItemsByCapture(captureId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, capture_id, kind, title, notes, due_at, remind_at, status, created_at")
    .eq("capture_id", captureId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as ItemRow[]).map(mapItem);
}

export async function supabaseListOpenItems() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, capture_id, kind, title, notes, due_at, remind_at, status, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as ItemRow[]).map(mapItem);
}

export async function supabaseCompleteItem(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({ status: "done" })
    .eq("id", id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Deze regel kon niet afgevinkt worden.");
}

export async function supabaseDismissCapture(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("captures")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Deze invoer is al afgehandeld.");

  await supabase
    .from("items")
    .update({ status: "dismissed" })
    .eq("capture_id", id)
    .eq("status", "proposed");
}

export async function supabaseConfirmCapture(captureId: string, items: ConfirmedItem[]) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_capture", {
    p_capture_id: captureId,
    p_items: items.map((item) => ({
      id: item.id ?? null,
      kind: item.kind,
      title: item.title,
      notes: item.notes,
      due_at: item.dueAt,
      remind_at: item.remindAt,
    })),
  });
  if (error) throw new Error("Bevestigen lukte niet. Probeer het opnieuw.");
}
