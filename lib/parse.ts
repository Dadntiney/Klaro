export type Row = Record<string, string>;

/** Minimale RFC4180-parser: quotes, ontsnapte quotes, CRLF, komma/puntkomma/tab. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].sort(
    (a, b) => firstLine.split(b).length - firstLine.split(a).length
  )[0];
  // Snel pad: zonder aanhalingstekens kan elke regel simpel gesplitst worden.
  if (!clean.includes('"')) {
    const out: string[][] = [];
    for (const line of clean.split(/\r?\n/)) if (line.trim() !== "") out.push(line.split(delim));
    return out;
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const HOST_RE = /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z]{2,}$/i;

/** Haal een hostnaam uit een URL, DNS-naam (met afsluitende punt) of kaal domein. */
export function extractHost(value: string): string | null {
  let v = value.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  v = v.split(/[/?#]/, 1)[0];
  v = v.replace(/^[^@]*@/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  return HOST_RE.test(v) ? v : null;
}

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

/** Basisdomein: www.sub.example.co.uk -> example.co.uk (zonder volledige public-suffix-lijst). */
export function baseDomain(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  const keep = tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

const HOST_HINTS = ["domain", "host", "hostname", "query", "qname", "name", "url", "website", "site", "fqdn"];
const COUNT_HINTS = ["count", "hits", "visits", "aantal", "queries", "requests", "total"];

export interface Detected {
  hostCol: number;
  countCol: number | null;
}

export function detectColumns(header: string[], body: string[][]): Detected | null {
  const sample = body.slice(0, 200);
  const score = (col: number) =>
    sample.filter((r) => extractHost(r[col] ?? "")).length / Math.max(sample.length, 1);
  let hostCol = -1;
  let best = 0.3;
  header.forEach((h, i) => {
    const hinted = HOST_HINTS.some((k) => h.trim().toLowerCase().includes(k));
    const s = score(i) + (hinted ? 0.5 : 0);
    if (s > best) {
      best = s;
      hostCol = i;
    }
  });
  if (hostCol < 0) return null;
  const countIdx = header.findIndex(
    (h, i) =>
      i !== hostCol &&
      COUNT_HINTS.some((k) => h.trim().toLowerCase().includes(k)) &&
      sample.every((r) => r[i] === undefined || r[i] === "" || !isNaN(Number(r[i])))
  );
  return { hostCol, countCol: countIdx >= 0 ? countIdx : null };
}
