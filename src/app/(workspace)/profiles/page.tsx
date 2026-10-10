import { pageData } from "@/server/page-data";
import { headers } from "next/headers";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ProfilesLive } from "@/components/profiles-live";
import { ProfileSearch } from "@/components/profile-search";
import { listProfiles } from "@/server/profiles";
export const metadata = { title: "Profiles" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
 const params = await searchParams;
 const query = Object.fromEntries(Object.entries(params).filter((entry): entry is [string,string] => typeof entry[1] === "string"));
 const data = await pageData(async () => listProfiles(await headers(), query));
 return <><PageHeader eyebrow="PEOPLE, NOT JUST PROFILES" title="Every connection starts here." description="Saved profiles, recorded facts, and private contact separation." action={<Link className="button button-primary" href="/profiles/new">Add profile</Link>} /><ProfileSearch /><ProfilesLive data={data} query={query} /></>;
}
