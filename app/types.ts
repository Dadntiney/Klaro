import type { Session } from "@/lib/sessions";

export interface Group {
  d: string;
  dev: string;
  site: string;
  name: string;
  icon: string;
  last: number;
  n: number;
  bg: boolean;
  adult?: boolean;
  main?: boolean;
  flag?: string;
  ts?: number[];
  ss?: Session[];
  mins?: number;
  cat?: string;
  bl?: number;
  isNew?: boolean;
  sc?: number; // aantal sessies
  rc?: number; // daarvan echte sessies (>= 2 min)
  mm?: number; // minuten beeld/geluid-verkeer (echt kijken/luisteren)
  lm?: number; // laatste keer beeld/geluid-verkeer (unix ms)
  cc?: string; // land van de server
  susp?: string; // reden waarom het adres verdacht lijkt
  flash?: number;
}
export interface Event {
  t: number;
  devId: string;
  type: string;
  site: string;
  name: string;
  icon: string;
  bg: boolean;
  adult?: boolean;
  main?: boolean;
  flag?: string;
  cat?: string;
  blocked?: boolean;
  media?: boolean;
  pay?: { kind: string; level: "checkout" | "store" };
}
export interface Device {
  name: string;
  n: number;
  last?: number; // laatste verzoek (alle verkeer)
  gap?: number; // normale pauze overdag (ms)
  days?: number; // dagen met activiteit
  ss?: Session[]; // sessies van vandaag (zichtbaar verkeer)
  avg?: number; // gemiddeld aantal actieve minuten op eerdere dagen
  blocked?: number; // geblokkeerde 18+/dating-pogingen vandaag
  first?: number; // eerste verzoek ooit in de logs
  away?: { now: boolean | null; since: number; runs: Session[] }; // thuis of onderweg
  sleep?: { d: string; first: number; last: number }[]; // eerste en laatste echte activiteit per dag
  dm?: Record<string, number>; // actieve minuten per dag
  threats?: { today: number; week: number; top: { site: string; n: number }[] }; // geblokkeerde bedreigingen
}
export interface PayMoment {
  t: number;
  dev: string;
  kind: string;
  level: "checkout" | "store";
}
export interface Insights {
  payments: PayMoment[];
  trackers: { site: string; name: string; n: number }[];
  since: number;
  until: number;
}

