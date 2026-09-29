"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { planInput } from "@/lib/ai/plan-service";
import { extractFileText, inputKindFor } from "@/lib/files/extract";
import { getProfile, signOutAccount } from "@/lib/data/repository";
import {
  acceptIncoming,
  acceptLoose,
  addListItem,
  addSubtask,
  archiveInbox,
  converse,
  createIncoming,
  eraseAccount,
  finishItem,
  inboxCategory,
  patchItem,
  removeThread,
  saveProfile,
  setNotice,
  toggleListItem,
  updateDocument,
} from "@/lib/data/life";
import { sanitizePlan, type LifePlan, type PlannedAction } from "@/lib/life/plan";
import { addDays, getZonedParts, zonedTimeToUtc } from "@/lib/time";

export type ActionState = { error?: string; notice?: string };

const planSchema = z.object({
  summary: z.string(),
  source: z.enum(["local", "openai"]),
  intent: z.enum(["create", "search", "unclear"]),
  actions: z.array(z.custom<PlannedAction>()).min(1).max(12),
});

export async function submitInputAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const text = String(formData.get("text") ?? "").trim();
  const file = formData.get("file");
  const upload = file instanceof File && file.size > 0 ? file : null;
  if (!text && !upload) return { error: "Schrijf iets, of voeg een bestand toe." };
  if (text.length > 4000) return { error: "Dit is te lang. Hou het onder de 4000 tekens." };
  if (upload && upload.size > 10 * 1024 * 1024) return { error: "Bestanden mogen maximaal 10 MB zijn." };

  try {
    const attachmentText = upload ? await extractFileText(upload) : null;
    const plan = await planInput({
      text,
      attachmentText,
      fileName: upload?.name ?? null,
    });
    if (plan.intent === "search") {
      const result = await converse(null, text || upload?.name || "Zoeken");
      redirect(`/assistent/${result.id}`);
    }
    const bytes = upload ? new Uint8Array(await upload.arrayBuffer()) : null;
    const captureId = await createIncoming({
      text,
      plan,
      category: inboxCategory(plan),
      inputKind: inputKindFor(upload),
      file: upload && bytes ? { name: upload.name, type: upload.type, bytes } : null,
    });
    const profile = await getProfile();
    const safeAuto =
      profile?.preferences.autoActions &&
      plan.actions.length > 0 &&
      plan.actions.every((action) => !action.requiresConfirmation && action.confidence >= 0.9 && action.type !== "ARCHIVE_ITEM");
    if (safeAuto) {
      await acceptIncoming(captureId, plan.actions);
      revalidatePath("/home");
      redirect("/home?gezet=1");
    }
    redirect(`/bevestigen/${captureId}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: "Ik kon dit helaas niet goed verwerken. Je kunt het opnieuw proberen of het handmatig opslaan." };
  }
}

export async function acceptPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const captureId = String(formData.get("captureId") ?? "");
  if (!z.string().uuid().safeParse(captureId).success) return { error: "Deze invoer bestaat niet." };
  const parsed = parsePlan(String(formData.get("plan") ?? ""));
  if (!parsed) return { error: "De bevestiging is onleesbaar." };
  try {
    await acceptIncoming(captureId, parsed.actions);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: "Er ging iets mis. Probeer het opnieuw." };
  }
  revalidatePath("/home");
  revalidatePath("/inbox");
  redirect("/home?gezet=1");
}

export async function acceptLooseAction(formData: FormData) {
  const parsed = parsePlan(String(formData.get("plan") ?? ""));
  if (!parsed) redirect("/assistent");
  try {
    await acceptLoose(parsed.actions);
  } catch {
    redirect("/assistent");
  }
  revalidatePath("/home");
  redirect("/home?gezet=1");
}

export async function archiveAction(formData: FormData) {
  const ids = formData
    .getAll("id")
    .map(String)
    .filter((id) => z.string().uuid().safeParse(id).success);
  try {
    await archiveInbox(ids);
  } catch {
    // Leave the inbox as it is when the update is rejected.
  }
  revalidatePath("/inbox");
}

export async function completeLifeItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (z.string().uuid().safeParse(id).success) {
    try {
      await finishItem(id);
    } catch {
      // The row stays open when the update is rejected.
    }
  }
  revalidatePath("/home");
  revalidatePath("/vandaag");
  revalidatePath("/taken");
  revalidatePath("/herinneringen");
}

export async function snoozeAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "hour");
  if (!z.string().uuid().safeParse(id).success) return;
  const now = new Date();
  const until =
    amount === "tomorrow"
      ? zonedTimeToUtc(
          addDays(getZonedParts(now), 1).year,
          addDays(getZonedParts(now), 1).month,
          addDays(getZonedParts(now), 1).day,
          9,
          0,
        ).toISOString()
      : new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  try {
    await patchItem(id, { snoozedUntil: until });
  } catch {
    return;
  }
  revalidatePath("/herinneringen");
}

export async function dismissItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return;
  try {
    await patchItem(id, { status: "dismissed" });
  } catch {
    return;
  }
  revalidatePath("/herinneringen");
  revalidatePath("/taken");
}

export async function remindDocumentAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 180);
  const dueOn = String(formData.get("dueOn") ?? "");
  if (!z.string().uuid().safeParse(id).success || !title || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return;
  const [year, month, day] = dueOn.split("-").map(Number);
  const remindAt = zonedTimeToUtc(year, month, day, 9, 0).toISOString();
  const label = `${title} betalen`;
  try {
    await acceptLoose(
      sanitizePlan({
        summary: "Reminder instellen",
        source: "local",
        intent: "create",
        actions: [
          {
            type: "CREATE_REMINDER",
            title: label,
            detail: null,
            confidence: 0.95,
            requiresConfirmation: false,
            payload: {
              title: label,
              notes: null,
              dueAt: null,
              remindAt,
              location: null,
              priority: "normaal",
              category: "factuur",
              recurrence: null,
              listTitle: null,
              listItems: [],
              query: null,
              scope: null,
              suggestion: false,
              document: null,
            },
          },
        ],
      }).actions,
    );
    await setNotice(`document:${id}`, "dismissed", null);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return;
  }
  revalidatePath("/home");
  revalidatePath("/herinneringen");
}

export async function noticeAction(formData: FormData) {
  const sourceKey = String(formData.get("sourceKey") ?? "").slice(0, 160);
  const status = String(formData.get("status") ?? "");
  if (!sourceKey || !["read", "dismissed", "snoozed"].includes(status)) return;
  const until =
    status === "snoozed" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
  try {
    await setNotice(sourceKey, status as "read" | "dismissed" | "snoozed", until);
  } catch {
    return;
  }
  revalidatePath("/home");
}

export async function settingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const displayName = String(formData.get("displayName") ?? "").trim().slice(0, 80);
  const timezone = String(formData.get("timezone") ?? "Europe/Amsterdam").slice(0, 80);
  const preferences: Preferences = {
    autoActions: formData.get("autoActions") === "on",
    proactive: formData.get("proactive") === "on",
    notifications: formData.get("notifications") === "on",
  };
  try {
    await saveProfile({ displayName: displayName || null, timezone, preferences });
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: "Er ging iets mis. Probeer het opnieuw." };
  }
  revalidatePath("/instellingen");
  revalidatePath("/home");
  return { notice: "Opgeslagen." };
}

export async function onboardAction(formData: FormData) {
  const displayName = String(formData.get("displayName") ?? "").trim().slice(0, 80);
  try {
    await saveProfile({
      displayName: displayName || null,
      onboardedAt: new Date().toISOString(),
    });
  } catch {
    redirect("/welkom");
  }
  const draft = String(formData.get("draft") ?? "").trim();
  if (draft) redirect(`/home?draft=${encodeURIComponent(draft)}`);
  redirect("/home");
}

export async function deleteAccountAction(formData: FormData) {
  if (String(formData.get("confirm") ?? "") !== "verwijder") {
    redirect("/instellingen?fout=bevestig");
  }
  try {
    await eraseAccount();
    await signOutAccount();
  } catch {
    redirect("/instellingen?fout=1");
  }
  redirect("/");
}

export async function chatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const text = String(formData.get("text") ?? "").trim();
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!text) return { error: "Schrijf eerst een vraag." };
  try {
    const result = await converse(z.string().uuid().safeParse(conversationId).success ? conversationId : null, text);
    redirect(`/assistent/${result.id}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: "Ik kon dit helaas niet goed verwerken. Probeer het opnieuw." };
  }
}

export async function deleteThreadAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (z.string().uuid().safeParse(id).success) {
    try {
      await removeThread(id);
    } catch {
      redirect(`/assistent/${id}`);
    }
  }
  redirect("/assistent");
}

export async function listCheckAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const done = String(formData.get("done") ?? "") === "1";
  if (!z.string().uuid().safeParse(id).success) return;
  try {
    await toggleListItem(id, done);
  } catch {
    return;
  }
  revalidatePath("/lijsten");
}

export async function addListItemAction(formData: FormData) {
  const listId = String(formData.get("listId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  if (!title || !z.string().uuid().safeParse(listId).success) return;
  try {
    await addListItem(listId, title);
  } catch {
    return;
  }
  revalidatePath(`/lijsten/${listId}`);
}

export async function subtaskAction(formData: FormData) {
  const parentId = String(formData.get("parentId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 280);
  if (!title || !z.string().uuid().safeParse(parentId).success) return;
  try {
    await addSubtask(parentId, title);
  } catch {
    return;
  }
  revalidatePath(`/taken/${parentId}`);
}

export async function documentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Dit document bestaat niet." };
  const amount = String(formData.get("amount") ?? "").trim();
  const cents = amount ? parseEuro(amount) : null;
  try {
    await updateDocument(id, {
      title: String(formData.get("title") ?? "").trim().slice(0, 200),
      category: String(formData.get("category") ?? "overig"),
      supplier: String(formData.get("supplier") ?? "").trim() || null,
      summary: String(formData.get("summary") ?? "").trim() || null,
      dueOn: String(formData.get("dueOn") ?? "") || null,
      amountCents: cents,
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: "Er ging iets mis. Probeer het opnieuw." };
  }
  revalidatePath(`/documenten/${id}`);
  return { notice: "Opgeslagen." };
}

function parsePlan(raw: string): LifePlan | null {
  try {
    const json = planSchema.parse(JSON.parse(raw));
    return sanitizePlan(json);
  } catch {
    return null;
  }
}

function parseEuro(value: string) {
  const match = /(\d+)(?:[.,](\d{1,2}))?/.exec(value.replace(/[^\d,.]/g, ""));
  if (!match) return null;
  const whole = Number(match[1]);
  const rest = Number((match[2] ?? "0").padEnd(2, "0"));
  return whole * 100 + rest;
}

function isRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

type Preferences = {
  autoActions: boolean;
  proactive: boolean;
  notifications: boolean;
};
