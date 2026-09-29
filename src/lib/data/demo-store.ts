import "server-only";

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";

import type {
  AuthResult,
  Capture,
  ConfirmedItem,
  KlaroItem,
  NewItem,
  Profile,
} from "@/lib/domain";

const COOKIE = "klaro_demo_session";
const FILE = path.join(process.cwd(), ".data", "demo-store.json");

type DemoUser = {
  id: string;
  email: string;
  displayName: string | null;
  passwordHash: string;
  passwordSalt: string;
};

type DemoSession = {
  id: string;
  userId: string;
  createdAt: string;
};

type StoredCapture = Capture & { userId: string };
type StoredItem = KlaroItem & { userId: string };

type State = {
  users: DemoUser[];
  sessions: DemoSession[];
  captures: StoredCapture[];
  items: StoredItem[];
};

let chain: Promise<unknown> = Promise.resolve();

function readState(): State {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Partial<State>;
    return {
      users: parsed.users ?? [],
      sessions: parsed.sessions ?? [],
      captures: parsed.captures ?? [],
      items: parsed.items ?? [],
    };
  } catch {
    return { users: [], sessions: [], captures: [], items: [] };
  }
}

function writeState(state: State) {
  mkdirSync(path.dirname(FILE), { recursive: true });
  const temp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(state));
  renameSync(temp, FILE);
}

function withState<T>(fn: (state: State) => Promise<T> | T): Promise<T> {
  const run = chain.then(async () => {
    const state = readState();
    const result = await fn(state);
    writeState(state);
    return result;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 32).toString("hex");
}

function passwordsMatch(password: string, user: DemoUser) {
  const actual = Buffer.from(hashPassword(password, user.passwordSalt), "hex");
  const expected = Buffer.from(user.passwordHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  };
}

async function currentUser(state: State) {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE)?.value;
  if (!sessionId) return null;
  const session = state.sessions.find((entry) => entry.id === sessionId);
  if (!session) return null;
  return state.users.find((user) => user.id === session.userId) ?? null;
}

function toProfile(user: DemoUser): Profile {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

function publicItem(item: StoredItem): KlaroItem {
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
  };
}

function publicCapture(capture: StoredCapture): Capture {
  return {
    id: capture.id,
    rawText: capture.rawText,
    summary: capture.summary,
    interpreter: capture.interpreter,
    status: capture.status,
    createdAt: capture.createdAt,
  };
}

function requireOwnedCapture(state: State, userId: string, captureId: string) {
  const capture = state.captures.find((entry) => entry.id === captureId && entry.userId === userId);
  if (!capture) throw new Error("Niet gevonden.");
  return capture;
}

export async function demoGetProfile(): Promise<Profile | null> {
  return withState(async (state) => {
    const user = await currentUser(state);
    return user ? toProfile(user) : null;
  });
}

export async function demoSignUp(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  return withState(async (state) => {
    if (state.users.some((user) => user.email === email)) {
      return { ok: false, error: "Er bestaat al een account met dit e-mailadres." };
    }

    const salt = randomBytes(16).toString("hex");
    const user: DemoUser = {
      id: randomUUID(),
      email,
      displayName: input.displayName?.trim() || null,
      passwordSalt: salt,
      passwordHash: hashPassword(input.password, salt),
    };
    const session: DemoSession = {
      id: randomUUID(),
      userId: user.id,
      createdAt: new Date().toISOString(),
    };
    state.users.push(user);
    state.sessions.push(session);
    const jar = await cookies();
    jar.set(COOKIE, session.id, cookieOptions());
    return { ok: true };
  });
}

export async function demoSignIn(input: { email: string; password: string }): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  return withState(async (state) => {
    const user = state.users.find((entry) => entry.email === email);
    if (!user || !passwordsMatch(input.password, user)) {
      return { ok: false, error: "Onjuist e-mailadres of wachtwoord." };
    }
    const session: DemoSession = {
      id: randomUUID(),
      userId: user.id,
      createdAt: new Date().toISOString(),
    };
    state.sessions.push(session);
    const jar = await cookies();
    jar.set(COOKIE, session.id, cookieOptions());
    return { ok: true };
  });
}

export async function demoSignOut() {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE)?.value;
  if (sessionId) {
    await withState((state) => {
      state.sessions = state.sessions.filter((session) => session.id !== sessionId);
    });
  }
  jar.delete(COOKIE);
}

export async function demoInsertCapture(rawText: string): Promise<Capture> {
  return withState(async (state) => {
    const user = await currentUser(state);
    if (!user) throw new Error("Niet ingelogd.");
    const capture: StoredCapture = {
      id: randomUUID(),
      userId: user.id,
      rawText,
      summary: null,
      interpreter: null,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    state.captures.push(capture);
    return publicCapture(capture);
  });
}

export async function demoUpdateCapture(
  id: string,
  patch: Partial<Pick<Capture, "summary" | "interpreter">>,
) {
  await withState(async (state) => {
    const user = await currentUser(state);
    if (!user) throw new Error("Niet ingelogd.");
    const capture = requireOwnedCapture(state, user.id, id);
    if (patch.summary !== undefined) capture.summary = patch.summary;
    if (patch.interpreter !== undefined) capture.interpreter = patch.interpreter;
  });
}

export async function demoGetCapture(id: string): Promise<Capture | null> {
  return withState(async (state) => {
    const user = await currentUser(state);
    if (!user) return null;
    const capture = state.captures.find((entry) => entry.id === id && entry.userId === user.id);
    return capture ? publicCapture(capture) : null;
  });
}

export async function demoInsertItems(captureId: string, items: NewItem[]): Promise<KlaroItem[]> {
  return withState(async (state) => {
    const user = await currentUser(state);
    if (!user) throw new Error("Niet ingelogd.");
    requireOwnedCapture(state, user.id, captureId);
    const created: StoredItem[] = items.map((item) => ({
      id: randomUUID(),
      captureId,
      userId: user.id,
      kind: item.kind,
      title: item.title,
      notes: item.notes,
      dueAt: item.dueAt,
      remindAt: item.remindAt,
      status: "proposed",
      createdAt: new Date().toISOString(),
    }));
    state.items.push(...created);
    return created.map(publicItem);
  });
}

export async function demoListItemsByCapture(captureId: string): Promise<KlaroItem[]> {
  return withState(async (state) => {
    const user = await currentUser(state);
    if (!user) return [];
    return state.items
      .filter((item) => item.userId === user.id && item.captureId === captureId)
      .map(publicItem);
  });
}

export async function demoListOpenItems(): Promise<KlaroItem[]> {
  return withState(async (state) => {
    const user = await currentUser(state);
    if (!user) return [];
    return state.items
      .filter((item) => item.userId === user.id && item.status === "open")
      .map(publicItem);
  });
}

export async function demoCompleteItem(id: string) {
  await withState(async (state) => {
    const user = await currentUser(state);
    const item = state.items.find((entry) => entry.id === id && entry.userId === user?.id);
    if (!item || item.status !== "open") throw new Error("Niet gevonden.");
    item.status = "done";
  });
}

export async function demoDismissCapture(id: string) {
  await withState(async (state) => {
    const user = await currentUser(state);
    if (!user) throw new Error("Niet ingelogd.");
    const capture = requireOwnedCapture(state, user.id, id);
    if (capture.status !== "pending") throw new Error("Deze invoer is al afgehandeld.");
    capture.status = "dismissed";
    for (const item of state.items) {
      if (item.captureId === id && item.userId === user.id && item.status === "proposed") {
        item.status = "dismissed";
      }
    }
  });
}

export async function demoConfirmCapture(captureId: string, items: ConfirmedItem[]) {
  await withState(async (state) => {
    const user = await currentUser(state);
    if (!user) throw new Error("Niet ingelogd.");
    const capture = requireOwnedCapture(state, user.id, captureId);
    if (capture.status !== "pending") {
      throw new Error("Deze invoer kan niet meer bevestigd worden.");
    }

    const seen = new Set<string>();
    for (const item of items) {
      const existing = item.id
        ? state.items.find(
            (entry) =>
              entry.id === item.id && entry.captureId === captureId && entry.userId === user.id,
          )
        : undefined;

      if (existing) {
        existing.kind = item.kind;
        existing.title = item.title;
        existing.notes = item.notes;
        existing.dueAt = item.dueAt;
        existing.remindAt = item.remindAt;
        existing.status = "open";
        seen.add(existing.id);
      } else {
        state.items.push({
          id: randomUUID(),
          captureId,
          userId: user.id,
          kind: item.kind,
          title: item.title,
          notes: item.notes,
          dueAt: item.dueAt,
          remindAt: item.remindAt,
          status: "open",
          createdAt: new Date().toISOString(),
        });
      }
    }

    for (const item of state.items) {
      if (
        item.captureId === captureId &&
        item.userId === user.id &&
        item.status === "proposed" &&
        !seen.has(item.id)
      ) {
        item.status = "dismissed";
      }
    }

    capture.status = "confirmed";
  });
}
