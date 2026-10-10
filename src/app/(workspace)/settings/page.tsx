import { DemoControls } from "@/components/demo-controls";
import { SettingsPreview } from "@/components/settings";
import { PageHeader } from "@/components/ui";
import { ScoringSettings } from "@/components/scoring-settings";
import { getScoringSettings } from "@/server/matching";
import { geminiAvailable } from "@/server/ai-gateway";
import { providerConfiguration } from "@/server/email/resend";
import { pageData } from "@/server/page-data";
import { headers } from "next/headers";
export const metadata = { title: "Settings" };
export default async function Page() {
  const settings=await pageData(async()=>getScoringSettings(await headers()));
  return <><PageHeader title="Thoughtfully tailored." description="Choose your appearance, review heuristic weights, and manage optional synthetic data." /><div className="settings-stack"><ScoringSettings initial={settings} /><SettingsPreview geminiConfigured={geminiAvailable()} emailProvider={providerConfiguration().status} /><DemoControls /></div></>;
}
