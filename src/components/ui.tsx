import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function Button({ variant = "primary", className = "", type = "button", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button type={type} className={`button button-${variant} ${className}`} {...props} />;
}

export function IconButton({ label, icon, ...props }: Omit<ComponentProps<"button">, "children"> & { label: string; icon: IconName }) {
  return <Button variant="ghost" {...props} className={`icon-button ${props.className ?? ""}`} aria-label={label} title={label}><Icon name={icon} /></Button>;
}

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`control ${className}`} {...props} />;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warning" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="page-description">{description}</p></div>{action && <div className="page-action">{action}</div>}</div>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{description && <p className="muted small">{description}</p>}</div>{action}</div>;
}

export function EmptyState({ title, description, action, icon = "search" }: { title: string; description: string; action?: ReactNode; icon?: IconName }) {
  return <div className="empty-state"><span className="state-icon"><Icon name={icon} /></span><h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="empty-state error-state" role="alert"><span className="state-icon"><Icon name="warning" /></span><h2>A little pause in the preview</h2><p>This is a sample error state. No network request was made.</p><Button variant="secondary" onClick={onRetry}><Icon name="refresh" />Return to profiles</Button></div>;
}

export function ProfileSkeletons({ preview = true }: { preview?: boolean } = {}) {
  return <div><p className="muted small" role="status">{preview ? "Loading-state preview. No request is running." : "Loading your workspace?"}</p><div className="profile-grid skeleton-grid" aria-hidden="true">{[1, 2, 3, 4].map(id => <div className="panel skeleton-card" key={id}><div className="skeleton skeleton-photo" /><div className="skeleton-copy"><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /><div className="skeleton skeleton-line" /></div></div>)}</div></div>;
}
