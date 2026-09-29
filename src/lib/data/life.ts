import "server-only";

import { planInput } from "@/lib/ai/plan-service";
import type { KlaroItem, Preferences } from "@/lib/domain";
import { backendMode } from "@/lib/env";
import type { LifePlan, PlanContext, PlannedAction } from "@/lib/life/plan";
import { buildNotices } from "@/lib/life/notices";
import { narrateDay } from "@/lib/life/narrate";
import { composeAnswer, searchRecords, type SearchRecord } from "@/lib/life/search";
import * as demo from "@/lib/data/life-demo";
import * as remote from "@/lib/data/life-supabase";

const OFF = "Klaro is nog niet gekoppeld aan Supabase. Zie .env.example.";

function gate() {
  const mode = backendMode();
  if (mode === "unconfigured") throw new Error(OFF);
  return mode;
}

export async function createIncoming(input: {
  text: string;
  plan: LifePlan;
  category: string | null;
  inputKind: string;
  file: { name: string; type: string; bytes: Uint8Array } | null;
}) {
  return gate() === "supabase" ? remote.supabaseCreateIncoming(input) : demo.demoCreateIncoming(input);
}

export async function getIncoming(id: string) {
  return gate() === "supabase" ? remote.supabaseGetIncoming(id) : demo.demoGetIncoming(id);
}

export async function acceptIncoming(id: string, actions: PlannedAction[]) {
  if (gate() === "supabase") await remote.supabaseApply(id, actions);
  else await demo.demoApply(id, actions);
}

export async function acceptLoose(actions: PlannedAction[]) {
  return gate() === "supabase" ? remote.supabaseApplyLoose(actions) : demo.demoApplyLoose(actions);
}

export async function listInbox() {
  return gate() === "supabase" ? remote.supabaseInbox() : demo.demoInbox();
}

export async function archiveInbox(ids: string[]) {
  if (!ids.length) return;
  if (gate() === "supabase") await remote.supabaseArchive(ids);
  else await demo.demoArchive(ids);
}

export async function listItems(): Promise<KlaroItem[]> {
  return gate() === "supabase" ? remote.supabaseItems() : demo.demoItems();
}

export async function patchItem(
  id: string,
  patch: Partial<Pick<KlaroItem, "title" | "notes" | "status" | "priority" | "dueAt" | "remindAt" | "snoozedUntil">>,
) {
  if (gate() === "supabase") await remote.supabasePatchItem(id, patch);
  else await demo.demoPatchItem(id, patch);
}

export async function finishItem(id: string) {
  if (gate() === "supabase") await remote.supabaseFinish(id);
  else await demo.demoFinish(id);
}

export async function listDocuments() {
  return gate() === "supabase" ? remote.supabaseDocuments() : demo.demoDocuments();
}

export async function getDocument(id: string) {
  return gate() === "supabase" ? remote.supabaseDocument(id) : demo.demoDocument(id);
}

export async function updateDocument(
  id: string,
  patch: Parameters<typeof demo.demoUpdateDocument>[1],
) {
  if (gate() === "supabase") await remote.supabaseUpdateDocument(id, patch);
  else await demo.demoUpdateDocument(id, patch);
}

export async function readStoredFile(id: string) {
  if (gate() === "supabase") return remote.supabaseFileUrl(id);
  return demo.demoReadFile(id);
}

export async function listLists() {
  return gate() === "supabase" ? remote.supabaseLists() : demo.demoLists();
}

export async function getList(id: string) {
  return gate() === "supabase" ? remote.supabaseList(id) : demo.demoList(id);
}

export async function toggleListItem(id: string, done: boolean) {
  if (gate() === "supabase") await remote.supabaseToggleListItem(id, done);
  else await demo.demoToggleListItem(id, done);
}

export async function addListItem(listId: string, title: string) {
  if (gate() === "supabase") await remote.supabaseAddListItem(listId, title);
  else await demo.demoAddListItem(listId, title);
}

export async function listThreads() {
  return gate() === "supabase" ? remote.supabaseThreads() : demo.demoThreads();
}

export async function getThread(id: string) {
  return gate() === "supabase" ? remote.supabaseThread(id) : demo.demoThread(id);
}

export async function removeThread(id: string) {
  if (gate() === "supabase") await remote.supabaseDeleteThread(id);
  else await demo.demoDeleteThread(id);
}

export async function addSubtask(parentId: string, title: string) {
  if (gate() === "supabase") await remote.supabaseAddSubtask(parentId, title);
  else await demo.demoAddSubtask(parentId, title);
}

export async function saveProfile(patch: {
  displayName?: string | null;
  timezone?: string;
  preferences?: Preferences;
  onboardedAt?: string | null;
}) {
  if (gate() === "supabase") await remote.supabaseSaveProfile(patch);
  else await demo.demoSaveProfile(patch);
}

export async function eraseAccount() {
  if (gate() === "supabase") await remote.supabaseErase();
  else await demo.demoErase();
}

export async function listNotices(preferences: Preferences) {
  const [items, documents, states] = await Promise.all([
    listItems(),
    listDocuments(),
    gate() === "supabase" ? remote.supabaseNoticeStates() : demo.demoNoticeStates(),
  ]);
  return buildNotices({
    items,
    documents,
    states,
    notifications: preferences.notifications,
    proactive: preferences.proactive,
  });
}

export async function setNotice(sourceKey: string, status: "read" | "dismissed" | "snoozed", snoozedUntil: string | null) {
  if (gate() === "supabase") await remote.supabaseSetNotice(sourceKey, status, snoozedUntil);
  else await demo.demoSetNotice(sourceKey, status, snoozedUntil);
}

export async function searchLibrary(query: string, scope: "today" | "tomorrow" | "general" | null) {
  const [items, documents, lists] = await Promise.all([listItems(), listDocuments(), listLists()]);
  const corpus = toCorpus(items, documents, lists);
  const hits = searchRecords(query, corpus);
  const narrative =
    scope === "today"
      ? narrateDay(items, new Date(), 0)
      : scope === "tomorrow"
        ? narrateDay(items, new Date(), 1)
        : null;
  return { hits, text: composeAnswer(query, hits, narrative) };
}

export async function converse(conversationId: string | null, text: string) {
  const existing = conversationId ? await getThread(conversationId) : null;
  const last = existing?.messages.filter((message) => message.role === "assistant").at(-1);
  const context = (last?.context ?? {}) as PlanContext;
  const plan = await planInput({ text }, new Date(), context);
  const title = text.slice(0, 80);
  const id =
    gate() === "supabase"
      ? await remote.supabaseEnsureThread(conversationId, title)
      : await demo.demoEnsureThread(conversationId, title);
  const add =
    gate() === "supabase"
      ? remote.supabaseAddMessage.bind(remote)
      : demo.demoAddMessage;
  await add({ conversationId: id, role: "user", content: text, context: null });

  if (plan.intent === "search") {
    const action = plan.actions[0];
    const answer = await searchLibrary(action?.payload.query || text, action?.payload.scope ?? null);
    const subject = answer.hits[0]?.title ?? null;
    await add({
      conversationId: id,
      role: "assistant",
      content: answer.text,
      context: { lastScope: action?.payload.scope ?? "general", lastTitle: subject, hits: answer.hits },
    });
    return { id, plan, answer: answer.text };
  }

  await add({
    conversationId: id,
    role: "assistant",
    content: plan.summary,
    context: { lastTitle: plan.actions[0]?.title ?? null, lastScope: null, plan },
  });
  return { id, plan, answer: plan.summary };
}

function toCorpus(
  items: KlaroItem[],
  documents: Awaited<ReturnType<typeof listDocuments>>,
  lists: Awaited<ReturnType<typeof listLists>>,
): SearchRecord[] {
  return [
    ...documents.map((document) => ({
      id: document.id,
      kind: "document" as const,
      title: document.title,
      body: [document.summary, document.supplier, document.textContent, document.category].filter(Boolean).join(" "),
      href: `/documenten/${document.id}`,
      amountCents: document.amountCents,
      category: document.category,
      dueOn: document.dueOn,
    })),
    ...items
      .filter((item) => item.status === "open" || item.status === "done")
      .map((item) => ({
        id: item.id,
        kind: item.kind === "notitie" ? ("notitie" as const) : item.kind === "afspraak" ? ("afspraak" as const) : item.kind === "herinnering" ? ("herinnering" as const) : ("taak" as const),
        title: item.title,
        body: [item.notes, item.category, item.location].filter(Boolean).join(" "),
        href: item.kind === "herinnering" ? "/herinneringen" : item.kind === "afspraak" ? "/agenda" : `/taken/${item.id}`,
        category: item.category,
        dueOn: (item.dueAt ?? item.remindAt)?.slice(0, 10) ?? null,
      })),
    ...lists.map((list) => ({
      id: list.id,
      kind: "lijst" as const,
      title: list.title,
      body: list.items.map((item) => item.title).join(" "),
      href: `/lijsten/${list.id}`,
      category: "lijst",
    })),
  ];
}

export function inboxCategory(plan: LifePlan) {
  const type = plan.actions[0]?.type;
  if (type === "SAVE_DOCUMENT") return "Document";
  if (type === "CREATE_REMINDER") return "Herinnering";
  if (type === "CREATE_EVENT") return "Afspraak";
  if (type === "CREATE_LIST_ITEM") return "Lijst";
  if (type === "CREATE_NOTE") return "Notitie";
  if (type === "SEARCH_DATA") return "Vraag";
  if (type === "CREATE_TASK") return "Taak";
  return "Inbox";
}
