import { MatchesLive } from "@/components/matches-live";
import { GlobalAllocationLive } from "@/components/global-allocation-live";
import { PageHeader } from "@/components/ui";
import { matchingSources } from "@/server/matching";
import { geminiAvailable } from "@/server/ai-gateway";
import { pageData } from "@/server/page-data";
import { headers } from "next/headers";
export const metadata = { title: "Matches" };
export default async function Page() {
  const data=await pageData(async()=>matchingSources(await headers()));
  return <><PageHeader eyebrow="POSSIBILITY, WITH PERSPECTIVE" title="Look beyond the first impression." description="Deterministic mutual indicators and evidence disclosures. Human review is required; scores are never probabilities of relationship success." /><GlobalAllocationLive /><MatchesLive {...data} geminiConfigured={geminiAvailable()} /></>;
}
