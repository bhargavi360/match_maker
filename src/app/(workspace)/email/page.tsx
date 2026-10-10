import { EmailPreview } from "@/components/email";
import { EmailLive } from "@/components/email-live";
import { PageHeader } from "@/components/ui";
import { emailService } from "@/server/email/service";
import { listWorkflows } from "@/server/workflows";
import { pageData } from "@/server/page-data";
import { headers } from "next/headers";
export const metadata = { title: "Email" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const data = await pageData(async () => { const h = await headers(); return { workspace: await emailService.workspace(h, { ...(typeof query.workflowId === "string" ? { workflowId: query.workflowId } : {}), ...(typeof query.draftPage === "string" ? { draftPage: query.draftPage } : {}), ...(typeof query.deliveryPage === "string" ? { deliveryPage: query.deliveryPage } : {}) }), list: await listWorkflows(h) }; });
  return <><PageHeader eyebrow="INTRODUCTIONS, WITH A PERSONAL TOUCH" title="The right words. Your voice." description="Save a local plain-text introduction. Review its exact recipient and content, approve it, then separately choose whether to send." /><EmailLive key={JSON.stringify(query)} initial={data.workspace} list={data.list} /><details className="preview-states"><summary>Design state examples</summary><p className="muted">A separate temporary synthetic example.</p><EmailPreview /></details></>;
}
