import "server-only";

import { hasOpenAiEnv } from "@/lib/env";
import { interpretLocally } from "./local";
import { interpretWithOpenAI } from "./openai";
import type { Interpretation } from "./schema";

export async function interpretNote(rawText: string, now = new Date()): Promise<Interpretation> {
  if (!hasOpenAiEnv()) {
    return { ...interpretLocally(rawText, now), source: "local" };
  }

  try {
    const model = await interpretWithOpenAI(rawText, now);
    return { ...model, source: "openai" };
  } catch {
    return { ...interpretLocally(rawText, now), source: "local", degraded: true };
  }
}
