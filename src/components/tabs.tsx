"use client";

import { useId, useRef } from "react";

export function Tabs({ labels, selected, onSelect, children, disabled=[], label="Workflow preview steps" }: { labels: readonly string[]; selected: number; onSelect: (index: number) => void; children: React.ReactNode; disabled?:boolean[];label?:string }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return <><div className="step-tabs" role="tablist" aria-label={label}>{labels.map((label, index) => <button key={label} ref={element => { refs.current[index] = element; }} disabled={disabled[index]} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} className={`step-tab ${selected === index ? "selected" : ""}`} onClick={() => onSelect(index)} onKeyDown={event => { let next = selected; if (event.key === "ArrowRight") next = (selected + 1) % labels.length; else if (event.key === "ArrowLeft") next = (selected - 1 + labels.length) % labels.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = labels.length - 1; else return; if(disabled[next]) return; event.preventDefault(); onSelect(next); refs.current[next]?.focus(); }}><span className="step-number">{index + 1}</span><span>{label}</span></button>)}</div><div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`} tabIndex={0} className="workflow-panel">{children}</div></>;
}
