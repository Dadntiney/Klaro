"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  completeItem,
  confirmCapture,
  dismissCapture,
  signInAccount,
  signOutAccount,
  signUpAccount,
  submitCapture,
} from "@/lib/data/repository";
import { fromDateTimeLocal } from "@/lib/time";

export type FormState = {
  error?: string;
  notice?: string;
};

const credentialsSchema = z.object({
  email: z.string().trim().email("Vul een geldig e-mailadres in.").max(320),
  password: z
    .string()
    .min(8, "Kies een wachtwoord van minstens 8 tekens.")
    .max(72, "Dit wachtwoord is te lang."),
  displayName: z.string().trim().max(80).optional(),
});

const confirmedItemSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  kind: z.enum(["taak", "herinnering"]),
  title: z.string().trim().min(1, "Elke regel heeft een titel nodig.").max(280),
  notes: z.string().trim().max(2000).optional().nullable(),
  when: z.string().optional().nullable(),
});

function safeNext(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "/home";
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}

async function requestOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: String(formData.get("displayName") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer je gegevens." };
  }

  const result = await signUpAccount({
    ...parsed.data,
    displayName: parsed.data.displayName || undefined,
    origin: await requestOrigin(),
  });

  if (!result.ok) return { error: result.error };
  if (result.needsConfirmation) {
    return { notice: "Bijna. Bevestig je e-mailadres, daarna kun je inloggen." };
  }
  redirect("/home");
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.omit({ displayName: true }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer je gegevens." };
  }

  const result = await signInAccount(parsed.data);
  if (!result.ok) return { error: result.error };
  redirect(safeNext(formData.get("next")));
}

export async function signOutAction() {
  await signOutAccount();
  redirect("/");
}

export async function submitCaptureAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Schrijf eerst iets." };
  if (text.length > 4000) return { error: "Dit is te lang. Hou het onder de 4000 tekens." };

  try {
    const result = await submitCapture(text);
    redirect(`/bevestigen/${result.captureId}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: "Ik kon dit niet lezen. Probeer het nog eens." };
  }
}

export async function confirmCaptureAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const captureId = String(formData.get("captureId") ?? "");
  if (!z.string().uuid().safeParse(captureId).success) {
    return { error: "Deze invoer bestaat niet." };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("items") ?? ""));
  } catch {
    return { error: "De bevestiging is onleesbaar." };
  }

  const parsed = z.array(confirmedItemSchema).min(1).max(12).safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer de regels." };
  }

  try {
    await confirmCapture(
      captureId,
      parsed.data.map((item) => {
        const instant = fromDateTimeLocal(item.when);
        return {
          id: item.id ?? undefined,
          kind: item.kind,
          title: item.title,
          notes: item.notes?.trim() ? item.notes.trim() : null,
          dueAt: item.kind === "taak" ? instant : null,
          remindAt: item.kind === "herinnering" ? instant : null,
        };
      }),
    );
  } catch (error) {
    if (isRedirect(error)) throw error;
    return {
      error: error instanceof Error ? error.message : "Bevestigen lukte niet.",
    };
  }

  revalidatePath("/home");
  redirect("/home?gezet=1");
}

export async function dismissCaptureAction(formData: FormData) {
  const captureId = String(formData.get("captureId") ?? "");
  if (z.string().uuid().safeParse(captureId).success) {
    try {
      await dismissCapture(captureId);
    } catch {
      redirect(`/bevestigen/${captureId}`);
    }
  }
  redirect("/home");
}

export async function completeItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (z.string().uuid().safeParse(id).success) {
    try {
      await completeItem(id);
    } catch {
      // The row stays open when the update is rejected.
    }
  }
  revalidatePath("/home");
}

function isRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}
