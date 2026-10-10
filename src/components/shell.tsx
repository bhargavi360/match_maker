"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { Icon, type IconName } from "./icons";
import { Badge, Button, IconButton } from "./ui";
import { ThemeToggle } from "./theme";
import { api } from "./api";

const navigation: readonly { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/profiles", label: "Profiles", icon: "profiles" },
  { href: "/matches", label: "Matches", icon: "matches" },
  { href: "/workflow", label: "Workflow", icon: "workflow" },
  { href: "/email", label: "Email", icon: "mail" },
  { href: "/chat", label: "AI Chat", icon: "chat" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function Brand() { return <Link href="/dashboard" className="brand" aria-label="Matchmaker dashboard"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28" fill="none"><rect x="4" y="6" width="15" height="20" rx="7.5" stroke="currentColor" strokeWidth="2" /><rect x="13" y="6" width="15" height="20" rx="7.5" stroke="currentColor" strokeWidth="2" /></svg></span><span className="brand-name">matchmaker<span className="brand-dot">.</span></span></Link>; }

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <nav aria-label="Workspace navigation" className="navigation">{navigation.map(item => <Link key={item.href} href={item.href} className={`nav-link ${pathname.startsWith(item.href) ? "active" : ""}`} aria-current={pathname === item.href ? "page" : undefined} title={item.label} onClick={onNavigate}><Icon name={item.icon} /><span className="nav-label">{item.label}</span>{pathname === item.href && <span className="active-dot" aria-hidden="true" />}</Link>)}</nav>;
}

export function Shell({ children, userName }: { children: ReactNode; userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const account = useRef<HTMLDetailsElement>(null);
  const current = navigation.find(item => pathname.startsWith(item.href))?.label ?? "Workspace";
  const live = pathname.startsWith("/profiles") || pathname === "/dashboard" || pathname === "/settings" || pathname === "/matches" || pathname === "/workflow" || pathname === "/email" || pathname === "/chat";
  const [logoutError, setLogoutError] = useState("");
  async function logout() { try { await api("/api/auth/sign-out", "POST", {}); router.replace("/login"); router.refresh(); } catch { setLogoutError("Unable to sign out. Please retry."); } }
  useEffect(() => {
    const media = matchMedia("(max-width: 760px)");
    const resize = () => { if (!media.matches) setDrawerOpen(false); };
    media.addEventListener("change", resize);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && account.current?.open) { account.current.open = false; account.current.querySelector("summary")?.focus(); } };
    document.addEventListener("keydown", escape);
    return () => { media.removeEventListener("change", resize); document.removeEventListener("keydown", escape); };
  }, []);
  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar" aria-label="Main sidebar"><Brand /><p className="nav-caption">YOUR WORKSPACE</p><Navigation pathname={pathname} /><div className="sidebar-bottom"><div className="sidebar-note"><Icon name="shield" /><span><strong>A space for intention</strong><small>Local private workspace</small></span></div><button className="collapse-button" type="button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}><Icon name={collapsed ? "right" : "left"} /><span className="nav-label">Collapse sidebar</span></button></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-context"><IconButton className="mobile-menu-button" label="Open navigation" icon="menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} /><span className="breadcrumb-parent">Workspace</span><span className="breadcrumb-divider">/</span><span>{current}</span></div><div className="topbar-actions"><span className="header-preview"><Badge tone="accent">{live ? "Private workspace" : "Design preview"}</Badge></span><ThemeToggle /><span className="header-divider" /><details ref={account} className="account-menu"><summary aria-label="Open matchmaker account menu"><span className="account-avatar" aria-hidden="true">{userName.slice(0,1)}</span><span className="account-name"><strong>{userName}</strong><small>Matchmaker</small></span><Icon name="down" /></summary><div className="account-panel"><strong>Matchmaker account</strong><p>Signed in to your private workspace.</p><Button variant="secondary" onClick={logout}>Sign out</Button>{logoutError && <p role="alert">{logoutError}</p>}<Link href="/settings" onClick={() => { if (account.current) account.current.open = false; }}>Appearance settings<Icon name="arrow" /></Link></div></details></div></header>
      <main id="main-content" tabIndex={-1} className="main-content">{children}</main><footer className="workspace-footer"><span>Thoughtful connections. Human judgment.</span><span>Local workspace</span></footer>
    </div>
    <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Navigation" className="navigation-drawer"><Brand /><Navigation pathname={pathname} onNavigate={() => setDrawerOpen(false)} /><p className="muted small drawer-note">Local workspace. Outgoing emails require human approval.</p></Dialog>
  </div>;
}
