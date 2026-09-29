import type { KlaroItem } from "@/lib/domain";
import { addDays, formatDay, formatWhen, getZonedParts, sameDay } from "@/lib/time";
import { formatEuro } from "./plan";

export type NoticeStatus = "unread" | "read" | "dismissed" | "snoozed";

export type Notice = {
  sourceKey: string;
  title: string;
  body: string;
  href: string;
  status: NoticeStatus;
  documentId?: string;
  dueOn?: string;
};

type DocumentHint = {
  id: string;
  title: string;
  dueOn: string | null;
  amountCents: number | null;
};

type NoticeState = {
  sourceKey: string;
  status: Exclude<NoticeStatus, "unread">;
  snoozedUntil: string | null;
};

export function buildNotices(input: {
  now?: Date;
  items: KlaroItem[];
  documents: DocumentHint[];
  states: NoticeState[];
  notifications: boolean;
  proactive: boolean;
}): Notice[] {
  if (!input.notifications) return [];
  const now = input.now ?? new Date();
  const states = new Map(input.states.map((state) => [state.sourceKey, state]));
  const notices: Notice[] = [];

  for (const item of input.items) {
    if (item.status !== "open") continue;
    const stamp = item.remindAt ?? (item.kind === "afspraak" ? item.dueAt : null);
    if (!stamp) continue;
    if (item.snoozedUntil && new Date(item.snoozedUntil).getTime() > now.getTime()) continue;
    const when = new Date(stamp);
    const soon = when.getTime() - now.getTime() < 36 * 60 * 60 * 1000;
    const today = sameDay(getZonedParts(when), getZonedParts(now));
    const tomorrow = sameDay(getZonedParts(when), addDays(getZonedParts(now), 1));
    if (!soon && !today && !tomorrow && when.getTime() > now.getTime()) continue;
    notices.push({
      sourceKey: `item:${item.id}`,
      title: item.title,
      body: formatWhen(stamp, now) ?? "Binnenkort",
      href: item.kind === "herinnering" ? "/herinneringen" : item.kind === "afspraak" ? "/agenda" : "/vandaag",
      status: "unread",
    });
  }

  if (input.proactive) {
    for (const document of input.documents) {
      if (!document.dueOn) continue;
      const due = new Date(`${document.dueOn}T09:00:00`);
      const days = (due.getTime() - now.getTime()) / 86_400_000;
      if (days < 0 || days > 30) continue;
      if (alreadyReminded(input.items, document)) continue;
      const amount = document.amountCents != null ? `${formatEuro(document.amountCents)} · ` : "";
      const when = formatDay(document.dueOn) ?? document.dueOn;
      notices.push({
        sourceKey: `document:${document.id}`,
        title: document.title,
        body: `${amount}Dit speelt op ${when}. Wil je een reminder?`,
        href: `/documenten/${document.id}`,
        status: "unread",
        documentId: document.id,
        dueOn: document.dueOn,
      });
    }
  }

  return notices
    .map((notice) => {
      const state = states.get(notice.sourceKey);
      if (!state) return notice;
      if (state.status === "snoozed" && state.snoozedUntil && new Date(state.snoozedUntil).getTime() <= now.getTime()) {
        return notice;
      }
      return { ...notice, status: state.status };
    })
    .filter((notice) => notice.status !== "dismissed");
}

function alreadyReminded(items: KlaroItem[], document: DocumentHint) {
  const needle = document.title.toLowerCase();
  return items.some((item) => {
    if (item.kind !== "herinnering" || item.status !== "open" || !needle) return false;
    return item.title.toLowerCase().includes(needle);
  });
}
