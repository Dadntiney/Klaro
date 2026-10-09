"use client";

import { useMemo, useRef, useState } from "react";
import { aggregate, detectColumns, parseCsv, type DomainStat } from "@/lib/parse";
import { categorize, DEFAULT_CATEGORIES, type Category } from "@/lib/categories";

const OTHER = "Overig";

export default function Home() {
  const [fileName, setFileName] = useState("");
  const [domains, setDomains] = useState<DomainStat[]>([]);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [cats, setCats] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("Alle");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function load(file: File) {
    setError("");
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return setError("Het bestand lijkt leeg.");
    const [header, ...body] = rows;
    const det = detectColumns(header, body);
    if (!det) return setError("Geen kolom met domeinnamen gevonden.");
    const { domains, skipped } = aggregate(body, det);
    setFileName(file.name);
    setDomains(domains);
    setOverrides({});
    setInfo(
      `${body.length} regels, ${domains.length} unieke domeinen. Domeinkolom: "${header[det.hostCol]}"` +
        (det.countCol !== null ? `, aantallen: "${header[det.countCol]}"` : "") +
        (skipped ? `. ${skipped} regels overgeslagen.` : ".")
    );
  }

  const labelOf = (d: string) => overrides[d] ?? categorize(d, cats) ?? OTHER;
  const names = [...cats.map((c) => c.name), OTHER];

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of domains) m[labelOf(d.domain)] = (m[labelOf(d.domain)] ?? 0) + d.visits;
    return m;
  }, [domains, cats, overrides]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = domains.filter(
    (d) => (filter === "Alle" || labelOf(d.domain) === filter) && d.domain.includes(search.toLowerCase())
  );

  async function askClaude() {
    const todo = domains.filter((d) => labelOf(d.domain) === OTHER).map((d) => d.domain);
    if (!todo.length) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domains: todo, categories: cats.map((c) => c.name) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Mislukt");
      setOverrides((o) => ({ ...o, ...(data.result as Record<string, string>) }));
      if (todo.length > data.processed) setError(`Eerste ${data.processed} van ${todo.length} ingedeeld; klik nogmaals voor de rest.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = ["domein,bezoeken,categorie", ...domains.map((d) => [esc(d.domain), d.visits, esc(labelOf(d.domain))].join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "csv-indeling.csv";
    a.click();
  }

  return (
    <main>
      <h1>CSV</h1>
      <p className="muted">Upload een CSV met DNS-records en deel de bezochte websites in blokjes in.</p>

      <div
        className={"drop" + (over ? " over" : "")}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}
      >
        {fileName || "Sleep een CSV hierheen of klik om te kiezen"}
        <input ref={input} type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
      </div>
      {info && <p className="muted">{info}</p>}
      {error && <p className="err">{error}</p>}

      {domains.length > 0 && (
        <>
          <section className="card">
            <h2>Blokjes</h2>
            {cats.map((c, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div className="row">
                  <input value={c.name} onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <span className="muted">{counts[c.name] ?? 0} bezoeken</span>
                  <button onClick={() => setCats(cats.filter((_, j) => j !== i))}>Verwijder</button>
                </div>
                <input
                  className="kw"
                  placeholder="trefwoorden, gescheiden door komma's"
                  value={c.keywords.join(", ")}
                  onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, keywords: e.target.value.split(",").map((s) => s.trim()) } : x)))}
                />
              </div>
            ))}
            <div className="row">
              <button onClick={() => setCats([...cats, { name: "Nieuw blokje", keywords: [] }])}>+ Blokje</button>
              <button className="primary" disabled={busy} onClick={askClaude}>{busy ? "Bezig…" : `Deel "${OTHER}" in met Claude`}</button>
              <button onClick={exportCsv}>Exporteer CSV</button>
            </div>
          </section>

          <section className="card">
            <div className="row" style={{ marginBottom: 12 }}>
              {["Alle", ...names].map((n) => (
                <span key={n} className={"chip" + (filter === n ? " active" : "")} onClick={() => setFilter(n)}>
                  {n}{n !== "Alle" && ` (${counts[n] ?? 0})`}
                </span>
              ))}
              <input placeholder="Zoek domein" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <table>
              <thead><tr><th>Domein</th><th className="num">Bezoeken</th><th>Blokje</th></tr></thead>
              <tbody>
                {shown.slice(0, 500).map((d) => (
                  <tr key={d.domain}>
                    <td title={d.hosts.join("\n")}>{d.domain}</td>
                    <td className="num">{d.visits}</td>
                    <td>
                      <select value={labelOf(d.domain)} onChange={(e) => setOverrides({ ...overrides, [d.domain]: e.target.value })}>
                        {names.map((n) => <option key={n}>{n}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > 500 && <p className="muted">Eerste 500 van {shown.length} getoond.</p>}
          </section>
        </>
      )}
    </main>
  );
}
