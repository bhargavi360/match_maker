"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { IconButton } from "./ui";

export function Dialog({ open, onClose, title, children, className = "", returnFocusRef }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter(element => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) { dialog.close(); returnFocusRef?.current?.focus({ preventScroll: true }); }
    if (open) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = previousOverflow; };
    }
  }, [open, returnFocusRef]);
  return <dialog ref={ref} className={`dialog ${className}`} aria-labelledby={titleId} onKeyDown={keepFocusInside} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog-inner"><div className="dialog-heading"><h2 id={titleId}>{title}</h2><IconButton icon="close" label={`Close ${title.toLowerCase()}`} onClick={onClose} /></div>{children}</div></dialog>;
}
