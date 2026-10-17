import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import type { Order } from "../../../shared/competition";
import { brl } from "../../../shared/money";
import { api, hashParam } from "../api";
import { Empty, Kpi, PageHead } from "../components/ui";
import { OrderSummary } from "./ArenaDashboard";

export default function Pedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [open, setOpen] = useState<string | null>(hashParam("id"));
  useEffect(() => { api<Order[]>("GET", "/pedidos").then(setOrders); }, []);
  const total = orders.reduce((s, o) => s + o.disbursementCents, 0);
  const improvement = orders.reduce((s, o) => s + (o.improvementVsInitialCents ?? 0), 0);
  return (
    <>
      <PageHead eyebrow="Pedidos" title="Pedidos internos" sub="Gerados a partir do vencedor de cada arena. Preservam origem, destino, entrega, modalidade, responsabilidade, prazo e custos. Nenhuma compra externa é transmitida." />
      {orders.length > 0 && (
        <div className="kpis">
          <Kpi label="Pedidos" value={orders.length} />
          <Kpi label="Desembolso total" value={brl(total)} />
          <Kpi label="Melhoria acumulada" value={brl(improvement)} tone={improvement > 0 ? "good" : undefined} hint="vs. melhor proposta inicial de cada arena" />
        </div>
      )}
      {!orders.length && <div className="card"><Empty icon={<Receipt size={26} />} title="Nenhum pedido gerado" text="Encerre uma arena e gere o pedido do vencedor." action={<a className="btn primary" href="#/arena">Ir para a arena</a>} /></div>}
      {orders.map((o) => (
        <div className={`card ${open && open !== o.id ? "no-print" : ""}`} key={o.id}>
          <div className="card-head">
            <div><b style={{ fontSize: 16 }}>{o.id}</b> <span className="pill ok">interno</span><div className="small muted">{o.supplierName} · {o.origin.city}/{o.origin.uf} → {o.destination.city}/{o.destination.uf} · {new Date(o.createdAt).toLocaleString("pt-BR")} · <a href={`#/arena?id=${o.arenaId}`}>{o.arenaId}</a></div></div>
            <div className="row"><b style={{ fontSize: 16 }}>{brl(o.disbursementCents)}</b><button className="link no-print" onClick={() => setOpen(open === o.id ? null : o.id)}>{open === o.id ? "ocultar" : "detalhes"}</button></div>
          </div>
          {open === o.id && <OrderSummary order={o} />}
        </div>
      ))}
    </>
  );
}
