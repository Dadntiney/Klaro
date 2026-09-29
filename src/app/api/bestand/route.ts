import { readStoredFile } from "@/lib/data/life";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Niet gevonden.", { status: 404 });
  const file = await readStoredFile(id);
  if (!file) return new Response("Niet gevonden.", { status: 404 });
  if ("url" in file && file.url) return Response.redirect(file.url);
  if ("bytes" in file) {
    return new Response(file.bytes, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      },
    });
  }
  return new Response("Niet gevonden.", { status: 404 });
}
