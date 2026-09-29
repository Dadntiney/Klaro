import { redirect } from "next/navigation";

import { Landing } from "@/components/landing";
import { getProfile } from "@/lib/data/repository";

export default async function Page() {
  const profile = await getProfile();
  if (profile) redirect("/home");
  return <Landing />;
}
