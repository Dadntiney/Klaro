"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/page-intro";
import { archiveAction } from "@/lib/life-actions";
import type { InboxRow } from "@/lib/data/life-demo";
import { formatWhen } from "@/lib/time";

export function InboxBoard({ rows, query, status }: { rows: InboxRow[]; query: string; status: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<"nieuw" | "oud">("nieuw");
  const visible = useMemo(() => {
    const filtered = rows.filter((row) => {
      const hay = `${row.summary ?? ""} ${row.rawText} ${row.category ?? ""}`.toLowerCase();
      if (query && !hay.includes(query.toLowerCase())) return false;
      if (status !== "alles" && row.status !== status) return false;
      return true;
    });
    return filtered.sort((a, b) => (sort === "nieuw" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
  }, [rows, query, status, sort]);

  if (rows.length === 0) {
    return <EmptyState title="Je inbox is leeg." body="Gooi hier gewoon iets in wanneer je eraan denkt." />;
  }

  return (
    <div>
      <form className="mb-4 flex flex-wrap gap-2" action="/inbox">
        <input name="q" defaultValue={query} aria-label="Zoek in inbox" placeholder="Zoeken" className="h-11 flex-1 rounded-full bg-card px-4 ring-1 ring-border" />
        <select name="status" defaultValue={status} aria-label="Filter" className="h-11 rounded-full bg-card px-3 ring-1 ring-border">
          <option value="alles">Alles</option>
          <option value="pending">Nog te bevestigen</option>
          <option value="confirmed">Afgehandeld</option>
        </select>
        <button className="h-11 rounded-full px-4 ring-1 ring-border">Filter</button>
      </form>
      <div className="mb-3 flex items-center justify-between text-sm">
        <button type="button" className="text-muted-foreground" onClick={() => setSort((value) => (value === "nieuw" ? "oud" : "nieuw"))}>
          Sortering: {sort === "nieuw" ? "nieuwste eerst" : "oudste eerst"}
        </button>
        {selected.length > 0 ? (
          <form action={archiveAction}>
            {selected.map((id) => (
              <input key={id} type="hidden" name="id" value={id} />
            ))}
            <button className="text-primary">Archiveer {selected.length}</button>
          </form>
        ) : null}
      </div>
      <ul className="space-y-2">
        {visible.map((row) => (
          <li key={row.id} className="flex gap-3 rounded-3xl bg-card p-4 ring-1 ring-foreground/10">
            <input
              type="checkbox"
              aria-label={`Selecteer ${row.summary || row.rawText}`}
              checked={selected.includes(row.id)}
              onChange={(event) =>
                setSelected((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))
              }
              className="mt-1 size-5"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {row.category ?? "Inbox"} · {row.status === "pending" ? "wacht op jou" : "verwerkt"} · {formatWhen(row.createdAt) ?? row.createdAt.slice(0, 10)}
              </p>
              <p className="mt-1 font-medium">{row.summary || row.rawText}</p>
              <p className="truncate text-sm text-muted-foreground">{row.rawText}</p>
              {row.fileName ? <p className="mt-1 text-sm">{row.fileName}</p> : null}
              {row.status === "pending" ? (
                <Link href={`/bevestigen/${row.id}`} className="mt-2 inline-block text-sm text-primary">
                  Bekijken
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
