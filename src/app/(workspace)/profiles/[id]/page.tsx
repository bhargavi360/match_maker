import { pageData } from "@/server/page-data";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ProfileDetailView } from "@/components/profile-detail";
import { getProfile } from "@/server/profiles";
import { AppError } from "@/server/errors";
export const metadata = { title: "Profile detail" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  let profile;
  try { profile = await pageData(async () => getProfile(await headers(), id)); }
  catch (e) { if (e instanceof AppError && e.status === 404) notFound(); throw e; }
  return <><PageHeader eyebrow="PEOPLE, NOT JUST PROFILES" title={profile.displayName} description="Saved profile details. Private contacts are opened separately." /><ProfileDetailView profile={profile} /></>;
}
