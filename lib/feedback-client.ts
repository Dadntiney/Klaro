/** "Klopt niet" en "Iets gemist?": de eigenaar meldt het in Klaro, de dagelijkse controle zoekt het uit (api/feedback.php). */
export type FeedbackItem = { id: string; at: number; kind: "fout" | "gemist"; dev: string; site: string; name: string; s: number; e: number; note: string; done: number; antwoord: string };

export async function sendFeedback(item: Partial<FeedbackItem>): Promise<void> {
  const res = await fetch("/api/feedback.php", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Versturen lukte niet.");
}

export async function listFeedback(): Promise<FeedbackItem[]> {
  const res = await fetch("/api/feedback.php", { credentials: "same-origin" });
  if (!res.ok) return [];
  return ((await res.json()) as { items?: FeedbackItem[] }).items ?? [];
}
