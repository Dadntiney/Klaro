import { NextResponse } from "next/server";
import { toEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const enc = new TextEncoder();
const MAX_MS = 55_000; // daarna sluiten we netjes; de browser verbindt direct opnieuw

/** Rechtstreekse verbinding met de NextDNS-logstroom, doorgegeven als SSE zonder de echte apparaatnaam. */
export async function GET(req: Request) {
  const key = process.env.NEXTDNS_API_KEY;
  const profile = process.env.NEXTDNS_PROFILE_ID;
  if (!key || !profile || !process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Niet ingesteld." }, { status: 503 });
  }
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  let upstream: Response;
  try {
    upstream = await fetch(`https://api.nextdns.io/profiles/${encodeURIComponent(profile.trim())}/logs/stream`, {
      headers: { "X-Api-Key": key.trim(), Accept: "text/event-stream" },
      signal: abort.signal,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "NextDNS is niet bereikbaar." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    const body = (await upstream.text().catch(() => "")).slice(0, 300);
    return NextResponse.json({ error: `NextDNS gaf fout ${upstream.status}. ${body}`.trim() }, { status: 502 });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let timers: ReturnType<typeof setTimeout>[] = [];
  const stream = new ReadableStream({
    async start(controller) {
      const close = () => {
        timers.forEach(clearTimeout);
        timers.forEach(clearInterval);
        abort.abort();
        try { controller.close(); } catch {}
      };
      controller.enqueue(enc.encode("retry: 500\n\n"));
      timers = [setTimeout(close, MAX_MS), setInterval(() => { try { controller.enqueue(enc.encode(": ping\n\n")); } catch {} }, 15_000) as unknown as ReturnType<typeof setTimeout>];
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            try {
              const parsed = JSON.parse(line.slice(5).trim());
              for (const raw of Array.isArray(parsed) ? parsed : [parsed]) {
                const ev = toEvent(raw);
                if (ev) controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
              }
            } catch {}
          }
        }
      } catch {}
      close();
    },
    cancel() {
      timers.forEach(clearTimeout);
      timers.forEach(clearInterval);
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
