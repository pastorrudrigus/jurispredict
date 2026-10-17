import { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ArenaView, Order, RankedProposal } from "../../../shared/competition";
import type { LogisticsTerms } from "../../../shared/contracts";
import { MODAL_LABEL } from "../../../shared/contracts";
import { brl, pct } from "../../../shared/money";
import { describeResponsibility } from "../../../shared/transport";
import { api, ApiFailure, download, SUPPLIER_COLORS, toCsv } from "../api";
import { LogisticsForm } from "../components/LogisticsForm";
import { ErrorBox, Kpi, Modal } from "../components/ui";

interface ArenaSummary { id: string; seq: number; createdAt: string; status: string; leader: string | null; orderId: string | null }

const short = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function ArenaDashboard() {
  const [list, setList] = useState<ArenaSummary[]>([]);
  const [arena, setArena] = useState<ArenaView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"radar" | "evolucao">("radar");
  const [freightFor, setFreightFor] = useState<RankedProposal | null>(null);
  const [bidSupplier, setBidSupplier] = useState("");
  const [bidPct, setBidPct] = useState("");
  const [ack, setAck] = useState(false);
  const [order, setOrder] = useState<{ order: Order; replayed: boolean } | null>(null);

  const loadList = useCallback(async () => {
    const l = await api<ArenaSummary[]>("GET", "/arenas");
    setList(l);
    return l;
  }, []);

  const open = useCallback(async (id: string) => {
    const a = await api<ArenaView>("GET", `/arenas/${id}`);
    setArena(a);
    setOrder(null);
    setAck(false);
    if (a.orderId) setOrder({ order: await api<Order>("GET", `/pedidos/${a.orderId}`), replayed: true });
  }, []);

  useEffect(() => {
    loadList().then((l) => l[0] && open(l[0].id)).catch((e) => setError(e.message));
  }, [loadList, open]);

  const run = async (fn: () => Promise<ArenaView | void>) => {
    setBusy(true);
    setError(null);
    try {
      const a = await fn();
      if (a) setArena(a);
      await loadList();
    } catch (e) {
      setError(e instanceof ApiFailure ? `${e.message} (${e.code})` : String(e));
      if (e instanceof ApiFailure && e.code === "VERSION_CONFLICT" && arena) await open(arena.id);
    } finally {
      setBusy(false);
    }
  };

  const createArena = () => run(async () => {
    const a = await api<ArenaView>("POST", "/arenas", {});
    setOrder(null);
    setAck(false);
    return a;
  });
  const simulate = () => run(() => api<ArenaView>("POST", `/arenas/${arena!.id}/rodadas`, { expectedVersion: arena!.version }));
  const close = () => run(() => api<ArenaView>("POST", `/arenas/${arena!.id}/encerrar`, { expectedVersion: arena!.version }));
  const bid = () => run(() => api<ArenaView>("POST", `/arenas/${arena!.id}/lances`, {
    supplierId: bidSupplier, reductionPct: Number(bidPct.replace(",", ".")), expectedVersion: arena!.version,
  }));
  const saveFreight = (supplierId: string, terms: LogisticsTerms) => run(async () => {
    const a = await api<ArenaView>("PUT", `/arenas/${arena!.id}/propostas/${supplierId}/logistica`, { terms, expectedVersion: arena!.version });
    setFreightFor(null);
    return a;
  });
  const makeOrder = () => run(async () => {
    const out = await api<{ order: Order; replayed: boolean }>("POST", `/arenas/${arena!.id}/pedido`, {
      expectedVersion: arena!.version, acknowledgeShortage: ack,
    });
    setOrder(out);
    return api<ArenaView>("GET", `/arenas/${arena!.id}`);
  });

  if (!arena)
    return (
      <>
        <h1>Central de negociação</h1>
        <p className="sub">Destino inicial: <b>Brasília/DF</b>. Cinco fornecedores fictícios competem pelo mesmo mix de compras.</p>
        <ErrorBox error={error} onClose={() => setError(null)} />
        <div className="card">
          <p>Nenhuma arena ativa. A competição usa o mix original de vinte produtos: itens que nenhum fornecedor consegue atender ficam explícitos como indisponíveis.</p>
          <button className="primary" disabled={busy} onClick={createArena}>Ativar competição do mix</button>
        </div>
      </>
    );

  const apt = arena.ranking.filter((r) => r.position !== null);
  const leader = apt[0];
  const initial = arena.timeline[0];
  const initialBest = initial?.bestEconomicCents ?? null;
  const initialBestDisb = initial ? Math.min(...Object.values(initial.disbursement).filter((v): v is number => v !== null)) : null;
  const closed = arena.status === "encerrada";
  const roundsLeft = arena.params.maxRounds - arena.simulatedRoundsUsed;
  const winner = closed ? arena.ranking.find((r) => r.supplierId === arena.closing!.winnerSupplierId) : null;

  const radarData = arena.ranking.map((r) => ({
    name: r.supplierName,
    Mercadorias: r.merchandiseCents / 100,
    Frete: r.freightCents / 100,
    "Seguro e despesas": (r.insuranceCents + r.expensesCents) / 100,
    apt: r.apt,
  }));
  const evolution = arena.timeline.map((t) => {
    const row: Record<string, number | string | null> = { step: t.step === 0 ? "Inicial" : `#${t.step}`, label: t.label };
    for (const r of arena.ranking) row[r.supplierId] = t.economic[r.supplierId] !== null ? t.economic[r.supplierId]! / 100 : null;
    row.melhor = t.bestEconomicCents !== null ? t.bestEconomicCents / 100 : null;
    return row;
  });

  const exportScenario = (fmt: "json" | "csv") => {
    if (fmt === "json") return download(`${arena.id}.json`, JSON.stringify(arena, null, 2));
    download(`${arena.id}-ranking.csv`, toCsv(arena.ranking.map((r) => ({
      posicao: r.position ?? "inapta", fornecedor: r.supplierName, origem: `${r.origin.city}/${r.origin.uf}`,
      reducao_pct: r.reductionPct, mercadorias: r.merchandiseCents / 100, frete: r.freightCents / 100,
      seguro: r.insuranceCents / 100, despesas: r.expensesCents / 100, desembolso: r.disbursementCents / 100,
      custo_economico: r.economicCents / 100, prazo_dias: r.leadTimeDays, pagamento_dias: r.paymentTermDays,
      motivos_inaptidao: r.reasons.join(" | "),
    }))), "text/csv");
  };

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Central de negociação</h1>
          <p className="sub">
            Destino <b>{arena.params.destination.city}/{arena.params.destination.uf}</b> · {arena.id} · versão {arena.version} ·{" "}
            {closed ? <span className="pill info">encerrada</span> : <span className="pill ok">aberta</span>}
          </p>
        </div>
        <div className="row">
          {list.length > 1 && (
            <select value={arena.id} onChange={(e) => open(e.target.value)} aria-label="Arena">
              {list.map((a) => <option key={a.id} value={a.id}>{a.id} — {a.status}{a.orderId ? ` · ${a.orderId}` : ""}</option>)}
            </select>
          )}
          <button disabled={busy} onClick={createArena}>Nova arena demonstrativa</button>
        </div>
      </div>

      <ErrorBox error={error} onClose={() => setError(null)} />

      {arena.unavailable.length > 0 && (
        <div className="alert warn">
          <b>{arena.basket.length} de {arena.basket.length + arena.unavailable.length} itens podem ser atendidos.</b>{" "}
          Indisponível: {arena.unavailable.map((u) => `${u.productName} (${u.quantity})`).join(", ")}. O item permanece explícito — não entra como economia.
        </div>
      )}
      {arena.basketDrift && !closed && (
        <div className="alert bad">A cesta atendível mudou no catálogo (estoque, validade ou vida mínima). Encerrar será bloqueado: crie uma nova arena.</div>
      )}

      <div className="kpis">
        <Kpi label="Melhor custo econômico" value={leader ? brl(leader.economicCents) : "—"} hint={leader?.supplierName} />
        <Kpi label="Desembolso do líder" value={leader ? brl(leader.disbursementCents) : "—"} hint={leader ? `pagamento em ${leader.paymentTermDays} dias` : undefined} />
        <Kpi label="Melhoria vs. melhor inicial"
             value={leader && initialBest !== null ? brl(initialBest - leader.economicCents) : "—"}
             hint={leader && initialBestDisb !== null ? `desembolso: ${brl(initialBestDisb - leader.disbursementCents)} · mesma cesta` : undefined} />
        <Kpi label="Rodadas simuladas" value={`${arena.simulatedRoundsUsed}/${arena.params.maxRounds}`} hint={`teto ${brl(arena.params.ceilingCents)} · prazo máx. ${arena.params.maxLeadTimeDays}d`} />
      </div>

      <div className="card">
        <div className="row">
          <button className="primary" disabled={busy || closed || roundsLeft <= 0} onClick={simulate}>
            Simular próxima rodada {roundsLeft > 0 ? `(${arena.simulatedRoundsUsed + 1}/${arena.params.maxRounds})` : "(limite atingido)"}
          </button>
          <button disabled={busy || closed} onClick={close}>Encerrar e selecionar</button>
          <span style={{ flex: 1 }} />
          <button onClick={() => exportScenario("csv")}>Exportar CSV</button>
          <button onClick={() => exportScenario("json")}>Exportar JSON</button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Em cada rodada o desafiante apto mais próximo do líder melhora a tabela em {arena.params.roundStepPct.toLocaleString("pt-BR")} p.p. Simulação determinística — não é previsão do comportamento dos vendedores.
        </p>
      </div>

      <div className="card">
        <div className="tabs">
          <button className={tab === "radar" ? "on" : ""} onClick={() => setTab("radar")}>Radar de propostas</button>
          <button className={tab === "evolucao" ? "on" : ""} onClick={() => setTab("evolucao")}>Evolução das rodadas</button>
        </div>
        {tab === "radar" ? (
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={radarData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--muted)" }} interval={0} />
                <YAxis tickFormatter={(v) => short(v * 100)} tick={{ fontSize: 12, fill: "var(--muted)" }} width={80} />
                <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
                <Legend />
                <Bar dataKey="Mercadorias" stackId="a" fill="var(--merch)" />
                <Bar dataKey="Frete" stackId="a" fill="var(--freight)" />
                <Bar dataKey="Seguro e despesas" stackId="a" fill="var(--exp)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={evolution} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="step" tick={{ fontSize: 12, fill: "var(--muted)" }} />
                <YAxis domain={["auto", "auto"]} tickFormatter={(v) => short(v * 100)} tick={{ fontSize: 12, fill: "var(--muted)" }} width={80} />
                <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} labelFormatter={(_l, p) => (p?.[0]?.payload?.label as string) ?? ""} />
                <Legend />
                {arena.ranking.filter((r) => r.apt).map((r) => (
                  <Line key={r.supplierId} dataKey={r.supplierId} name={r.supplierName} stroke={SUPPLIER_COLORS[r.supplierId]} strokeWidth={2} dot connectNulls />
                ))}
                <Line dataKey="melhor" name="Melhor compra" stroke="var(--text)" strokeDasharray="5 4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          {tab === "radar"
            ? "Composição do desembolso por proposta: mercadorias, frete incremental e seguro/despesas — cada um entra uma única vez."
            : "Custo econômico por proposta apta em cada alteração registrada; o orçamento inicial é preservado."}
        </p>
      </div>

      <div className="card">
        <h2>Ranking das propostas</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Fornecedor</th><th>Origem</th><th className="n">Redução</th><th className="n">Mercadorias</th>
                <th className="n">Frete</th><th className="n">Seg.+desp.</th><th className="n">Desembolso</th><th className="n">Custo econômico</th>
                <th className="n">Prazo</th><th>Logística</th><th>Situação</th><th></th>
              </tr>
            </thead>
            <tbody>
              {arena.ranking.map((r) => (
                <tr key={r.supplierId} className={winner?.supplierId === r.supplierId ? "selected" : ""}>
                  <td>{r.position ?? "—"}</td>
                  <td><span className="dot" style={{ background: SUPPLIER_COLORS[r.supplierId] }} />{r.supplierName}</td>
                  <td>{r.origin.city}/{r.origin.uf}</td>
                  <td className="n">{pct(r.reductionPct, 1)}</td>
                  <td className="n">{brl(r.merchandiseCents)}</td>
                  <td className="n">{r.freightAbsorbed ? <span className="pill info">absorvido</span> : brl(r.freightCents)}</td>
                  <td className="n">{brl(r.insuranceCents + r.expensesCents)}</td>
                  <td className="n">{brl(r.disbursementCents)}</td>
                  <td className="n"><b>{brl(r.economicCents)}</b></td>
                  <td className="n">{r.leadTimeDays}d</td>
                  <td className="small">{r.logistics.modals.map((m) => MODAL_LABEL[m]).join(" + ")}<br /><span className="muted">{r.logistics.sellerDelivers ? "entrega" : "retirada"} · paga: {r.logistics.freightIncluded ? "incluso" : r.logistics.paidBy}</span></td>
                  <td className="wrap">{r.apt ? <span className="pill ok">apta</span> : <><span className="pill bad">inapta</span><div className="small" style={{ color: "var(--bad)" }}>{r.reasons.slice(0, 3).join("; ")}{r.reasons.length > 3 ? "…" : ""}</div></>}</td>
                  <td><button className="link" disabled={closed} onClick={() => setFreightFor(r)}>Ajustar frete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">Ordem: custo econômico (desembolso a valor presente pelo prazo de pagamento, taxa anual {arena.params.annualRatePct}% base 365), desembolso, prazo e identificador estável — somente entre aptas.</p>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Por que este líder?</h2>
          <ul className="tight">{arena.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
        <div className="card">
          <h2>Melhoria de proposta (manual)</h2>
          <p className="small muted">Selecione um fornecedor e informe a redução <b>acumulada</b> sobre a tabela inicial (limite hipotético de {arena.params.maxReductionPct}%).</p>
          <div className="row">
            <select value={bidSupplier} onChange={(e) => setBidSupplier(e.target.value)} disabled={closed} aria-label="Fornecedor">
              <option value="">Fornecedor…</option>
              {arena.ranking.map((r) => <option key={r.supplierId} value={r.supplierId}>{r.supplierName} (atual {pct(r.reductionPct, 1)})</option>)}
            </select>
            <input style={{ width: 110 }} placeholder="% acumulado" value={bidPct} onChange={(e) => setBidPct(e.target.value)} disabled={closed} />
            <button disabled={busy || closed || !bidSupplier || !bidPct} onClick={bid}>Apresentar redução</button>
          </div>
          {arena.rounds.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead><tr><th>#</th><th>Tipo</th><th>Fornecedor</th><th className="n">De → para</th><th>Líder antes → depois</th></tr></thead>
                <tbody>
                  {arena.rounds.map((r) => {
                    const nm = (id: string | null) => arena.ranking.find((x) => x.supplierId === id)?.supplierName ?? "—";
                    return <tr key={r.number}><td>{r.number}</td><td>{r.kind}</td><td>{nm(r.supplierId)}</td><td className="n">{pct(r.fromPct, 1)} → {pct(r.toPct, 1)}</td><td>{nm(r.leaderBefore)} → {nm(r.leaderAfter)}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {closed && winner && (
        <div className="card">
          <h2>Vencedor selecionado: {winner.supplierName}</h2>
          <p className="sub">Desembolso {brl(arena.closing!.evaluation.disbursementCents)} · custo econômico {brl(arena.closing!.evaluation.economicCents)} · {describeResponsibility(winner.logistics)}.</p>
          {!order ? (
            <>
              {arena.unavailable.length > 0 && (
                <label className="c alert warn" style={{ display: "flex" }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  Reconheço que o pedido será parcial: {arena.unavailable.map((u) => `${u.productName} (${u.quantity})`).join(", ")} não será atendido.
                </label>
              )}
              <button className="primary" disabled={busy} onClick={makeOrder}>Gerar pedido do vencedor</button>
              <p className="small muted">O pedido revalida preço, estoque, condições e versão. Repetir a confirmação não duplica o pedido.</p>
            </>
          ) : (
            <OrderSummary order={order.order} replayed={order.replayed} />
          )}
        </div>
      )}

      {freightFor && (
        <FreightModal proposal={freightFor} onClose={() => setFreightFor(null)} onSave={(t) => saveFreight(freightFor.supplierId, t)} busy={busy} />
      )}
    </>
  );
}

function FreightModal({ proposal, onClose, onSave, busy }: { proposal: RankedProposal; onClose: () => void; onSave: (t: LogisticsTerms) => void; busy: boolean }) {
  const [t, setT] = useState<LogisticsTerms>(proposal.logistics);
  return (
    <Modal title={`Ajustar frete — ${proposal.supplierName}`} onClose={onClose}>
      <p className="small muted">Altera a proposta persistida na arena. Se o fornecedor absorve o frete, não há cobrança incremental; se o comprador paga transportadora ou retirada, o custo entra mesmo quando o vendedor não entrega. Seguro e despesas entram uma vez.</p>
      <LogisticsForm value={t} onChange={setT} />
      <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
        <button onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={busy} onClick={() => onSave(t)}>Salvar condições</button>
      </div>
    </Modal>
  );
}

export function OrderSummary({ order, replayed }: { order: Order; replayed?: boolean }) {
  return (
    <div>
      <div className="alert ok">
        Pedido interno <b>{order.id}</b> {replayed ? "(já existente — nenhuma duplicação)" : "criado"} para {order.supplierName}.
        {order.improvementVsInitialCents !== null && <> Melhoria nominal vs. melhor proposta inicial: <b>{brl(order.improvementVsInitialCents)}</b> (mesma cesta; valor sintético).</>}
      </div>
      <div className="kpis">
        <Kpi label="Mercadorias" value={brl(order.merchandiseCents)} hint={`${order.lines.length} itens · redução ${pct(order.reductionPct, 1)}`} />
        <Kpi label="Valor logístico" value={brl(order.logisticsCents)} hint={`frete ${brl(order.freightCents)} + seguro ${brl(order.insuranceCents)} + despesas ${brl(order.expensesCents)}`} />
        <Kpi label="Desembolso" value={brl(order.disbursementCents)} />
        <Kpi label="Custo econômico" value={brl(order.economicCents)} hint={`pagamento em ${order.logistics.paymentTermDays}d`} />
      </div>
      <p className="small">
        {order.origin.city}/{order.origin.uf} → {order.destination.city}/{order.destination.uf} · {order.logistics.modals.map((m) => MODAL_LABEL[m]).join(" + ")} ·
        prazo {order.logistics.leadTimeDays}d · {describeResponsibility(order.logistics)}
      </p>
      {order.shortages.length > 0 && <p className="small" style={{ color: "var(--warn)" }}>Falta reconhecida: {order.shortages.map((s) => s.productName).join(", ")}.</p>}
      <details>
        <summary>Itens do pedido</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Produto</th><th className="n">Qtd</th><th className="n">Unitário</th><th className="n">Total</th></tr></thead>
            <tbody>{order.lines.map((l) => <tr key={l.productId}><td>{l.productName}</td><td className="n">{l.quantity} {l.unit}</td><td className="n">{brl(l.unitCents)}</td><td className="n">{brl(l.totalCents)}</td></tr>)}</tbody>
            <tfoot>
              <tr><td colSpan={3}>Valor logístico (já engloba frete, seguro e despesas — a discriminação acima não é segundo lançamento)</td><td className="n">{brl(order.logisticsCents)}</td></tr>
              <tr><td colSpan={3}><b>Total do pedido</b></td><td className="n"><b>{brl(order.disbursementCents)}</b></td></tr>
            </tfoot>
          </table>
        </div>
      </details>
    </div>
  );
}
