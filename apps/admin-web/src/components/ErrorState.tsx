import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, Notice } from "./ui";
export function ErrorState({ title = "Unable to load this workspace", message, onRetry, retryDisabled = false }: { title?: string; message: string; onRetry?: () => void; retryDisabled?: boolean }) {
  return <section className="rx-error-state" role="alert"><Notice tone="danger"><strong>{title}</strong><p>{message}</p></Notice>{onRetry ? <Button variant="secondary" onClick={onRetry} disabled={retryDisabled}><RefreshCw size={15}/>Try again</Button> : <AlertTriangle size={18} aria-hidden="true"/>}</section>;
}
