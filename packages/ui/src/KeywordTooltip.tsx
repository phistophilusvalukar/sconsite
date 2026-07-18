import { useId, useState, type ReactElement, type ReactNode } from "react";

export function KeywordTooltip({ keyword, description, children }: { keyword: string; description: string; children?: ReactNode }): ReactElement {
  const id = useId(); const [open, setOpen] = useState(false);
  return <span className="scon-tooltip"><button type="button" aria-describedby={open ? id : undefined} aria-expanded={open} onClick={() => setOpen((value) => !value)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>{children ?? keyword}</button>{open && <span role="tooltip" id={id}>{description}</span>}</span>;
}
