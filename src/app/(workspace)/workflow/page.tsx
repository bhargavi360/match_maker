import { headers } from "next/headers";
import { WorkflowLive } from "@/components/workflow-live";
import { PageHeader } from "@/components/ui";
import { matchingSources } from "@/server/matching";
import { getWorkflow,listWorkflows } from "@/server/workflows";
import { pageData } from "@/server/page-data";
export const metadata = { title: "Workflow" };
export default async function Page({searchParams}:{searchParams:Promise<{id?:string;page?:string}>}){
  const query=await searchParams;
  const data=await pageData(async()=>{
    const h=await headers();
    const [list,sources,initial]=await Promise.all([listWorkflows(h,query.page?{page:query.page}:{}),matchingSources(h),query.id?getWorkflow(h,query.id):Promise.resolve(null)]);
    return {list,...sources,initial};
  });
  return <><PageHeader eyebrow="FROM POSSIBILITY TO INTRODUCTION" title="A considered path forward." description="A saved five-step journey. Review current evidence, make an explicit human decision, and revisit safely. Local email drafting, exact approval and separate dispatch are available in the email workspace."/><WorkflowLive key={query.id??"new"} {...data}/></>;
}
