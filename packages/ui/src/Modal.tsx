import { useEffect, useId, useRef, type ReactElement, type ReactNode } from "react";

export function Modal({ open, title, children, onClose, closeLabel = "Close" }: { open: boolean; title: string; children: ReactNode; onClose: () => void; closeLabel?: string }): ReactElement | null {
  const titleId = useId(); const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const previous = document.activeElement as HTMLElement | null; panel.current?.focus(); const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); previous?.focus(); }; }, [open, onClose]);
  if (!open) return null;
  return <div className="scon-modal__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="scon-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panel}><header><h2 id={titleId}>{title}</h2><button type="button" onClick={onClose} aria-label={closeLabel}>×</button></header><div className="scon-modal__body">{children}</div></div></div>;
}
