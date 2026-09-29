import "server-only";

import { randomUUID } from "node:crypto";

import type { KlaroItem, Preferences } from "@/lib/domain";
import { defaultPreferences } from "@/lib/domain";
import type { LifePlan, PlannedAction } from "@/lib/life/plan";
import { materialize, nextRecurrence } from "@/lib/life/materialize";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRow, InboxRow, ListRow, ThreadMessage } from "@/lib/data/life-demo";

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
  priority: KlaroItem["priority"];
  category: string | null;
  location: string | null;
  recurrence: string | null;
  snoozed_until: string | null;
  parent_id: string | null;
};

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
    priority: row.priority ?? "normaal",
    category: row.category,
    location: row.location,
    recurrence: row.recurrence,
    snoozedUntil: row.snoozed_until,
    parentId: row.parent_id,
  };
}

async function client() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Niet ingelogd.");
  return { supabase, userId: data.user.id };
}

function fail(error: { message: string } | null, fallback: string) {
  if (!error) return;
  const message = error.message.toLowerCase();
  if (message.includes("jwt") || message.includes("not authenticated")) {
    throw new Error("Niet ingelogd.");
  }
  throw new Error(fallback);
}

export async function supabaseCreateIncoming(input: {
  text: string;
  plan: LifePlan;
  category: string | null;
  inputKind: string;
  file: { name: string; type: string; bytes: Uint8Array } | null;
}) {
  const { supabase, userId } = await client();
  const id = randomUUID();
  let filePath: string | null = null;
  if (input.file) {
    const safe = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
    filePath = `${userId}/${id}-${safe}`;
    const uploaded = await supabase.storage.from("klaro").upload(filePath, input.file.bytes, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });
    fail(uploaded.error, "Het bestand kon niet worden opgeslagen.");
  }
  const inserted = await supabase.from("captures").insert({
    id,
    user_id: userId,
    raw_text: input.text || input.file?.name || "Bijlage",
    summary: input.plan.summary,
    interpreter: input.plan.source,
    status: "pending",
    input_kind: input.inputKind,
    file_name: input.file?.name ?? null,
    file_path: filePath,
    mime_type: input.file?.type ?? null,
    category: input.category,
    proposal: input.plan,
  });
  fail(inserted.error, "Ik kon dit niet bewaren.");
  return id;
}

export async function supabaseGetIncoming(id: string) {
  const { supabase } = await client();
  const { data, error } = await supabase
    .from("captures")
    .select("id, raw_text, summary, interpreter, status, created_at, input_kind, file_name, file_path, mime_type, category, proposal, archived_at")
    .eq("id", id)
    .maybeSingle();
  fail(error, "Ik kon deze invoer niet openen.");
  if (!data) return null;
  return {
    id: data.id as string,
    rawText: data.raw_text as string,
    summary: data.summary as string | null,
    status: data.status as string,
    createdAt: data.created_at as string,
    proposal: data.proposal,
    fileName: data.file_name as string | null,
    filePath: data.file_path as string | null,
    mimeType: data.mime_type as string | null,
    category: data.category as string | null,
  };
}

export async function supabaseApply(captureId: string, actions: PlannedAction[]) {
  const { supabase, userId } = await client();
  const current = await supabaseGetIncoming(captureId);
  if (!current || current.status !== "pending") throw new Error("Deze invoer is al afgehandeld.");
  const made = materialize(actions, captureId);
  if (made.items.length) {
    const inserted = await supabase.from("items").insert(
      made.items.map((item) => ({
        user_id: userId,
        capture_id: captureId,
        kind: item.kind,
        title: item.title,
        notes: item.notes,
        due_at: item.dueAt,
        remind_at: item.remindAt,
        status: "open",
        priority: item.priority,
        category: item.category,
        location: item.location,
        recurrence: item.recurrence,
      })),
    );
    fail(inserted.error, "Ik kon de actie niet opslaan.");
  }
  if (made.documents.length) {
    const inserted = await supabase.from("documents").insert(
      made.documents.map((document) => ({
        user_id: userId,
        capture_id: captureId,
        title: document.title,
        category: document.category,
        summary: document.summary,
        supplier: document.supplier,
        amount_cents: document.amountCents,
        reference_code: document.referenceCode,
        due_on: document.dueOn,
        starts_on: document.startsOn,
        ends_on: document.endsOn,
        file_path: current.filePath,
        file_name: current.fileName,
        mime_type: current.mimeType,
        text_content: current.rawText.slice(0, 20_000),
      })),
    );
    fail(inserted.error, "Ik kon het document niet opslaan.");
  }
  for (const list of made.lists) {
    await insertList(supabase, userId, list.listTitle, list.items);
  }
  const updated = await supabase.from("captures").update({ status: "confirmed" }).eq("id", captureId);
  fail(updated.error, "Bevestigen lukte niet.");
}

export async function supabaseApplyLoose(actions: PlannedAction[]) {
  const { supabase, userId } = await client();
  const captureId = randomUUID();
  const insertedCapture = await supabase.from("captures").insert({
    id: captureId,
    user_id: userId,
    raw_text: actions[0]?.title || "Actie",
    summary: actions[0]?.title ?? null,
    interpreter: "local",
    status: "confirmed",
    category: "Assistent",
  });
  fail(insertedCapture.error, "Ik kon de actie niet opslaan.");
  const made = materialize(actions, captureId);
  if (made.items.length) {
    const inserted = await supabase.from("items").insert(
      made.items.map((item) => ({
        user_id: userId,
        capture_id: captureId,
        kind: item.kind,
        title: item.title,
        notes: item.notes,
        due_at: item.dueAt,
        remind_at: item.remindAt,
        status: "open",
        priority: item.priority,
        category: item.category,
        location: item.location,
        recurrence: item.recurrence,
      })),
    );
    fail(inserted.error, "Ik kon de actie niet opslaan.");
  }
  for (const list of made.lists) await insertList(supabase, userId, list.listTitle, list.items);
  return captureId;
}

async function insertList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  title: string,
  titles: string[],
) {
  const { data: existing } = await supabase.from("lists").select("id").ilike("title", title).limit(1).maybeSingle();
  let listId = existing?.id as string | undefined;
  if (!listId) {
    const created = await supabase.from("lists").insert({ user_id: userId, title }).select("id").single();
    fail(created.error, "Ik kon de lijst niet maken.");
    if (!created.data) throw new Error("Ik kon de lijst niet maken.");
    listId = created.data.id;
  }
  const { count } = await supabase.from("list_items").select("id", { count: "exact", head: true }).eq("list_id", listId);
  const inserted = await supabase.from("list_items").insert(
    titles.map((itemTitle, index) => ({
      list_id: listId,
      user_id: userId,
      title: itemTitle,
      position: (count ?? 0) + index,
    })),
  );
  fail(inserted.error, "Ik kon de lijst niet bijwerken.");
}

export async function supabaseInbox(): Promise<InboxRow[]> {
  const { supabase } = await client();
  const { data, error } = await supabase
    .from("captures")
    .select("id, raw_text, summary, status, created_at, category, file_name, input_kind, archived_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  fail(error, "Ik kon je inbox niet openen.");
  return (data ?? []).map((row) => ({
    id: row.id,
    rawText: row.raw_text,
    summary: row.summary,
    status: row.status,
    createdAt: row.created_at,
    category: row.category,
    fileName: row.file_name,
    inputKind: row.input_kind ?? "text",
    archivedAt: row.archived_at,
  }));
}

export async function supabaseArchive(ids: string[]) {
  const { supabase } = await client();
  const { error } = await supabase
    .from("captures")
    .update({ archived_at: new Date().toISOString() })
    .in("id", ids);
  fail(error, "Archiveren lukte niet.");
}

const ITEM_COLUMNS =
  "id, capture_id, kind, title, notes, due_at, remind_at, status, created_at, priority, category, location, recurrence, snoozed_until, parent_id";

export async function supabaseItems(): Promise<KlaroItem[]> {
  const { supabase } = await client();
  const { data, error } = await supabase.from("items").select(ITEM_COLUMNS).order("created_at", { ascending: false }).limit(400);
  fail(error, "Ik kon je taken niet openen.");
  return ((data ?? []) as ItemRow[]).map(mapItem);
}

export async function supabasePatchItem(
  id: string,
  patch: Partial<Pick<KlaroItem, "title" | "notes" | "status" | "priority" | "dueAt" | "remindAt" | "snoozedUntil">>,
) {
  const { supabase } = await client();
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.dueAt !== undefined) row.due_at = patch.dueAt;
  if (patch.remindAt !== undefined) row.remind_at = patch.remindAt;
  if (patch.snoozedUntil !== undefined) row.snoozed_until = patch.snoozedUntil;
  const { error } = await supabase.from("items").update(row).eq("id", id);
  fail(error, "Bijwerken lukte niet.");
}

export async function supabaseFinish(id: string) {
  const { supabase, userId } = await client();
  const { data, error } = await supabase.from("items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  fail(error, "Niet gevonden.");
  if (!data || data.status !== "open") throw new Error("Niet gevonden.");
  const updated = await supabase.from("items").update({ status: "done" }).eq("id", id);
  fail(updated.error, "Afronden lukte niet.");
  const item = mapItem(data as ItemRow);
  const stamp = item.remindAt ?? item.dueAt;
  if (item.recurrence && stamp) {
    const next = nextRecurrence(stamp, item.recurrence);
    if (next) {
      const inserted = await supabase.from("items").insert({
        user_id: userId,
        capture_id: item.captureId,
        kind: item.kind,
        title: item.title,
        notes: item.notes,
        due_at: item.dueAt ? next : null,
        remind_at: item.remindAt ? next : null,
        status: "open",
        priority: item.priority ?? "normaal",
        category: item.category,
        location: item.location,
        recurrence: item.recurrence,
        parent_id: item.parentId,
      });
      fail(inserted.error, "De volgende herhaling kon niet worden gezet.");
    }
  }
}

export async function supabaseDocuments(): Promise<DocumentRow[]> {
  const { supabase } = await client();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, category, summary, supplier, amount_cents, reference_code, due_on, starts_on, ends_on, file_name, mime_type, text_content, created_at, file_path")
    .order("created_at", { ascending: false })
    .limit(200);
  fail(error, "Ik kon je documenten niet openen.");
  return (data ?? []).map(mapDocument);
}

export async function supabaseDocument(id: string) {
  const rows = await supabaseDocuments();
  return rows.find((row) => row.id === id) ?? null;
}

function mapDocument(row: {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  supplier: string | null;
  amount_cents: number | null;
  reference_code: string | null;
  due_on: string | null;
  starts_on: string | null;
  ends_on: string | null;
  file_name: string | null;
  mime_type: string | null;
  text_content: string | null;
  created_at: string;
  file_path: string | null;
}): DocumentRow {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    summary: row.summary,
    supplier: row.supplier,
    amountCents: row.amount_cents,
    referenceCode: row.reference_code,
    dueOn: row.due_on,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    fileName: row.file_name,
    mimeType: row.mime_type,
    textContent: row.text_content,
    createdAt: row.created_at,
    hasFile: Boolean(row.file_path),
  };
}

export async function supabaseUpdateDocument(
  id: string,
  patch: Partial<Pick<DocumentRow, "title" | "category" | "supplier" | "amountCents" | "dueOn" | "summary">>,
) {
  const { supabase } = await client();
  const { error } = await supabase
    .from("documents")
    .update({
      title: patch.title,
      category: patch.category,
      supplier: patch.supplier,
      amount_cents: patch.amountCents,
      due_on: patch.dueOn,
      summary: patch.summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  fail(error, "Het document kon niet worden bijgewerkt.");
}

export async function supabaseFileUrl(id: string) {
  const { supabase } = await client();
  const { data } = await supabase.from("documents").select("file_path, file_name, mime_type").eq("id", id).maybeSingle();
  let path = data?.file_path as string | null;
  let fileName = (data?.file_name as string | null) ?? "bestand";
  let mimeType = (data?.mime_type as string | null) ?? "application/octet-stream";
  if (!path) {
    const capture = await supabase.from("captures").select("file_path, file_name, mime_type").eq("id", id).maybeSingle();
    path = capture.data?.file_path ?? null;
    fileName = capture.data?.file_name ?? fileName;
    mimeType = capture.data?.mime_type ?? mimeType;
  }
  if (!path) return null;
  const signed = await supabase.storage.from("klaro").createSignedUrl(path, 120);
  fail(signed.error, "Het bestand kon niet worden geopend.");
  if (!signed.data?.signedUrl) throw new Error("Het bestand kon niet worden geopend.");
  return { url: signed.data.signedUrl, fileName, mimeType };
}

export async function supabaseLists(): Promise<ListRow[]> {
  const { supabase } = await client();
  const { data: lists, error } = await supabase.from("lists").select("id, title, created_at").order("created_at", { ascending: false });
  fail(error, "Ik kon je lijsten niet openen.");
  const { data: items, error: itemError } = await supabase
    .from("list_items")
    .select("id, list_id, title, done, position")
    .order("position");
  fail(itemError, "Ik kon je lijsten niet openen.");
  return (lists ?? []).map((list) => {
    const rows = (items ?? []).filter((item) => item.list_id === list.id);
    return {
      id: list.id,
      title: list.title,
      createdAt: list.created_at,
      openCount: rows.filter((item) => !item.done).length,
      items: rows.map((item) => ({ id: item.id, title: item.title, done: item.done, position: item.position })),
    };
  });
}

export async function supabaseList(id: string) {
  const lists = await supabaseLists();
  return lists.find((list) => list.id === id) ?? null;
}

export async function supabaseToggleListItem(id: string, done: boolean) {
  const { supabase } = await client();
  const { error } = await supabase.from("list_items").update({ done }).eq("id", id);
  fail(error, "Bijwerken lukte niet.");
}

export async function supabaseAddListItem(listId: string, title: string) {
  const { supabase, userId } = await client();
  const { count } = await supabase.from("list_items").select("id", { count: "exact", head: true }).eq("list_id", listId);
  const { error } = await supabase.from("list_items").insert({
    list_id: listId,
    user_id: userId,
    title,
    position: count ?? 0,
  });
  fail(error, "Toevoegen lukte niet.");
}

export async function supabaseThreads() {
  const { supabase } = await client();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });
  fail(error, "Ik kon je gesprekken niet openen.");
  return (data ?? []).map((row) => ({ id: row.id as string, title: row.title as string, updatedAt: row.updated_at as string }));
}

export async function supabaseThread(id: string) {
  const { supabase } = await client();
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("id", id)
    .maybeSingle();
  fail(error, "Gesprek niet gevonden.");
  if (!conversation) return null;
  const { data: messages, error: messageError } = await supabase
    .from("messages")
    .select("id, role, content, context, created_at")
    .eq("conversation_id", id)
    .order("created_at");
  fail(messageError, "Gesprek niet gevonden.");
  return {
    id: conversation.id as string,
    title: conversation.title as string,
    updatedAt: conversation.updated_at as string,
    messages: (messages ?? []).map(
      (message): ThreadMessage => ({
        id: message.id,
        role: message.role,
        content: message.content,
        context: message.context,
        createdAt: message.created_at,
      }),
    ),
  };
}

export async function supabaseEnsureThread(id: string | null, title: string) {
  const { supabase, userId } = await client();
  if (id) {
    const existing = await supabase.from("conversations").select("id").eq("id", id).maybeSingle();
    if (existing.data?.id) return existing.data.id as string;
  }
  const created = await supabase
    .from("conversations")
    .insert({ user_id: userId, title: title.slice(0, 120) })
    .select("id")
    .single();
  fail(created.error, "Ik kon het gesprek niet starten.");
  if (!created.data) throw new Error("Ik kon het gesprek niet starten.");
  return created.data.id as string;
}

export async function supabaseAddMessage(input: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  context: unknown;
}) {
  const { supabase, userId } = await client();
  const inserted = await supabase.from("messages").insert({
    conversation_id: input.conversationId,
    user_id: userId,
    role: input.role,
    content: input.content.slice(0, 8000),
    context: input.context,
  });
  fail(inserted.error, "Het bericht kon niet worden bewaard.");
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", input.conversationId);
}

export async function supabaseDeleteThread(id: string) {
  const { supabase } = await client();
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  fail(error, "Verwijderen lukte niet.");
}

export async function supabaseNoticeStates() {
  const { supabase } = await client();
  const { data, error } = await supabase.from("notification_states").select("source_key, status, snoozed_until");
  fail(error, "Meldingen konden niet worden geladen.");
  return (data ?? []).map((row) => ({
    sourceKey: row.source_key as string,
    status: row.status as "read" | "dismissed" | "snoozed",
    snoozedUntil: row.snoozed_until as string | null,
  }));
}

export async function supabaseSetNotice(sourceKey: string, status: "read" | "dismissed" | "snoozed", snoozedUntil: string | null) {
  const { supabase, userId } = await client();
  const { error } = await supabase.from("notification_states").upsert({
    user_id: userId,
    source_key: sourceKey,
    status,
    snoozed_until: snoozedUntil,
  });
  fail(error, "De melding kon niet worden bijgewerkt.");
}

export async function supabaseSaveProfile(patch: {
  displayName?: string | null;
  timezone?: string;
  preferences?: Preferences;
  onboardedAt?: string | null;
}) {
  const { supabase, userId } = await client();
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.preferences) row.preferences = { ...defaultPreferences, ...patch.preferences };
  if (patch.onboardedAt !== undefined) row.onboarded_at = patch.onboardedAt;
  const { error } = await supabase.from("profiles").update(row).eq("id", userId);
  fail(error, "Opslaan lukte niet.");
}

export async function supabaseErase() {
  const { supabase } = await client();
  const { error } = await supabase.rpc("delete_own_account");
  fail(error, "Je account kon niet worden verwijderd.");
}

export async function supabaseAddSubtask(parentId: string, title: string) {
  const { supabase, userId } = await client();
  const parent = await supabase.from("items").select("capture_id").eq("id", parentId).maybeSingle();
  const { error } = await supabase.from("items").insert({
    user_id: userId,
    capture_id: parent.data?.capture_id ?? null,
    parent_id: parentId,
    kind: "taak",
    title,
    status: "open",
    priority: "normaal",
  });
  fail(error, "De subtaak kon niet worden toegevoegd.");
}
