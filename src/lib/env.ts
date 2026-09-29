export type BackendMode = "supabase" | "demo" | "unconfigured";

export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function backendMode(): BackendMode {
  if (hasSupabaseEnv()) return "supabase";
  if (process.env.NODE_ENV !== "production") return "demo";
  return "unconfigured";
}

export function hasOpenAiEnv() {
  return Boolean(process.env.OPENAI_API_KEY);
}
