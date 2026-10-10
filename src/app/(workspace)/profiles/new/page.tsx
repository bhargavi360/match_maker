import { pageData } from "@/server/page-data";
import { headers } from "next/headers";
import { requireMatchmaker } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/profile-form";
export const metadata = { title: "Create profile" };
export default async function Page() {
  await pageData(async () => requireMatchmaker(await headers()));
  return <><PageHeader eyebrow="A PERSON BEHIND EVERY POSSIBILITY" title="Create a profile." description="Record reported facts. Preferences, contacts, and permission have separate controls." /><ProfileForm /></>;
}
