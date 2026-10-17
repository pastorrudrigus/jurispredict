import { useEffect, useState } from "react";
import type { RankedProposal, UnavailableItem } from "../../../shared/competition";
import { brl } from "../../../shared/money";
import { api, ApiFailure } from "../api";
import { ErrorBox } from "../components/ui";

interface BaseQuote { arenaId: string; createdAt: string; status: string; version: number; unavailable: UnavailableItem[]; ranking: RankedProposal[] }

export default function Cotacoes() {
  const [quotes, setQuotes] = useState<BaseQuote[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<BaseQuote[]>("GET", "/cotacoes").then(setQuotes).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const order = async (q: BaseQuote) => {
    setError(null);
    setMsg(null);
    try {
      const out = await api<{ order: { id: string }; replayed: boolean }>("POST", `/cotacoes/${q.arenaId}/pedido`, { expectedVersion: q.version, acknowledgeShortage: true });
      setMsg(`Pedido ${out.order.id} ${out.replayed ? "já existia (sem duplicação)" : "gerado"} com as mesmas regras da arena.`);
    } catch (e) {
      setError(e instanceof ApiFailure ? `${e.message} (${e.code})` : String(e));
    }
    load();
  };

  return (
    <>
      <h1>Cotações-base</h1>
      <p className="sub">Tabela inicial de cada arena, sem negociação. Pedir pela cotação passa pelas <b>mesmas regras</b> da arena (encerramento, reconhecimento da falta, versão e revalidação).</p>
      <ErrorBox error={error} onClose={() => setError(null)} />
      {msg && <div className="alert ok">{msg}</div>}
      {!quotes.length && <div className="card muted">Nenhuma arena criada ainda. Ative a competição na central de negociação.</div>}
      {quotes.map((q) => (
        <div className="card" key={q.arenaId}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>{q.arenaId} <span className="pill info">{q.status}</span></h2>
            <button onClick={() => order(q)}>Gerar pedido pela cotação</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Fornecedor</th><th className="n">Mercadorias</th><th className="n">Logística</th><th className="n">Desembolso</th><th className="n">Custo econômico</th><th>Situação</th></tr></thead>
              <tbody>{q.ranking.map((r) => (
                <tr key={r.supplierId}><td>{r.position ?? "—"}</td><td>{r.supplierName}</td><td className="n">{brl(r.merchandiseCents)}</td><td className="n">{brl(r.logisticsCents)}</td>
                  <td className="n">{brl(r.disbursementCents)}</td><td className="n">{brl(r.economicCents)}</td><td>{r.apt ? <span className="pill ok">apta</span> : <span className="pill bad" title={r.reasons.join("; ")}>inapta</span>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
