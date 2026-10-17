import { useEffect, useState } from "react";
import { ArrowRight, Boxes, FileSpreadsheet, Gavel, Landmark, MapPin, Sparkles, Target, TrendingDown, Truck, Zap } from "lucide-react";
import type { ArenaView, Order } from "../../../shared/competition";
import { brl } from "../../../shared/money";
import { api, errorText, go } from "../api";
import { useAuth } from "../auth";
import { Kpi, useToast } from "../components/ui";

interface ArenaSummary { id: string; title: string; items: number; createdAt: string; status: string; leader: string | null; bestEconomicCents: number | null; orderId: string | null }

export default function Home() {
  const { can, user } = useAuth();
  const toast = useToast();
  const [arenas, setArenas] = useState<ArenaSummary[]>([]);
  const [latest, setLatest] = useState<ArenaView | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ArenaSummary[]>("GET", "/arenas").then((l) => {
      setArenas(l);
      if (l[0]) api<ArenaView>("GET", `/arenas/${l[0].id}`).then(setLatest);
    });
    api<Order[]>("GET", "/pedidos").then(setOrders);
  }, []);

  const activate = async () => {
    setBusy(true);
    try {
      const a = await api<ArenaView>("POST", "/arenas", {});
      go(`/arena?id=${a.id}`);
    } catch (e) { toast(errorText(e), "bad"); setBusy(false); }
  };

  const lead = latest?.ranking.find((r) => r.position === 1);
  const initialBest = latest?.timeline[0]?.bestEconomicCents ?? null;
  const improvement = lead && initialBest !== null ? initialBest - lead.economicCents : 0;
  const totalOrders = orders.reduce((s, o) => s + o.disbursementCents, 0);
  const totalImprovement = orders.reduce((s, o) => s + (o.improvementVsInitialCents ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Inteligência de compras</div>
          <h1>Olá, {user?.name.split(" ")[0]}. Sua central de melhores compras.</h1>
          <p className="sub">Concorrência inteligente, condições claras e decisões que você explica.</p>
        </div>
        <div className="row">
          <a className="btn" href="#/cotacoes?tab=importar"><FileSpreadsheet size={16} /> Importar mix</a>
          {can("negociar") && <a className="btn primary" href="#/cotacoes?tab=nova"><Sparkles size={16} /> Nova cotação</a>}
        </div>
      </div>

      <section className="hero">
        <div>
          <div className="tags"><span className="live">INTELIGÊNCIA EM MOVIMENTO</span><span className="box">DESTINO DF</span></div>
          <h1>Sua negociação,<br /><em>um passo à frente.</em></h1>
          <p>Faça os fornecedores competirem pelo seu mix. Preço, frete, prazo e condição de pagamento na mesma decisão — sem esconder nenhum custo.</p>
          <div className="row">
            {can("negociar") && <button className="lime lg" onClick={activate} disabled={busy}><Zap size={17} /> Ativar competição do mix</button>}
            {latest && <a className="btn ghost" style={{ color: "#fff" }} href={`#/arena?id=${latest.id}`}>Abrir arena atual <ArrowRight size={16} /></a>}
            <a className="btn ghost" style={{ color: "#fff" }} href="#/guia">Como a compra é decidida <ArrowRight size={16} /></a>
          </div>
        </div>
        <div className="hero-panel">
          <div className="eyebrow" style={{ color: "var(--lime)" }}>Menor custo apto vence</div>
          <p style={{ margin: "10px 0 2px", opacity: .7 }}>{lead ? "Líder atual" : "Sua próxima melhor compra"}</p>
          <div className="big">{lead ? lead.supplierName : "5 fornecedores"}</div>
          <small style={{ opacity: .7 }}>{lead ? `${brl(lead.economicCents)} de custo econômico` : "3 rodadas · um mix comparável"}</small>
          <div className="ufs">{["MG", "SP", "GO", "PR", "BA"].map((u) => <span key={u}>{u}</span>)}<span className="dest">→ DF</span></div>
          <small style={{ opacity: .6 }}>Dados sintéticos · decisão auditável</small>
        </div>
      </section>

      <div className="kpis">
        <Kpi label="Melhoria na negociação" icon={<TrendingDown size={17} />} tone={improvement > 0 ? "good" : undefined}
             value={brl(improvement)} hint={latest ? `${latest.id} · vs. melhor proposta inicial` : "Ative a arena para medir o resultado"} />
        <Kpi label="Mix comparável" icon={<Boxes size={17} />} value={<>{latest ? latest.basket.length : 20} <small>itens</small></>}
             hint={latest?.unavailable.length ? `${latest.unavailable.length} indisponível(is), explícito(s)` : "Mesmos produtos, unidades e quantidades"} />
        <Kpi label="Pressão competitiva" icon={<Target size={17} />} value={<>{latest?.simulatedRoundsUsed ?? 0}<small>/3 rodadas</small></>} hint="Melhorias somente por ação explícita" />
        <Kpi label="Pedidos gerados" icon={<MapPin size={17} />} value={<>{orders.length} <small>· {brl(totalOrders)}</small></>} hint={`Melhoria acumulada: ${brl(totalImprovement)}`} />
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <a className="link-card" href="#/arena"><div className="ic"><Gavel size={20} /></div><div><div className="eyebrow">Arena</div><b>Competição com regras</b><small>Rodadas, ranking e pedido do vencedor.</small></div><ArrowRight className="go" size={18} /></a>
        <a className="link-card" href="#/tributos"><div className="ic"><Landmark size={20} /></div><div><div className="eyebrow">Laboratório tributário</div><b>O crédito muda a conta?</b><small>ICMS, ST e crédito para Brasília/DF.</small></div><ArrowRight className="go" size={18} /></a>
        <a className="link-card" href="#/transporte"><div className="ic"><Truck size={20} /></div><div><div className="eyebrow">Inteligência logística</div><b>Frete pago ou absorvido</b><small>Sem somar o mesmo custo duas vezes.</small></div><ArrowRight className="go" size={18} /></a>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h2>Arenas recentes</h2><a href="#/cotacoes" className="small">ver cotações</a></div>
          {!arenas.length && <p className="muted">Nenhuma arena ainda.</p>}
          <div className="table-wrap">
            <table>
              <tbody>
                {arenas.slice(0, 6).map((a) => (
                  <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => go(`/arena?id=${a.id}`)}>
                    <td><b>{a.title}</b><div className="small muted">{a.id} · {new Date(a.createdAt).toLocaleDateString("pt-BR")} · {a.items} itens</div></td>
                    <td>{a.leader ?? "—"}</td>
                    <td className="n">{a.bestEconomicCents !== null ? brl(a.bestEconomicCents) : "—"}</td>
                    <td>{a.orderId ? <span className="pill ok">{a.orderId}</span> : <span className={`pill ${a.status === "aberta" ? "info" : "neutral"}`}>{a.status}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Últimos pedidos</h2><a href="#/pedidos" className="small">ver todos</a></div>
          {!orders.length && <p className="muted">Nenhum pedido gerado.</p>}
          <div className="table-wrap">
            <table>
              <tbody>
                {orders.slice(0, 6).map((o) => (
                  <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => go(`/pedidos?id=${o.id}`)}>
                    <td><b>{o.id}</b><div className="small muted">{o.supplierName} · {o.origin.uf} → {o.destination.uf}</div></td>
                    <td className="n">{brl(o.disbursementCents)}</td>
                    <td className="n" style={{ color: "var(--ok)" }}>{o.improvementVsInitialCents ? `−${brl(o.improvementVsInitialCents)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
