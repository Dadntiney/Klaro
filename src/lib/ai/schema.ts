import { z } from "zod";

export const itemKindSchema = z.enum(["taak", "herinnering"]);

export const interpretedItemSchema = z.object({
  kind: itemKindSchema,
  title: z.string().trim().min(1).max(280),
  notes: z.string().trim().max(2000).nullable(),
  dueAt: z.string().datetime().nullable(),
  remindAt: z.string().datetime().nullable(),
});

export type InterpretedItem = z.infer<typeof interpretedItemSchema>;
export type ItemKind = z.infer<typeof itemKindSchema>;

export const interpretationSchema = z.object({
  summary: z.string().trim().min(1).max(400),
  items: z.array(interpretedItemSchema).min(1).max(12),
  source: z.enum(["openai", "local"]),
  degraded: z.boolean().optional(),
});

export type Interpretation = z.infer<typeof interpretationSchema>;

const modelItemSchema = z.object({
  kind: itemKindSchema,
  title: z.string(),
  notes: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
  remind_at: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  remindAt: z.string().nullable().optional(),
});

export const modelResponseSchema = z.object({
  summary: z.string(),
  items: z.array(modelItemSchema).min(1).max(12),
});

function normalizeInstant(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function parseModelResponse(payload: unknown): {
  summary: string;
  items: InterpretedItem[];
} {
  const parsed = modelResponseSchema.parse(payload);
  const items = parsed.items.map((item) => {
    const notes = item.notes?.trim() ? item.notes.trim().slice(0, 2000) : null;
    return interpretedItemSchema.parse({
      kind: item.kind,
      title: item.title.trim().slice(0, 280),
      notes,
      dueAt: normalizeInstant(item.dueAt ?? item.due_at),
      remindAt: normalizeInstant(item.remindAt ?? item.remind_at),
    });
  });

  return {
    summary: parsed.summary.trim().slice(0, 400),
    items,
  };
}
