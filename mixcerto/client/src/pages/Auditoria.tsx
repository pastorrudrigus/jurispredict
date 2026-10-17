import { useEffect, useState } from "react";
import type { AuditEvent } from "../../../shared/contracts";
import { api } from "../api";

export default function Auditoria() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  useEffect(() => { api<AuditEvent[]>("GET", "/auditoria").then(setEvents); }, []);
  return (
    <>
      <h1>Auditoria</h1>
      <p className="sub">Histórico preservado de arenas, rodadas, lances, ajustes de frete, alterações de catálogo e pedidos.</p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>#</th><th>Quando</th><th>Ator</th><th>Ação</th><th>Entidade</th><th>Detalhe</th></tr></thead>
          <tbody>{events.map((e) => (
            <tr key={e.id}><td>{e.id}</td><td>{new Date(e.at).toLocaleString("pt-BR")}</td><td>{e.actor}</td><td><code>{e.action}</code></td><td>{e.entity}</td><td className="wrap small">{e.detail}</td></tr>
          ))}</tbody>
        </table>
        {!events.length && <p className="muted">Sem eventos.</p>}
      </div>
    </>
  );
}
