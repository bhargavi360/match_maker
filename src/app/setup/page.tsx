import { AuthForm } from "@/components/auth-form";
import { setupAvailable } from "@/server/bootstrap";
export const dynamic = "force-dynamic";
export const metadata = { title: "One-time setup" };
export default async function Page() {
 let available: boolean | null = null;
 try { available = await setupAvailable(); } catch { /* Configuration-safe operator guidance below. */ }
 if (available === null) return <main className="auth-page"><section className="panel panel-padding"><h1>Workspace initialization required.</h1><p>Ask the operator to configure the isolated database and run the documented initialization command.</p></section></main>;
 return <AuthForm setup available={available} />;
}
