import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { AuditEvent } from "../../../shared/contracts";
import { api, download, toCsv } from "../api";
import { PageHead } from "../components/ui";

export default function Auditoria() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  useEffect(() => { api<AuditEvent[]>("GET", "/auditoria").then(setEvents); }, []);
  const kinds = useMemo(() => [...new Set(events.map((e) => e.action.split(".")[0]))].sort(), [events]);
  const filtered = events.filter((e) => (!kind || e.action.startsWith(kind + ".")) && (!q || `${e.actor} ${e.action} ${e.entity} ${e.detail}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <PageHead eyebrow="Trilha de auditoria" title="Quem fez o quê, e quando." sub="Histórico preservado de logins, arenas, rodadas, lances, fretes, catálogo, verbas, usuários e pedidos."
        actions={<button onClick={() => download("auditoria.csv", toCsv(filtered as unknown as Record<string, unknown>[]), "text/csv")}><Download size={16} /> Exportar CSV</button>} />
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Buscar por usuário, ação, entidade…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <span className="small muted">{filtered.length} evento(s)</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Quando</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Detalhe</th></tr></thead>
            <tbody>{filtered.map((e) => (
              <tr key={e.id}><td>{e.id}</td><td className="small">{new Date(e.at).toLocaleString("pt-BR")}</td><td>{e.actor}</td><td><code>{e.action}</code></td><td>{e.entity}</td><td className="wrap small">{e.detail}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {!filtered.length && <p className="muted">Sem eventos.</p>}
      </div>
    </>
  );
}
