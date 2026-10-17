import { useEffect, useState } from "react";
import type { Order } from "../../../shared/competition";
import { brl } from "../../../shared/money";
import { api } from "../api";
import { OrderSummary } from "./ArenaDashboard";

export default function Pedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api<Order[]>("GET", "/pedidos").then(setOrders); }, []);
  return (
    <>
      <h1>Pedidos internos</h1>
      <p className="sub">Pedidos gerados a partir do vencedor de uma arena. Preservam origem, destino, entrega, modalidade, responsabilidade, prazo e custos. Nenhuma compra externa é transmitida.</p>
      {!orders.length && <div className="card muted">Nenhum pedido gerado.</div>}
      {orders.map((o) => (
        <div className="card" key={o.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div><b>{o.id}</b> · {o.supplierName} · {new Date(o.createdAt).toLocaleString("pt-BR")} · arena {o.arenaId}</div>
            <div className="row"><b>{brl(o.disbursementCents)}</b><button className="link" onClick={() => setOpen(open === o.id ? null : o.id)}>{open === o.id ? "ocultar" : "detalhes"}</button></div>
          </div>
          {open === o.id && <div style={{ marginTop: 10 }}><OrderSummary order={o} replayed={false} /></div>}
        </div>
      ))}
    </>
  );
}
