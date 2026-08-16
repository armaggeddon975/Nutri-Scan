import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, Sparkles } from "lucide-react";

export const STATUS_ICONS = {
  ready: Sparkles,
  loading: Loader2,
  success: CheckCircle2,
  warning: ShieldAlert,
  error: AlertCircle,
};

export function StatusLine({ status }) {
  const Icon = STATUS_ICONS[status.type] || Sparkles;

  return (
    <div className={`status-line ${status.type}`} role="status" aria-live="polite">
      <Icon size={18} className={status.type === "loading" ? "spin" : ""} aria-hidden="true" />
      <span>{status.message}</span>
    </div>
  );
}
