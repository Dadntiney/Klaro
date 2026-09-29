export async function extractFileText(file: File) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("text/") || /\.(txt|md|csv)$/.test(name)) {
    return (await file.text()).slice(0, 20_000);
  }
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = await extractPdf(bytes);
    return parsed ? parsed.slice(0, 20_000) : null;
  }
  return null;
}

async function extractPdf(bytes: Uint8Array) {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    if (text.trim()) return text;
  } catch {
    // Fall through to a literal-string read for simple PDFs.
  }
  return literalPdfText(bytes);
}

function literalPdfText(bytes: Uint8Array) {
  const raw = Buffer.from(bytes).toString("latin1");
  const parts: string[] = [];
  for (const match of raw.matchAll(/\((?:\\\)|\\.|[^)]){2,}\)/g)) {
    const inner = match[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-zÀ-ÿ]{3,}/.test(inner)) parts.push(inner);
  }
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text || null;
}

export function inputKindFor(file: File | null) {
  if (!file) return "text";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "document";
  return "file";
}
