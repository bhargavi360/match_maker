import { ChatLive } from "@/components/chat-live";
import { PageHeader } from "@/components/ui";
import { headers } from "next/headers";
import { pageData } from "@/server/page-data";
import { chatService } from "@/server/chat";
import { matchingSources } from "@/server/matching";
import { listWorkflows } from "@/server/workflows";
export const metadata = { title: "AI Chat" };
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const query = await searchParams;
  const data = await pageData(async () => { const h = await headers(); const [initialList, initialDetail, sourceList, workflows] = await Promise.all([chatService.list(h), query.id ? chatService.get(h,query.id) : Promise.resolve(null), matchingSources(h), listWorkflows(h)]); return { initialList, initialDetail, sources: sourceList.sources, workflows }; });
  return <><PageHeader eyebrow="A LITTLE HELP THINKING IT THROUGH" title="A conversation with context." description="Saved internal conversations, authorized facts and changes you explicitly review. Human judgment leads every decision." /><ChatLive key={query.id ?? "new"} {...data}/></>;
}
