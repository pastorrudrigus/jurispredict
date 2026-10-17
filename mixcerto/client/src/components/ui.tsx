import type { ReactNode } from "react";

export const Kpi = ({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) => (
  <div className="kpi"><div className="l">{label}</div><div className="v">{value}</div>{hint && <div className="h">{hint}</div>}</div>
);

export const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => (
  <div className="modal-bg" onClick={onClose}>
    <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button className="link" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      {children}
    </div>
  </div>
);

export const ErrorBox = ({ error, onClose }: { error: string | null; onClose?: () => void }) =>
  error ? (
    <div className="alert bad row" style={{ justifyContent: "space-between" }}>
      <span>{error}</span>{onClose && <button className="link" onClick={onClose}>fechar</button>}
    </div>
  ) : null;
