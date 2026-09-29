import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { getProfile } from "@/lib/data/repository";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/home");
  const name = profile.displayName || profile.email;
  return <AppShell name={name}>{children}</AppShell>;
}
