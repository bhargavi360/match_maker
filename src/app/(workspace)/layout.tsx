import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireMatchmaker } from "@/server/auth";
import { AppError } from "@/server/errors";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  let user;
  try { user = await requireMatchmaker(await headers()); }
  catch (error) { if (error instanceof AppError && error.status === 401) redirect("/login"); throw error; }
  return <Shell userName={user.name}>{children}</Shell>;
}
