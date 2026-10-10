import { pageData } from "@/server/page-data";
import { headers } from "next/headers";
import { DashboardLive } from "@/components/dashboard-live";
import { getDashboard } from "@/server/dashboard";
export const metadata = { title: "Dashboard" };
export default async function Page() { return <DashboardLive data={await pageData(async () => getDashboard(await headers()))} />; }
