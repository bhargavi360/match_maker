import { pageData } from "@/server/page-data";
import { headers } from "next/headers";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/profile-form";
import { getProfile } from "@/server/profiles";
export const metadata = { title: "Edit profile" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const profile = await pageData(async () => getProfile(await headers(), (await params).id));
  return <><PageHeader eyebrow="UPDATE REPORTED FACTS" title={"Edit " + profile.displayName} description={"Saving checks revision " + profile.revision + " to prevent overwriting newer changes."} /><ProfileForm profile={profile} /></>;
}
