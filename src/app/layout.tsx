import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme";
import { themeBootstrap } from "@/design/theme-bootstrap";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Matchmaker · Private workspace", template: "%s · Matchmaker" }, description: "A private workspace for local profiles, deterministic matching and optional consent-gated explanations.", robots: { index: false, follow: false } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
