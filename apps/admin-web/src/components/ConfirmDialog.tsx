import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui";

export function ConfirmDialog({ open, title, description, children, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, busy = false, onConfirm, onCancel }: {
  open: boolean; title: string; description?: string; children?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return <div className="rx-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="rx-dialog" role="alertdialog" aria-modal="true" aria-labelledby="rx-confirm-title" aria-describedby={description ? "rx-confirm-description" : undefined}>
      <div className="rx-dialog-icon"><AlertTriangle size={20}/></div><h2 id="rx-confirm-title">{title}</h2>
      {description ? <p id="rx-confirm-description">{description}</p> : null}
      {children}
      <div className="rx-dialog-actions"><Button variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button><Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy} loading={busy}>{confirmLabel}</Button></div>
    </section>
  </div>;
}
