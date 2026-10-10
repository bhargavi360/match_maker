import { AuthForm } from "@/components/auth-form";
export const metadata = { title: "Sign in" };
export default async function Page({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  const { registered } = await searchParams;
  return <AuthForm registered={registered === "1"} />;
}
