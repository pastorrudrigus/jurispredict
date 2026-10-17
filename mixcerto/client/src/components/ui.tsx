import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export const Kpi = ({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "good" }) => (
  <div className={`kpi ${tone ?? ""}`}>
    <div className="top"><span>{label}</span>{icon}</div>
    <div className="v">{value}</div>
    {hint && <div className="h">{hint}</div>}
  </div>
);

export const PageHead = ({ eyebrow, title, sub, actions }: { eyebrow?: string; title: string; sub?: ReactNode; actions?: ReactNode }) => (
  <div className="page-head">
    <div>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {sub && <p className="sub">{sub}</p>}
    </div>
    {actions && <div className="row">{actions}</div>}
  </div>
);

export const Alert = ({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "ok"; children: ReactNode }) => {
  const Icon = { info: Info, warn: AlertTriangle, bad: XCircle, ok: CheckCircle2 }[tone];
  return <div className={`alert ${tone}`}><Icon size={17} /><div>{children}</div></div>;
};

export const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => (
  <div className="modal-bg" onClick={onClose}>
    <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
      <div className="card-head">
        <h2>{title}</h2>
        <button className="ghost" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </div>
      {children}
    </div>
  </div>
);

export const ErrorBox = ({ error, onClose }: { error: string | null; onClose?: () => void }) =>
  error ? (
    <div className="alert bad">
      <XCircle size={17} />
      <div>{error}</div>
      {onClose && <button className="ghost" style={{ padding: 2, color: "inherit" }} onClick={onClose} aria-label="Fechar"><X size={15} /></button>}
    </div>
  ) : null;

export const Empty = ({ icon, title, text, action }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) => (
  <div className="empty"><div className="ic">{icon}</div><h3>{title}</h3>{text && <p>{text}</p>}{action}</div>
);

// ---------- Toasts ----------
interface Toast { id: number; text: string; tone?: "bad" }
const ToastCtx = createContext<(text: string, tone?: "bad") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone?: "bad") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone ?? ""}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export const initials = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("") || "?";
