import Link from "next/link";
export default function NotFound() { return <div className="empty-state panel"><p className="eyebrow">PAGE NOT FOUND</p><h1>A different path, perhaps?</h1><p>This screen is outside the design preview.</p><Link href="/dashboard" className="button button-primary">Back to dashboard</Link></div>; }
