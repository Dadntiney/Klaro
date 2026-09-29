import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";

import type { KlaroItem, Preferences } from "@/lib/domain";
import { defaultPreferences } from "@/lib/domain";
import type { LifePlan, PlannedAction } from "@/lib/life/plan";
import { materialize, nextRecurrence } from "@/lib/life/materialize";
import {
  demoCurrentUser,
  withDemoState,
  type DemoConversation,
  type DemoDocument,
  type DemoMessage,
  type DemoState,
} from "@/lib/data/demo-store";

const FILES = path.join(process.cwd(), ".data", "files");

export type InboxRow = {
  id: string;
  rawText: string;
  summary: string | null;
  status: string;
  createdAt: string;
  category: string | null;
  fileName: string | null;
  inputKind: string;
  archivedAt: string | null;
};

export type DocumentRow = {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  supplier: string | null;
  amountCents: number | null;
  referenceCode: string | null;
  dueOn: string | null;
  startsOn: string | null;
  endsOn: string | null;
  fileName: string | null;
  mimeType: string | null;
  textContent: string | null;
  createdAt: string;
  hasFile: boolean;
};

export type ListRow = {
  id: string;
  title: string;
  createdAt: string;
  openCount: number;
  items: Array<{ id: string; title: string; done: boolean; position: number }>;
};

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  context: unknown;
  createdAt: string;
};

async function actor(state: DemoState) {
  const user = await demoCurrentUser(state);
  if (!user) throw new Error("Niet ingelogd.");
  return user;
}

function mapItem(item: DemoState["items"][number]): KlaroItem {
  return {
    id: item.id,
    captureId: item.captureId,
    kind: item.kind,
    title: item.title,
    notes: item.notes,
    dueAt: item.dueAt,
    remindAt: item.remindAt,
    status: item.status,
    createdAt: item.createdAt,
    priority: item.priority ?? "normaal",
    category: item.category ?? null,
    location: item.location ?? null,
    recurrence: item.recurrence ?? null,
    snoozedUntil: item.snoozedUntil ?? null,
    parentId: item.parentId ?? null,
  };
}

function mapDocument(document: DemoDocument): DocumentRow {
  return {
    id: document.id,
    title: document.title,
    category: document.category,
    summary: document.summary,
    supplier: document.supplier,
    amountCents: document.amountCents,
    referenceCode: document.referenceCode,
    dueOn: document.dueOn,
    startsOn: document.startsOn,
    endsOn: document.endsOn,
    fileName: document.fileName,
    mimeType: document.mimeType,
    textContent: document.textContent,
    createdAt: document.createdAt,
    hasFile: Boolean(document.filePath),
  };
}

export async function demoCreateIncoming(input: {
  text: string;
  plan: LifePlan;
  category: string | null;
  inputKind: string;
  file: { name: string; type: string; bytes: Uint8Array } | null;
}) {
  return withDemoState(async (state) => {
    const user = await actor(state);
    const id = randomUUID();
    let filePath: string | null = null;
    if (input.file) {
      const safe = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
      const relative = path.join(user.id, `${id}-${safe}`);
      const absolute = path.join(FILES, relative);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, input.file.bytes);
      filePath = absolute;
    }
    state.captures.push({
      id,
      userId: user.id,
      rawText: input.text || input.file?.name || "Bijlage",
      summary: input.plan.summary,
      interpreter: input.plan.source,
      status: "pending",
      createdAt: new Date().toISOString(),
      inputKind: input.inputKind,
      fileName: input.file?.name ?? null,
      filePath,
      mimeType: input.file?.type ?? null,
      category: input.category,
      proposal: input.plan,
      archivedAt: null,
    });
    return id;
  });
}

export async function demoGetIncoming(id: string) {
  return withDemoState(async (state) => {
    const user = await actor(state);
    const capture = state.captures.find((entry) => entry.id === id && entry.userId === user.id);
    if (!capture) return null;
    return capture;
  });
}

export async function demoApply(captureId: string, actions: PlannedAction[]) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    const capture = state.captures.find((entry) => entry.id === captureId && entry.userId === user.id);
    if (!capture || capture.status !== "pending") throw new Error("Deze invoer is al afgehandeld.");
    const made = materialize(actions, captureId);
    for (const item of made.items) {
      state.items.push({
        id: randomUUID(),
        userId: user.id,
        captureId,
        kind: item.kind,
        title: item.title,
        notes: item.notes,
        dueAt: item.dueAt,
        remindAt: item.remindAt,
        status: "open",
        createdAt: new Date().toISOString(),
        priority: item.priority,
        category: item.category,
        location: item.location,
        recurrence: item.recurrence,
        snoozedUntil: null,
        parentId: null,
      });
    }
    for (const document of made.documents) {
      state.documents.push({
        ...document,
        id: randomUUID(),
        userId: user.id,
        captureId,
        filePath: capture.filePath ?? null,
        fileName: capture.fileName ?? null,
        mimeType: capture.mimeType ?? null,
        textContent: capture.rawText,
        createdAt: new Date().toISOString(),
      });
    }
    for (const list of made.lists) addListItems(state, user.id, list.listTitle, list.items);
    capture.status = "confirmed";
  });
}

export async function demoApplyLoose(actions: PlannedAction[]) {
  return withDemoState(async (state) => {
    const user = await actor(state);
    const captureId = randomUUID();
    state.captures.push({
      id: captureId,
      userId: user.id,
      rawText: actions[0]?.title || "Actie",
      summary: actions[0]?.title ?? null,
      interpreter: "local",
      status: "confirmed",
      createdAt: new Date().toISOString(),
      category: "Assistent",
      proposal: null,
    });
    const made = materialize(actions, captureId);
    for (const item of made.items) {
      state.items.push({
        id: randomUUID(),
        userId: user.id,
        captureId,
        kind: item.kind,
        title: item.title,
        notes: item.notes,
        dueAt: item.dueAt,
        remindAt: item.remindAt,
        status: "open",
        createdAt: new Date().toISOString(),
        priority: item.priority,
        category: item.category,
        location: item.location,
        recurrence: item.recurrence,
      });
    }
    for (const document of made.documents) {
      state.documents.push({
        ...document,
        id: randomUUID(),
        userId: user.id,
        captureId,
        filePath: null,
        fileName: null,
        mimeType: null,
        textContent: null,
        createdAt: new Date().toISOString(),
      });
    }
    for (const list of made.lists) addListItems(state, user.id, list.listTitle, list.items);
    return captureId;
  });
}

function addListItems(state: DemoState, userId: string, title: string, titles: string[]) {
  let list = state.lists.find(
    (entry) => entry.userId === userId && entry.title.toLowerCase() === title.toLowerCase(),
  );
  if (!list) {
    list = { id: randomUUID(), userId, title, createdAt: new Date().toISOString() };
    state.lists.push(list);
  }
  const start = state.listItems.filter((item) => item.listId === list.id).length;
  titles.forEach((itemTitle, index) => {
    state.listItems.push({
      id: randomUUID(),
      listId: list.id,
      userId,
      title: itemTitle,
      done: false,
      position: start + index,
      createdAt: new Date().toISOString(),
    });
  });
}

export async function demoInbox(): Promise<InboxRow[]> {
  return withDemoState(async (state) => {
    const user = await actor(state);
    return state.captures
      .filter((entry) => entry.userId === user.id && !entry.archivedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((entry) => ({
        id: entry.id,
        rawText: entry.rawText,
        summary: entry.summary,
        status: entry.status,
        createdAt: entry.createdAt,
        category: entry.category ?? null,
        fileName: entry.fileName ?? null,
        inputKind: entry.inputKind ?? "text",
        archivedAt: entry.archivedAt ?? null,
      }));
  });
}

export async function demoArchive(ids: string[]) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    for (const capture of state.captures) {
      if (capture.userId === user.id && ids.includes(capture.id)) {
        capture.archivedAt = new Date().toISOString();
      }
    }
  });
}

export async function demoItems(): Promise<KlaroItem[]> {
  return withDemoState(async (state) => {
    const user = await actor(state);
    return state.items.filter((item) => item.userId === user.id).map(mapItem);
  });
}

export async function demoPatchItem(
  id: string,
  patch: Partial<Pick<KlaroItem, "title" | "notes" | "status" | "priority" | "dueAt" | "remindAt" | "snoozedUntil">>,
) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    const item = state.items.find((entry) => entry.id === id && entry.userId === user.id);
    if (!item) throw new Error("Niet gevonden.");
    Object.assign(item, patch);
  });
}

export async function demoFinish(id: string) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    const item = state.items.find((entry) => entry.id === id && entry.userId === user.id);
    if (!item || item.status !== "open") throw new Error("Niet gevonden.");
    item.status = "done";
    const stamp = item.remindAt ?? item.dueAt;
    if (item.recurrence && stamp) {
      const next = nextRecurrence(stamp, item.recurrence);
      if (next) {
        state.items.push({
          ...item,
          id: randomUUID(),
          status: "open",
          dueAt: item.dueAt ? next : null,
          remindAt: item.remindAt ? next : item.dueAt ? next : null,
          snoozedUntil: null,
          createdAt: new Date().toISOString(),
        });
      }
    }
  });
}

export async function demoDocuments(): Promise<DocumentRow[]> {
  return withDemoState(async (state) => {
    const user = await actor(state);
    return state.documents
      .filter((document) => document.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(mapDocument);
  });
}

export async function demoDocument(id: string) {
  return withDemoState(async (state) => {
    const user = await actor(state);
    const document = state.documents.find((entry) => entry.id === id && entry.userId === user.id);
    return document ? mapDocument(document) : null;
  });
}

export async function demoUpdateDocument(
  id: string,
  patch: Partial<Pick<DocumentRow, "title" | "category" | "supplier" | "amountCents" | "dueOn" | "summary">>,
) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    const document = state.documents.find((entry) => entry.id === id && entry.userId === user.id);
    if (!document) throw new Error("Niet gevonden.");
    Object.assign(document, patch);
  });
}

export async function demoReadFile(id: string) {
  return withDemoState(async (state) => {
    const user = await actor(state);
    const document = state.documents.find((entry) => entry.id === id && entry.userId === user.id);
    const capture = state.captures.find((entry) => entry.id === id && entry.userId === user.id);
    const filePath = document?.filePath ?? capture?.filePath;
    const fileName = document?.fileName ?? capture?.fileName ?? "bestand";
    const mimeType = document?.mimeType ?? capture?.mimeType ?? "application/octet-stream";
    if (!filePath || !filePath.startsWith(FILES)) return null;
    return { bytes: readFileSync(filePath), fileName, mimeType };
  });
}

export async function demoLists(): Promise<ListRow[]> {
  return withDemoState(async (state) => {
    const user = await actor(state);
    return listsFor(state, user.id);
  });
}

export async function demoList(id: string) {
  return withDemoState(async (state) => {
    const user = await actor(state);
    return listsFor(state, user.id).find((list) => list.id === id) ?? null;
  });
}

function listsFor(state: DemoState, userId: string): ListRow[] {
  return state.lists
    .filter((list) => list.userId === userId)
    .map((list) => ({
      id: list.id,
      title: list.title,
      createdAt: list.createdAt,
      openCount: state.listItems.filter((item) => item.listId === list.id && !item.done).length,
      items: state.listItems
        .filter((item) => item.listId === list.id && item.userId === userId)
        .sort((a, b) => a.position - b.position)
        .map((item) => ({ id: item.id, title: item.title, done: item.done, position: item.position })),
    }));
}

export async function demoToggleListItem(id: string, done: boolean) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    const item = state.listItems.find((entry) => entry.id === id && entry.userId === user.id);
    if (!item) throw new Error("Niet gevonden.");
    item.done = done;
  });
}

export async function demoAddListItem(listId: string, title: string) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    const list = state.lists.find((entry) => entry.id === listId && entry.userId === user.id);
    if (!list) throw new Error("Niet gevonden.");
    const position = state.listItems.filter((item) => item.listId === listId).length;
    state.listItems.push({
      id: randomUUID(),
      listId,
      userId: user.id,
      title,
      done: false,
      position,
      createdAt: new Date().toISOString(),
    });
  });
}

export async function demoThreads() {
  return withDemoState(async (state) => {
    const user = await actor(state);
    return state.conversations
      .filter((entry) => entry.userId === user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(publicThread);
  });
}

export async function demoThread(id: string) {
  return withDemoState(async (state) => {
    const user = await actor(state);
    const conversation = state.conversations.find((entry) => entry.id === id && entry.userId === user.id);
    if (!conversation) return null;
    const messages = state.messages
      .filter((message) => message.conversationId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(publicMessage);
    return { ...publicThread(conversation), messages };
  });
}

export async function demoEnsureThread(id: string | null, title: string) {
  return withDemoState(async (state) => {
    const user = await actor(state);
    if (id) {
      const existing = state.conversations.find((entry) => entry.id === id && entry.userId === user.id);
      if (existing) return existing.id;
    }
    const created: DemoConversation = {
      id: randomUUID(),
      userId: user.id,
      title: title.slice(0, 120),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.conversations.push(created);
    return created.id;
  });
}

export async function demoAddMessage(input: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  context: unknown;
}) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    const conversation = state.conversations.find(
      (entry) => entry.id === input.conversationId && entry.userId === user.id,
    );
    if (!conversation) throw new Error("Gesprek niet gevonden.");
    const message: DemoMessage = {
      id: randomUUID(),
      conversationId: input.conversationId,
      userId: user.id,
      role: input.role,
      content: input.content.slice(0, 8000),
      context: input.context,
      createdAt: new Date().toISOString(),
    };
    state.messages.push(message);
    conversation.updatedAt = message.createdAt;
  });
}

export async function demoDeleteThread(id: string) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    state.conversations = state.conversations.filter((entry) => !(entry.id === id && entry.userId === user.id));
    state.messages = state.messages.filter((entry) => entry.conversationId !== id || entry.userId !== user.id);
  });
}

export async function demoNoticeStates() {
  return withDemoState(async (state) => {
    const user = await actor(state);
    return state.notices.filter((entry) => entry.userId === user.id);
  });
}

export async function demoSetNotice(sourceKey: string, status: "read" | "dismissed" | "snoozed", snoozedUntil: string | null) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    const existing = state.notices.find((entry) => entry.userId === user.id && entry.sourceKey === sourceKey);
    if (existing) {
      existing.status = status;
      existing.snoozedUntil = snoozedUntil;
    } else {
      state.notices.push({ userId: user.id, sourceKey, status, snoozedUntil });
    }
  });
}

export async function demoSaveProfile(patch: {
  displayName?: string | null;
  timezone?: string;
  preferences?: Preferences;
  onboardedAt?: string | null;
}) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    if (patch.displayName !== undefined) user.displayName = patch.displayName;
    if (patch.timezone) user.timezone = patch.timezone;
    if (patch.preferences) user.preferences = { ...defaultPreferences, ...user.preferences, ...patch.preferences };
    if (patch.onboardedAt !== undefined) user.onboardedAt = patch.onboardedAt;
  });
}

export async function demoErase() {
  const jar = await cookies();
  const sessionId = jar.get("klaro_demo_session")?.value;
  await withDemoState(async (state) => {
    const user = await actor(state);
    state.users = state.users.filter((entry) => entry.id !== user.id);
    state.sessions = state.sessions.filter((entry) => entry.userId !== user.id);
    state.captures = state.captures.filter((entry) => entry.userId !== user.id);
    state.items = state.items.filter((entry) => entry.userId !== user.id);
    state.documents = state.documents.filter((entry) => entry.userId !== user.id);
    state.lists = state.lists.filter((entry) => entry.userId !== user.id);
    state.listItems = state.listItems.filter((entry) => entry.userId !== user.id);
    state.conversations = state.conversations.filter((entry) => entry.userId !== user.id);
    state.messages = state.messages.filter((entry) => entry.userId !== user.id);
    state.notices = state.notices.filter((entry) => entry.userId !== user.id);
  });
  if (sessionId) jar.delete("klaro_demo_session");
}

function publicThread(conversation: DemoConversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
  };
}

function publicMessage(message: DemoMessage): ThreadMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    context: message.context,
    createdAt: message.createdAt,
  };
}

export async function demoAddSubtask(parentId: string, title: string) {
  await withDemoState(async (state) => {
    const user = await actor(state);
    const parent = state.items.find((entry) => entry.id === parentId && entry.userId === user.id);
    if (!parent) throw new Error("Niet gevonden.");
    state.items.push({
      id: randomUUID(),
      userId: user.id,
      captureId: parent.captureId,
      kind: "taak",
      title,
      notes: null,
      dueAt: null,
      remindAt: null,
      status: "open",
      createdAt: new Date().toISOString(),
      parentId,
      priority: "normaal",
    });
  });
}
