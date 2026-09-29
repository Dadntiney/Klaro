import { interpretLocally } from "@/lib/ai/local";
import {
  addDays,
  formatDay,
  getZonedParts,
  MONTHS_NL,
  zonedTimeToUtc,
  type ZonedParts,
} from "@/lib/time";

export const ACTION_TYPES = [
  "CREATE_TASK",
  "CREATE_REMINDER",
  "CREATE_EVENT",
  "SAVE_DOCUMENT",
  "CREATE_LIST_ITEM",
  "UPDATE_TASK",
  "ARCHIVE_ITEM",
  "SEARCH_DATA",
  "CREATE_NOTE",
  "ANSWER",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export type DocumentCategory =
  | "factuur"
  | "verzekering"
  | "contract"
  | "garantie"
  | "ticket"
  | "identiteit"
  | "woning"
  | "auto"
  | "overig";

export type PlanPayload = {
  title: string;
  notes: string | null;
  dueAt: string | null;
  remindAt: string | null;
  location: string | null;
  priority: "laag" | "normaal" | "hoog";
  category: string | null;
  recurrence: string | null;
  listTitle: string | null;
  listItems: string[];
  query: string | null;
  scope: "today" | "tomorrow" | "general" | null;
  suggestion: boolean;
  document: {
    title: string;
    category: DocumentCategory;
    summary: string | null;
    supplier: string | null;
    amountCents: number | null;
    referenceCode: string | null;
    dueOn: string | null;
    startsOn: string | null;
    endsOn: string | null;
  } | null;
};

export type PlannedAction = {
  type: ActionType;
  payload: PlanPayload;
  confidence: number;
  requiresConfirmation: boolean;
  title: string;
  detail: string | null;
};

export type LifePlan = {
  summary: string;
  source: "local" | "openai";
  intent: "create" | "search" | "unclear";
  actions: PlannedAction[];
};

export type PlanContext = {
  lastScope?: "today" | "tomorrow" | "general" | null;
  lastTitle?: string | null;
};

export type PlanInput = {
  text: string;
  attachmentText?: string | null;
  fileName?: string | null;
};

const RECIPES: Record<string, string[]> = {
  taco: ["Tortilla's", "Gehakt", "Tomaat", "Sla", "Kaas", "Avocado", "Tacokruiden"],
  "taco's": ["Tortilla's", "Gehakt", "Tomaat", "Sla", "Kaas", "Avocado", "Tacokruiden"],
  pasta: ["Pasta", "Tomatensaus", "Ui", "Knoflook", "Kaas"],
  pannenkoeken: ["Bloem", "Melk", "Eieren", "Boter", "Suiker"],
};

const DESTRUCTIVE = new Set<ActionType>(["ARCHIVE_ITEM", "UPDATE_TASK"]);

export function planLocally(input: PlanInput, now = new Date(), context: PlanContext = {}): LifePlan {
  const text = input.text.replace(/\s+/g, " ").trim();
  const facts = [text, input.attachmentText ?? "", input.fileName ?? ""].join("\n");
  const lower = text.toLowerCase();

  const follow = followUp(lower, context, now);
  if (follow) return follow;

  if (text && isSearch(lower)) {
    return searchPlan(text, lower);
  }

  if (text && /^(archiveer|berg op|ruim op)\b/i.test(text)) {
    return single(
      action({
        type: "ARCHIVE_ITEM",
        title: "Archiveren",
        detail: "Dit haalt het item uit je actieve lijst.",
        confidence: 0.8,
        requiresConfirmation: true,
        payload: { ...emptyPayload(), title: polishTitle(interpretLocally(text, now).items[0]?.title ?? text), query: text },
      }),
      "Wil je dit archiveren?",
      "create",
    );
  }

  const recipe = recipePlan(lower);
  if (recipe) return recipe;

  const list = listPlan(text);
  if (list) return list;

  const document = documentPlan(text, facts, input.fileName, now);
  if (document) return document;

  if (!text && input.fileName) {
    return single(
      action({
        type: "SAVE_DOCUMENT",
        title: cleanFileTitle(input.fileName),
        detail: "Ik heb het bestand bewaard. Een korte toelichting helpt me de inhoud te lezen.",
        confidence: 0.55,
        requiresConfirmation: true,
        payload: {
          ...emptyPayload(),
          title: cleanFileTitle(input.fileName),
          document: {
            title: cleanFileTitle(input.fileName),
            category: categoryFromName(input.fileName),
            summary: null,
            supplier: null,
            amountCents: null,
            referenceCode: null,
            dueOn: null,
            startsOn: null,
            endsOn: null,
          },
        },
      }),
      "Ik heb het bestand. Wil je het bewaren?",
      "unclear",
    );
  }

  if (!text) {
    return single(
      action({
        type: "CREATE_NOTE",
        title: "Lege invoer",
        detail: null,
        confidence: 0.2,
        requiresConfirmation: true,
        payload: { ...emptyPayload(), title: "Notitie" },
      }),
      "Ik kon hier niets uit halen.",
      "unclear",
    );
  }

  const recurrence = detectRecurrence(lower);
  const when = resolveWhen(text, lower, now, recurrence);
  const base = interpretLocally(text, now).items[0];
  const title = polishTitle(base?.title || text);
  const priority = /belangrijk|urgent|meteen|asap/.test(lower) ? "hoog" : "normaal";
  const location = parseLocation(text);

  if (isEvent(lower)) {
    return single(
      action({
        type: "CREATE_EVENT",
        title,
        detail: when ? formatDetail(when, location) : location,
        confidence: when ? 0.9 : 0.62,
        requiresConfirmation: true,
        payload: {
          ...emptyPayload(),
          title,
          dueAt: when,
          remindAt: when,
          location,
          priority,
          category: guessCategory(lower),
        },
      }),
      "Ik denk dat je hier een afspraak van wilt maken.",
      "create",
    );
  }

  if (isReminder(lower) || (recurrence && /herinner|meter/.test(lower))) {
    const remindAt = when ?? (recurrence === "first_monday" ? nextFirstMonday(now) : null);
    const passport = /paspoort/.test(lower) && /verloopt|verlopen/.test(lower);
    const early = passport ? monthsBefore(remindAt ?? monthStart(lower, now), 3) : null;
    return single(
      action({
        type: "CREATE_REMINDER",
        title,
        detail: passport
          ? "Zal ik je 3 maanden van tevoren herinneren?"
          : formatDetail(early ?? remindAt, null),
        confidence: remindAt || recurrence ? 0.9 : 0.7,
        requiresConfirmation: true,
        payload: {
          ...emptyPayload(),
          title,
          remindAt: early ?? remindAt,
          recurrence,
          priority,
          suggestion: Boolean(passport),
          category: guessCategory(lower),
          notes: passport ? "Afgeleid van een vervalmoment. Geen extra feiten verzonnen." : null,
        },
      }),
      passport
        ? "Je paspoort heeft een vervalmoment. Zal ik je 3 maanden van tevoren herinneren?"
        : "Ik denk dat je hier een herinnering van wilt maken.",
      "create",
    );
  }

  if (/^(ik moet|taak|todo|niet vergeten)\b/.test(lower) || when) {
    const kind = when ? "CREATE_REMINDER" : "CREATE_TASK";
    return single(
      action({
        type: kind,
        title,
        detail: formatDetail(when, null),
        confidence: when ? 0.86 : 0.74,
        requiresConfirmation: true,
        payload: {
          ...emptyPayload(),
          title,
          dueAt: kind === "CREATE_TASK" ? when : null,
          remindAt: kind === "CREATE_REMINDER" ? when : null,
          priority,
          recurrence,
          category: guessCategory(lower),
        },
      }),
      kind === "CREATE_REMINDER"
        ? "Ik denk dat je hier een herinnering van wilt maken."
        : "Ik denk dat je hier een taak van wilt maken.",
      "create",
    );
  }

  return {
    summary: "Wat wil je hiermee doen?",
    source: "local",
    intent: "unclear",
    actions: [
      action({
        type: "CREATE_TASK",
        title,
        detail: "Als taak bewaren",
        confidence: 0.45,
        requiresConfirmation: true,
        payload: { ...emptyPayload(), title, priority },
      }),
      action({
        type: "CREATE_REMINDER",
        title,
        detail: "Als herinnering bewaren",
        confidence: 0.4,
        requiresConfirmation: true,
        payload: { ...emptyPayload(), title },
      }),
      action({
        type: "CREATE_NOTE",
        title,
        detail: "Alleen bewaren",
        confidence: 0.4,
        requiresConfirmation: true,
        payload: { ...emptyPayload(), title, notes: text },
      }),
    ],
  };
}

export function sanitizePlan(plan: LifePlan): LifePlan {
  const actions = plan.actions
    .filter((entry) => ACTION_TYPES.includes(entry.type))
    .slice(0, 12)
    .map((entry) => ({
      ...entry,
      confidence: Math.min(1, Math.max(0, entry.confidence)),
      requiresConfirmation: DESTRUCTIVE.has(entry.type) ? true : entry.requiresConfirmation,
      payload: {
        ...emptyPayload(),
        ...entry.payload,
        listItems: Array.isArray(entry.payload?.listItems) ? entry.payload.listItems.slice(0, 30) : [],
        title: String(entry.payload?.title ?? entry.title ?? "").slice(0, 280),
      },
    }))
    .filter((entry) => entry.payload.title.length > 0 || entry.type === "SEARCH_DATA");

  return {
    summary: plan.summary.slice(0, 400),
    source: plan.source,
    intent: plan.intent,
    actions,
  };
}

export function emptyPayload(): PlanPayload {
  return {
    title: "",
    notes: null,
    dueAt: null,
    remindAt: null,
    location: null,
    priority: "normaal",
    category: null,
    recurrence: null,
    listTitle: null,
    listItems: [],
    query: null,
    scope: null,
    suggestion: false,
    document: null,
  };
}

function action(input: Omit<PlannedAction, "payload"> & { payload: PlanPayload }): PlannedAction {
  return input;
}

function single(entry: PlannedAction, summary: string, intent: LifePlan["intent"]): LifePlan {
  return { summary, source: "local", intent, actions: [entry] };
}

function isSearch(lower: string) {
  return (
    /^(wat|waar|wanneer|hoeveel|welke|wie|hoe)\b/.test(lower) ||
    /\?\s*$/.test(lower) ||
    /\bwat moet ik\b/.test(lower)
  );
}

function searchPlan(text: string, lower: string): LifePlan {
  const scope = /\bmorgen\b/.test(lower) ? "tomorrow" : /\bvandaag\b/.test(lower) ? "today" : "general";
  return single(
    action({
      type: "SEARCH_DATA",
      title: "Zoeken in je gegevens",
      detail: null,
      confidence: 0.92,
      requiresConfirmation: false,
      payload: { ...emptyPayload(), title: text.slice(0, 280), query: text, scope },
    }),
    "Ik zoek dit in je gegevens.",
    "search",
  );
}

function followUp(lower: string, context: PlanContext, now: Date): LifePlan | null {
  if (/^en wat moet ik morgen\b/.test(lower)) {
    return searchPlan("Wat moet ik morgen doen?", "wat moet ik morgen doen");
  }
  if (/^(zet daar|maak daar|daar).*(reminder|herinnering)/.test(lower) && context.lastTitle) {
    const when =
      context.lastScope === "tomorrow"
        ? isoAt(addDays(getZonedParts(now), 1), 9, 0)
        : context.lastScope === "today"
          ? isoAt(getZonedParts(now), 18, 0)
          : null;
    return single(
      action({
        type: "CREATE_REMINDER",
        title: context.lastTitle,
        detail: formatDetail(when, null),
        confidence: 0.84,
        requiresConfirmation: true,
        payload: { ...emptyPayload(), title: context.lastTitle, remindAt: when },
      }),
      `Ik maak een herinnering voor “${context.lastTitle}”.`,
      "create",
    );
  }
  return null;
}

function recipePlan(lower: string): LifePlan | null {
  const match = /(?:voor|van)\s+([a-zà-ÿ']+)/i.exec(lower);
  if (!match || !/voeg|nodig|boodschappen|lijst/.test(lower)) return null;
  const key = match[1].toLowerCase();
  const items = RECIPES[key];
  if (!items) return null;
  return single(
    action({
      type: "CREATE_LIST_ITEM",
      title: `Boodschappen voor ${key}`,
      detail: "Suggestie. Haal weg wat je niet nodig hebt.",
      confidence: 0.8,
      requiresConfirmation: true,
      payload: {
        ...emptyPayload(),
        title: `Boodschappen voor ${key}`,
        listTitle: "Boodschappen",
        listItems: items,
        suggestion: true,
      },
    }),
    `Een suggestie voor ${key}. Niets is nog opgeslagen.`,
    "create",
  );
}

function listPlan(text: string): LifePlan | null {
  const add = /^(?:voeg|zet)\s+(.+?)\s+toe\b/i.exec(text);
  if (!add && !/^boodschappen\b/i.test(text)) return null;
  const named = /\baan (?:de |het )?([a-zà-ÿ][\wà-ÿ -]{1,40})/i.exec(text);
  const listTitle = named ? capitalize(named[1].replace(/\s*lijst\s*$/i, "").trim()) : "Boodschappen";
  const body = add ? add[1] : text.replace(/^boodschappen\s*:?\s*/i, "");
  const cleaned = body.replace(/\s+aan\s+(?:de |het )?.+$/i, "");
  const listItems = splitList(cleaned);
  if (listItems.length === 0) return null;
  return single(
    action({
      type: "CREATE_LIST_ITEM",
      title: listTitle,
      detail: listItems.join(" · "),
      confidence: 0.9,
      requiresConfirmation: true,
      payload: { ...emptyPayload(), title: listTitle, listTitle, listItems },
    }),
    `Ik zet dit op ${listTitle}.`,
    "create",
  );
}

function documentPlan(text: string, facts: string, fileName: string | null | undefined, now: Date): LifePlan | null {
  const blob = `${text}\n${fileName ?? ""}`.toLowerCase();
  const looks =
    /rekening|factuur|verzekering|polis|garantie|contract|paspoort|ticket|boarding|vlucht/.test(blob) ||
    /dit is mijn/.test(blob);
  if (!looks) return null;
  if (isSearch(text.toLowerCase()) && text.trim()) return null;

  const category = categoryFromName(`${fileName ?? ""} ${text}`);
  const amount = extractAmount(facts);
  const due = extractNamedDate(facts, now);
  const supplier = extractSupplier(facts);
  const reference = extractReference(facts);
  const title = documentTitle(category, supplier, fileName);
  const summary = describeDocument({ title, amount, due, supplier });
  const docAction = action({
    type: "SAVE_DOCUMENT",
    title,
    detail: summary,
    confidence: amount || due || supplier ? 0.88 : 0.7,
    requiresConfirmation: true,
    payload: {
      ...emptyPayload(),
      title,
      document: {
        title,
        category,
        summary,
        supplier,
        amountCents: amount,
        referenceCode: reference,
        dueOn: due ? due.slice(0, 10) : null,
        startsOn: null,
        endsOn: /verloopt|geldig tot|einddatum/.test(facts.toLowerCase()) && due ? due.slice(0, 10) : null,
      },
    },
  });

  const actions = [docAction];
  if (due && /factuur|rekening|betalen|verval/.test(blob)) {
    actions.push(
      action({
        type: "CREATE_REMINDER",
        title: `${title} betalen`,
        detail: "Deze factuur heeft een vervaldatum. Wil je een reminder?",
        confidence: 0.84,
        requiresConfirmation: true,
        payload: {
          ...emptyPayload(),
          title: `${title} betalen`,
          remindAt: due,
          suggestion: true,
          category: "factuur",
        },
      }),
    );
  }

  return {
    summary: summary ?? "Ik heb er een document van gemaakt.",
    source: "local",
    intent: "create",
    actions,
  };
}

function isEvent(lower: string) {
  const appointment = /afspraak|tandarts|dokter|huisarts|kapper|meeting|vergadering|restaurant/;
  const timed = /\b\d{1,2}[:.]\d{2}\b|\bom\s+\d{1,2}\b/.test(lower);
  return appointment.test(lower) && (timed || /\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/.test(lower));
}

function isReminder(lower: string) {
  return /^(herinner me|niet vergeten|vergeet niet)\b/.test(lower) || /paspoort verloopt/.test(lower);
}

function detectRecurrence(lower: string) {
  if (/eerste maandag/.test(lower)) return "first_monday";
  if (/elke dag|iedere dag/.test(lower)) return "daily";
  if (/elke week|iedere week/.test(lower)) return "weekly";
  if (/elke maand|iedere maand/.test(lower)) return "monthly";
  if (/elk jaar|ieder jaar/.test(lower)) return "yearly";
  return null;
}

function resolveWhen(text: string, lower: string, now: Date, recurrence: string | null) {
  if (recurrence === "first_monday") return nextFirstMonday(now);
  if (/volgende week/.test(lower)) return isoAt(addDays(getZonedParts(now), 7), 9, 0);
  const item = interpretLocally(text, now).items[0];
  return item?.remindAt ?? item?.dueAt ?? null;
}

function nextFirstMonday(now: Date) {
  const zone = getZonedParts(now);
  const thisMonth = firstMonday({ year: zone.year, month: zone.month, day: 1 });
  const at = zonedTimeToUtc(thisMonth.year, thisMonth.month, thisMonth.day, 9, 0);
  if (at.getTime() > now.getTime()) return at.toISOString();
  const next = zone.month === 12 ? { year: zone.year + 1, month: 1, day: 1 } : { year: zone.year, month: zone.month + 1, day: 1 };
  const day = firstMonday(next);
  return zonedTimeToUtc(day.year, day.month, day.day, 9, 0).toISOString();
}

function firstMonday(first: Pick<ZonedParts, "year" | "month" | "day">) {
  const noon = zonedTimeToUtc(first.year, first.month, first.day, 12, 0);
  const weekday = getZonedParts(noon).weekday;
  const delta = (1 - weekday + 7) % 7;
  return addDays(first, delta);
}

function monthStart(lower: string, now: Date) {
  for (let index = 0; index < MONTHS_NL.length; index += 1) {
    if (!new RegExp(`\\b${MONTHS_NL[index]}\\b`).test(lower)) continue;
    const zone = getZonedParts(now);
    let year = zone.year;
    if (index + 1 < zone.month) year += 1;
    return zonedTimeToUtc(year, index + 1, 1, 9, 0).toISOString();
  }
  return null;
}

function monthsBefore(iso: string | null, months: number) {
  if (!iso) return null;
  const parts = getZonedParts(new Date(iso));
  const date = new Date(Date.UTC(parts.year, parts.month - 1 - months, 1));
  return zonedTimeToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 9, 0).toISOString();
}

function extractNamedDate(facts: string, now: Date) {
  const lower = facts.toLowerCase();
  const named = new RegExp(`(\\d{1,2})\\s+(${MONTHS_NL.join("|")})(?:\\s+(\\d{4}))?`).exec(lower);
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS_NL.indexOf(named[2] as (typeof MONTHS_NL)[number]) + 1;
    const zone = getZonedParts(now);
    let year = named[3] ? Number(named[3]) : zone.year;
    if (!named[3] && (month < zone.month || (month === zone.month && day < zone.day))) year += 1;
    if (month < 1 || day < 1 || day > 31) return null;
    return zonedTimeToUtc(year, month, day, 9, 0).toISOString();
  }
  return monthStart(lower, now);
}

function extractAmount(facts: string) {
  const match = /€\s*(\d{1,6})(?:[.](\d{3}))*(?:,(\d{2}))?/.exec(facts) ?? /(\d{1,6}),(\d{2})\s*euro/i.exec(facts);
  if (!match) return null;
  if (match.length >= 4 && match[3]) {
    const whole = Number(`${match[1]}${match[2] ?? ""}`);
    return whole * 100 + Number(match[3]);
  }
  if (/euro/i.test(match[0]) && match[2]) return Number(match[1]) * 100 + Number(match[2]);
  const comma = /€\s*(\d{1,6}),(\d{2})/.exec(facts);
  if (comma) return Number(comma[1]) * 100 + Number(comma[2]);
  const whole = /€\s*(\d{1,6})\b/.exec(facts);
  if (whole) return Number(whole[1]) * 100;
  return null;
}

function extractSupplier(facts: string) {
  const labeled = /leverancier\s*[:\-]?\s*([A-ZÀ-Ý][\wÀ-ÿ.&' -]{1,60})/.exec(facts);
  if (labeled) return cleanSupplier(labeled[1]);
  const from = /(?:rekening|factuur|polis|verzekering)\s+van\s+([A-ZÀ-Ý][\wÀ-ÿ.&'-]{1,40})/.exec(facts);
  if (from) return cleanSupplier(from[1]);
  return null;
}

function cleanSupplier(value: string) {
  return value.trim().replace(/[.,]$/, "");
}

function extractReference(facts: string) {
  const match = /(?:factuurnummer|polisnummer|kenmerk)\s*[:\-]?\s*([A-Z0-9-]{3,40})/i.exec(facts);
  return match ? match[1] : null;
}

function parseLocation(text: string) {
  const match = /\blocatie\s*[:\-]?\s*(.+)$/i.exec(text);
  return match ? match[1].trim().slice(0, 120) : null;
}

function categoryFromName(value: string): DocumentCategory {
  const lower = value.toLowerCase();
  if (/factuur|rekening|energie/.test(lower)) return "factuur";
  if (/verzeker|polis/.test(lower)) return "verzekering";
  if (/garantie/.test(lower)) return "garantie";
  if (/contract/.test(lower)) return "contract";
  if (/ticket|vlucht|boarding/.test(lower)) return "ticket";
  if (/paspoort|identiteit|id-kaart|rijbewijs/.test(lower)) return "identiteit";
  if (/huur|hypotheek|woning/.test(lower)) return "woning";
  if (/auto|apk|garage/.test(lower)) return "auto";
  return "overig";
}

function documentTitle(category: DocumentCategory, supplier: string | null, fileName?: string | null) {
  if (category === "factuur") return supplier ? `Factuur ${supplier}` : "Energiefactuur";
  if (category === "verzekering") return supplier ? `Verzekering ${supplier}` : "Verzekering";
  if (category === "garantie") return "Garantie";
  if (category === "ticket") return "Ticket";
  if (category === "identiteit") return "Identiteitsbewijs";
  if (fileName) return cleanFileTitle(fileName);
  return "Document";
}

function describeDocument(input: {
  title: string;
  amount: number | null;
  due: string | null;
  supplier: string | null;
}) {
  const bits = [input.title];
  if (input.amount != null) bits.push(formatEuro(input.amount));
  if (input.supplier) bits.push(input.supplier);
  if (input.due) bits.push(`vervaldatum ${formatDay(input.due) ?? input.due.slice(0, 10)}`);
  return bits.join(" · ").slice(0, 400);
}

export function formatEuro(cents: number) {
  const whole = Math.floor(Math.abs(cents) / 100);
  const rest = String(Math.abs(cents) % 100).padStart(2, "0");
  const sign = cents < 0 ? "-" : "";
  return `${sign}€${whole.toLocaleString("nl-NL")},${rest}`;
}

function formatDetail(iso: string | null, location: string | null) {
  const bits = [iso ? iso.slice(0, 16).replace("T", " ") : null, location].filter(Boolean);
  return bits.length ? bits.join(" · ") : null;
}

function cleanFileTitle(name: string) {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_-]+/g, " ").trim();
  return capitalize(base || "Document");
}

function splitList(value: string) {
  return value
    .split(/\s*,\s*|\s+\ben\b\s+/i)
    .map((part) => capitalize(part.trim().replace(/^[-*]\s*/, "")))
    .filter((part) => part.length > 1 && part.length < 80);
}

function guessCategory(lower: string) {
  if (/auto|garage|apk/.test(lower)) return "auto";
  if (/tandarts|dokter|huisarts|apotheek/.test(lower)) return "gezondheid";
  if (/vlucht|vakantie|hotel/.test(lower)) return "vakantie";
  if (/huis|woning|meter/.test(lower)) return "huis";
  return null;
}

function polishTitle(title: string) {
  let text = title.trim();
  text = text.replace(/^mijn\s+/i, "");
  text = text.replace(/\bvolgende week\b/gi, " ");
  text = text.replace(/\s+te brengen\.?$/i, "");
  text = text.replace(/\s+brengen\.?$/i, "");
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/[.,]$/, "");
  if (!text) return title;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function capitalize(value: string) {
  const text = value.trim();
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isoAt(day: Pick<ZonedParts, "year" | "month" | "day">, hour: number, minute: number) {
  return zonedTimeToUtc(day.year, day.month, day.day, hour, minute).toISOString();
}
