/** "Nakijken" bij een regel: het verzoek gaat naar de eigen server (api/nakijken.php); Claude zoekt het uit en zet er een antwoord bij. */
export type NakijkItem = { id: string; at: number; d: string; dev: string; site: string; name: string; s: number; e: number; done: number; antwoord: string };

export async function askReview(item: Pick<NakijkItem, "d" | "dev" | "site" | "name" | "s" | "e">): Promise<void> {
  const res = await fetch("/api/nakijken.php", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Versturen lukte niet.");
}

export async function listReviews(): Promise<NakijkItem[]> {
  const res = await fetch("/api/nakijken.php", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) return [];
  return ((await res.json()) as { items?: NakijkItem[] }).items ?? [];
}
