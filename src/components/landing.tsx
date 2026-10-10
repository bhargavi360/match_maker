import Image from "next/image";
import Link from "next/link";
import { AuthForm } from "./auth-form";
import { Icon } from "./icons";

const trustPoints = [["Personalized Match Recommendations", "profiles"], ["Compatibility-Based Discovery", "matches"], ["Privacy-Conscious Experience", "shield"]] as const;

export function Landing() {
  return <main className="landing-page">
    <header className="landing-header">
      <Link href="/" className="landing-brand" aria-label="Matchmaker AI home"><span className="landing-brand-mark" aria-hidden="true"><span /><span /></span><span>Matchmaker <b>AI</b></span></Link>
      <nav className="landing-nav" aria-label="Main navigation"><Link href="/">Home</Link><a href="#discover">Discover Matches</a><a href="#how-it-works">How It Works</a><a href="#about">About Us</a></nav>
      <div className="landing-header-actions"><Link className="landing-login-link" href="/login">Login</Link><Link className="landing-get-started" href="/register">Get Started</Link></div>
    </header>
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-visual" id="discover">
        <div className="landing-visual-copy"><p className="landing-kicker">MEANINGFUL CONNECTIONS, THOUGHTFULLY MADE</p><h1 id="landing-title">Find Your<br /><em>Perfect Match</em></h1><p className="landing-description">Meaningful connections begin with understanding. Discover compatible people based on your preferences, values, and interests.</p><Link className="landing-explore" href="/login">Explore Matches <Icon name="arrow" /></Link></div>
        <div className="landing-portrait-pair" aria-label="Two fictional Matchmaker AI members"><div className="landing-portrait landing-portrait-a"><Image src="/demo/portraits/aanya.webp" alt="" fill sizes="(max-width: 850px) 47vw, 22vw" priority /></div><div className="landing-portrait landing-portrait-b"><Image src="/demo/portraits/ishaan.webp" alt="" fill sizes="(max-width: 850px) 47vw, 22vw" priority /></div><span className="landing-connection" aria-hidden="true">♡</span></div>
        <ul className="landing-trust" aria-label="Matchmaker AI benefits">{trustPoints.map(([label, icon]) => <li key={label}><span><Icon name={icon} /></span>{label}</li>)}</ul>
      </div>
      <aside className="landing-auth-wrap" aria-label="Sign in"><AuthForm landing /></aside>
    </section>
    <section className="landing-assurance" id="how-it-works"><div><p>HOW IT WORKS</p><strong>Thoughtful preferences. Clear compatibility. Human judgment.</strong></div><p>Matchmaker AI keeps profiles, permissions, workflow decisions, and introductions in one private workspace.</p></section>
    <section className="landing-about" id="about"><h2>Private by design.</h2><p>Profile information and recorded permissions stay within the operator workspace. Matching is a compatibility aid for considered introductions, never a swipe-first experience.</p></section>
  </main>;
}
