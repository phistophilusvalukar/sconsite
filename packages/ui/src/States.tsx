import type { ReactElement, ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }): ReactElement { return <div className="scon-state" role="status" aria-live="polite"><span className="scon-spinner" aria-hidden="true" />{label}</div>; }
export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }): ReactElement { return <section className="scon-state"><h2>{title}</h2><p>{message}</p>{action}</section>; }
export function ErrorState({ title = "Something went wrong", message, retry }: { title?: string; message: string; retry?: () => void }): ReactElement { return <section className="scon-state scon-state--error" role="alert"><h2>{title}</h2><p>{message}</p>{retry && <button type="button" onClick={retry}>Try again</button>}</section>; }
