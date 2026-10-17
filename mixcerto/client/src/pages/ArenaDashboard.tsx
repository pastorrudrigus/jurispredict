import { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, Boxes, Download, Flag, Gavel, Plus, Printer, Target, TrendingDown, Trophy, Truck, Wallet, Zap,
} from "lucide-react";
import type { ArenaView, Order, RankedProposal } from "../../../shared/competition";
import type { LogisticsTerms } from "../../../shared/contracts";
import { MODAL_LABEL } from "../../../shared/contracts";
import { brl, pct } from "../../../shared/money";
import { describeResponsibility } from "../../../shared/transport";
import { api, ApiFailure, download, errorText, go, hashParam, SUPPLIER_COLORS, toCsv } from "../api";
import { useAuth } from "../auth";
import { LogisticsForm } from "../components/LogisticsForm";
import { Alert, Empty, ErrorBox, Kpi, Modal, PageHead, useToast } from "../components/ui";

interface ArenaSummary { id: string; title: string; status: string; orderId: string | null }

const short = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
type Tab = "radar" | "evolucao" | "matriz" | "regras";

export default function ArenaDashboard() {
  const { can } = useAuth();
  const toast = useToast();
  const canAct = can("negociar");
  const [list, setList] = useState<ArenaSummary[]>([]);
  const [arena, setArena] = useState<ArenaView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("radar");
  const [freightFor, setFreightFor] = useState<RankedProposal | null>(null);
  const [bidSupplier, setBidSupplier] = useState("");
  const [bidPct, setBidPct] = useState(0);
  const [ack, setAck] = useState(false);
  const [order, setOrder] = useState<{ order: Order; replayed: boolean } | null>(null);

  const open = useCallback(async (id: string) => {
    const a = await api<ArenaView>("GET", `/arenas/${id}`);
    setArena(a);
    setOrder(null);
    setAck(false);
    if (a.orderId) setOrder({ order: await api<Order>("GET", `/pedidos/${a.orderId}`), replayed: true });
  }, []);

  useEffect(() => {
    api<ArenaSummary[]>("GET", "/arenas")
      .then(async (l) => {
        setList(l);
        const id = hashParam("id") ?? l[0]?.id;
        if (id) await open(id);
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoaded(true));
  }, [open]);

  useEffect(() => {
    if (!arena) return;
    const sel = arena.ranking.find((r) => r.supplierId === bidSupplier) ?? arena.ranking.find((r) => r.position === 2) ?? arena.ranking[0];
    if (sel && sel.supplierId !== bidSupplier) setBidSupplier(sel.supplierId);
    if (sel) setBidPct(Math.min(arena.params.maxReductionPct, sel.reductionPct + 0.5));
  }, [arena]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<ArenaView | void>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      const a = await fn();
      if (a) setArena(a);
      setList(await api<ArenaSummary[]>("GET", "/arenas"));
      if (success) toast(success);
    } catch (e) {
      setError(e instanceof ApiFailure ? `${e.message}` : String(e));
      if (e instanceof ApiFailure && e.code === "VERSION_CONFLICT" && arena) await open(arena.id);
    } finally {
      setBusy(false);
    }
  };

  const createArena = () => run(async () => {
    const a = await api<ArenaView>("POST", "/arenas", {});
    setOrder(null);
    setAck(false);
    history.replaceState(null, "", `#/arena?id=${a.id}`);
    return a;
  }, "Nova arena criada — a anterior foi preservada.");
  const simulate = () => run(() => api<ArenaView>("POST", `/arenas/${arena!.id}/rodadas`, { expectedVersion: arena!.version }), "Rodada simulada.");
  const close = () => run(() => api<ArenaView>("POST", `/arenas/${arena!.id}/encerrar`, { expectedVersion: arena!.version }), "Arena encerrada e vencedor selecionado.");
  const bid = () => run(() => api<ArenaView>("POST", `/arenas/${arena!.id}/lances`, {
    supplierId: bidSupplier, reductionPct: bidPct, expectedVersion: arena!.version,
  }), "Melhoria registrada.");
  const saveFreight = (supplierId: string, terms: LogisticsTerms) => run(async () => {
    const a = await api<ArenaView>("PUT", `/arenas/${arena!.id}/propostas/${supplierId}/logistica`, { terms, expectedVersion: arena!.version });
    setFreightFor(null);
    return a;
  }, "Condições logísticas atualizadas.");
  const makeOrder = () => run(async () => {
    const out = await api<{ order: Order; replayed: boolean }>("POST", `/arenas/${arena!.id}/pedido`, {
      expectedVersion: arena!.version, acknowledgeShortage: ack,
    });
    setOrder(out);
    return api<ArenaView>("GET", `/arenas/${arena!.id}`);
  }, "Pedido interno gerado.");

  if (!loaded) return <p className="muted">Carregando…</p>;

  if (!arena)
    return (
      <>
        <PageHead eyebrow="Arena de negociação" title="Competição com regras. Compra com critério." sub="Destino inicial Brasília/DF · cinco fornecedores fictícios competem pelo mesmo mix." />
        <ErrorBox error={error} onClose={() => setError(null)} />
        <div className="card">
          <Empty icon={<Gavel size={26} />} title="Abra espaço para a melhor proposta."
            text="Ative a competição para carregar o mix original de vinte produtos, comparar cinco vendedores e acompanhar cada melhoria de preço."
            action={canAct ? <button className="primary lg" disabled={busy} onClick={createArena}><Zap size={17} /> Ativar competição do mix</button> : <span className="pill neutral">Seu perfil é somente leitura</span>} />
        </div>
      </>
    );

  const apt = arena.ranking.filter((r) => r.position !== null);
  const leader = apt[0];
  const initial = arena.timeline[0];
  const initialBest = initial?.bestEconomicCents ?? null;
  const initialBestDisb = initial ? Math.min(...Object.values(initial.disbursement).filter((v): v is number => v !== null)) : null;
  const closed = arena.status === "encerrada";
  const used = arena.simulatedRoundsUsed;
  const roundsLeft = arena.params.maxRounds - used;
  const winner = closed ? arena.ranking.find((r) => r.supplierId === arena.closing!.winnerSupplierId) : null;
  const bidCurrent = arena.ranking.find((r) => r.supplierId === bidSupplier)?.reductionPct ?? 0;
  const maxEco = Math.max(...arena.ranking.map((r) => r.economicCents));
  const minEco = Math.min(...apt.map((r) => r.economicCents), maxEco);

  const radarData = arena.ranking.map((r) => ({
    name: r.supplierName,
    Mercadorias: r.merchandiseCents / 100,
    Frete: r.freightCents / 100,
    "Seguro e despesas": (r.insuranceCents + r.expensesCents) / 100,
  }));
  const evolution = arena.timeline.map((t) => {
    const row: Record<string, number | string | null> = { step: t.step === 0 ? "Inicial" : `#${t.step}`, label: t.label };
    for (const r of arena.ranking) row[r.supplierId] = t.economic[r.supplierId] !== null ? t.economic[r.supplierId]! / 100 : null;
    row.melhor = t.bestEconomicCents !== null ? t.bestEconomicCents / 100 : null;
    return row;
  });

  // Potencial teórico de dividir por item (diagnóstico; ignora fretes adicionais)
  const splitMerch = arena.matrix.reduce((s, m) => s + (m.bestUnitCents ?? 0) * m.quantity, 0);

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
      <PageHead
        eyebrow={`Arena de negociação · ${arena.id}`}
        title={arena.title}
        sub={<>Destino <b>{arena.params.destination.city}/{arena.params.destination.uf}</b> · versão {arena.version} · criada em {new Date(arena.createdAt).toLocaleString("pt-BR")} ·{" "}
          {closed ? <span className="pill neutral">encerrada</span> : <span className="pill ok">aberta</span>}</>}
        actions={<>
          {list.length > 1 && (
            <select value={arena.id} onChange={(e) => { history.replaceState(null, "", `#/arena?id=${e.target.value}`); open(e.target.value); }} aria-label="Arena">
              {list.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.title} — {a.status}{a.orderId ? ` · ${a.orderId}` : ""}</option>)}
            </select>
          )}
          <button onClick={() => exportScenario("csv")}><Download size={16} /> CSV</button>
          <button onClick={() => exportScenario("json")}><Download size={16} /> JSON</button>
          {canAct && <button className="primary" disabled={busy} onClick={createArena}><Plus size={16} /> Nova arena demonstrativa</button>}
        </>}
      />

      <ErrorBox error={error} onClose={() => setError(null)} />
      {arena.unavailable.length > 0 && (
        <Alert tone="warn">
          <b>{arena.basket.length} de {arena.basket.length + arena.unavailable.length} itens podem ser atendidos.</b>{" "}
          Indisponível: {arena.unavailable.map((u) => `${u.productName} (${u.quantity})`).join(", ")}. O item permanece explícito — não entra como economia.
        </Alert>
      )}
      {arena.basketDrift && !closed && (
        <Alert tone="bad">A cesta atendível mudou no catálogo (estoque, validade ou vida mínima). Encerrar será bloqueado: crie uma nova arena.</Alert>
      )}

      <div className="kpis">
        <Kpi label="Melhor custo econômico" icon={<Trophy size={17} />} value={leader ? brl(leader.economicCents) : "—"} hint={leader?.supplierName} />
        <Kpi label="Melhoria na negociação" icon={<TrendingDown size={17} />} tone={leader && initialBest !== null && initialBest > leader.economicCents ? "good" : undefined}
             value={leader && initialBest !== null ? brl(initialBest - leader.economicCents) : "—"}
             hint={leader && initialBestDisb !== null ? `desembolso: ${brl(initialBestDisb - leader.disbursementCents)} · mesma cesta` : undefined} />
        <Kpi label="Mix comparável" icon={<Boxes size={17} />} value={<>{arena.basket.length} <small>itens</small></>} hint={`${apt.length} de ${arena.ranking.length} propostas aptas`} />
        <Kpi label="Pressão competitiva" icon={<Target size={17} />} value={<>{used}<small>/{arena.params.maxRounds} rodadas</small></>} hint={`teto ${brl(arena.params.ceilingCents)} · prazo máx. ${arena.params.maxLeadTimeDays}d`} />
      </div>

      <div className="layout-side">
        <div style={{ minWidth: 0 }}>
          <div className="card">
            <div className="tabs" role="tablist">
              {([["radar", "Radar de propostas"], ["evolucao", "Evolução das rodadas"], ["matriz", "Matriz por item"], ["regras", "Regras do evento"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            {tab === "radar" && (
              <>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Composição do desembolso</div>
                <h3 style={{ fontSize: 17 }}>O menor preço precisa passar pela conta inteira.</h3>
                <div className="chart">
                  <ResponsiveContainer>
                    <BarChart data={radarData} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                      <YAxis tickFormatter={(v) => short(v * 100)} tick={{ fontSize: 12 }} width={80} />
                      <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} cursor={{ fill: "var(--surface-2)" }} />
                      <Legend />
                      <Bar dataKey="Mercadorias" stackId="a" fill="var(--merch)" />
                      <Bar dataKey="Frete" stackId="a" fill="var(--freight)" />
                      <Bar dataKey="Seguro e despesas" stackId="a" fill="var(--exp)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="small muted" style={{ margin: 0 }}>O gráfico mostra desembolso. O ranking usa custo econômico (desembolso a valor presente pelo prazo de pagamento). Tributos e créditos não entram na arena — use o laboratório fiscal.</p>
              </>
            )}
            {tab === "evolucao" && (
              <>
                <div className="chart">
                  <ResponsiveContainer>
                    <LineChart data={evolution} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="step" tick={{ fontSize: 12 }} />
                      <YAxis domain={["auto", "auto"]} tickFormatter={(v) => short(v * 100)} tick={{ fontSize: 12 }} width={80} />
                      <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} labelFormatter={(_l, p) => (p?.[0]?.payload?.label as string) ?? ""} />
                      <Legend />
                      {arena.ranking.filter((r) => r.apt).map((r) => (
                        <Line key={r.supplierId} dataKey={r.supplierId} name={r.supplierName} stroke={SUPPLIER_COLORS[r.supplierId]} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                      ))}
                      <Line dataKey="melhor" name="Melhor compra" stroke="var(--text)" strokeDasharray="5 4" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="small muted" style={{ margin: 0 }}>Custo econômico de cada proposta apta em cada alteração registrada; o orçamento inicial é preservado.</p>
              </>
            )}
            {tab === "matriz" && (
              <>
                <Alert tone="info">
                  Diagnóstico por item (preço unitário após a redução de cada fornecedor). A arena decide pela <b>cesta inteira</b>; dividir o pedido gera fretes e despesas adicionais não calculados aqui.
                  Melhor preço por item somaria {brl(splitMerch)} em mercadorias{leader ? <> contra {brl(leader.merchandiseCents)} do líder (diferença {brl(leader.merchandiseCents - splitMerch)})</> : null}.
                </Alert>
                <div className="table-wrap">
                  <table className="matrix">
                    <thead><tr><th>Produto</th><th className="n">Qtd</th>{arena.ranking.map((r) => <th key={r.supplierId} className="n"><span className="dot" style={{ background: SUPPLIER_COLORS[r.supplierId] }} />{r.supplierName.split(" ")[0]}</th>)}</tr></thead>
                    <tbody>
                      {arena.matrix.map((m) => (
                        <tr key={m.productId}>
                          <td>{m.productName}</td>
                          <td className="n">{m.quantity}</td>
                          {m.cells.map((c) => (
                            <td key={c.supplierId} className={`n ${c.supplierId === m.bestSupplierId ? "best" : ""} ${!c.ok ? "na" : ""}`} title={c.issue}>
                              {c.unitCents !== null ? brl(c.unitCents) : "—"}{!c.ok && " ⚠"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === "regras" && (
              <div className="grid g2">
                <div>
                  <h3>Como a compra é decidida</h3>
                  <ul className="tight">
                    <li>Ranking somente entre propostas <b>aptas</b>: cesta completa, logística válida, dentro do teto ({brl(arena.params.ceilingCents)}) e do prazo ({arena.params.maxLeadTimeDays} dias).</li>
                    <li>Ordem: custo econômico → desembolso → prazo → identificador estável.</li>
                    <li>Custo econômico = desembolso a valor presente pelo prazo de pagamento, taxa anual de {arena.params.annualRatePct}% (base 365).</li>
                    <li>Sem média entre produtos distintos e sem rebate futuro.</li>
                  </ul>
                </div>
                <div>
                  <h3>Regras do evento</h3>
                  <ul className="tight">
                    <li>Até {arena.params.maxRounds} rodadas simuladas: o desafiante apto mais próximo do líder melhora {arena.params.roundStepPct.toLocaleString("pt-BR")} p.p.</li>
                    <li>Melhoria manual acumulada até {arena.params.maxReductionPct}% da tabela inicial (piso hipotético de exequibilidade).</li>
                    <li>Toda alteração exige a versão atual; conflitos são rejeitados.</li>
                    <li>Encerrar revalida cesta e ofertas e bloqueia lances e fretes.</li>
                    <li>Pedido exige reconhecer a falta, revalida tudo e é único (idempotente).</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h2>Ranking das propostas</h2><span className="small muted">menor custo apto vence</span></div>
            <div className="rank-list">
              {arena.ranking.map((r) => {
                const isWinner = winner?.supplierId === r.supplierId;
                const width = maxEco > minEco ? 25 + (75 * (maxEco - r.economicCents)) / (maxEco - minEco) : 100;
                return (
                  <div key={r.supplierId} className={`rank-item ${r.position === 1 ? "lead" : ""} ${!r.apt ? "inapt" : ""}`}>
                    <div className="rank-pos">{r.position ?? "—"}</div>
                    <div className="cell">
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span className="dot" style={{ background: SUPPLIER_COLORS[r.supplierId], marginRight: 0 }} />
                        <b>{r.supplierName}</b>
                        {isWinner && <span className="pill lead"><Trophy size={12} /> vencedor</span>}
                        {!r.apt && <span className="pill bad">inapta</span>}
                      </div>
                      <div className="small muted">{r.origin.city}/{r.origin.uf} · {r.logistics.modals.map((m) => MODAL_LABEL[m]).join(" + ")} · {r.leadTimeDays}d · pgto {r.paymentTermDays}d</div>
                      {r.apt && <div className="bar-track"><div style={{ width: `${width}%`, background: SUPPLIER_COLORS[r.supplierId] }} /></div>}
                    </div>
                    <div className="cell hide-md"><div className="lbl">Mercadorias {r.reductionPct > 0 && <span style={{ color: "var(--ok)" }}>−{pct(r.reductionPct, 1)}</span>}</div><div className="val">{brl(r.merchandiseCents)}</div></div>
                    <div className="cell hide-md"><div className="lbl">Logística</div><div className="val">{r.freightAbsorbed && r.logisticsCents === 0 ? <span className="pill info">frete absorvido</span> : brl(r.logisticsCents)}</div></div>
                    <div className="cell"><div className="lbl">Desembolso</div><div className="val">{brl(r.disbursementCents)}</div></div>
                    <div className="cell"><div className="lbl">Custo econômico</div><div className="val" style={{ fontSize: 15 }}>{brl(r.economicCents)}</div></div>
                    <div className="cell">{canAct && !closed && <button className="link" onClick={() => setFreightFor(r)}><Truck size={14} /> Ajustar frete</button>}</div>
                    {!r.apt && <div className="reasons"><AlertTriangle size={12} /> {r.reasons.slice(0, 3).join(" · ")}{r.reasons.length > 3 ? "…" : ""}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid g2">
            <div className="card">
              <h2>Por que este líder?</h2>
              <ul className="tight">{arena.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
            <div className="card">
              <h2>Histórico de melhorias</h2>
              {!arena.rounds.length ? <p className="muted small">Nenhuma melhoria ainda. Use a central de rodadas.</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>Tipo</th><th>Fornecedor</th><th className="n">Redução</th><th>Líder depois</th></tr></thead>
                    <tbody>
                      {arena.rounds.map((r) => {
                        const nm = (id: string | null) => arena.ranking.find((x) => x.supplierId === id)?.supplierName ?? "—";
                        return <tr key={r.number}><td>{r.number}</td><td><span className={`pill ${r.kind === "manual" ? "info" : "neutral"}`}>{r.kind}</span></td><td>{nm(r.supplierId)}</td><td className="n">{pct(r.fromPct, 1)} → {pct(r.toPct, 1)}</td><td>{nm(r.leaderAfter)}{r.leaderAfter !== r.leaderBefore && " ↺"}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {closed && winner && (
            <div className="card">
              <div className="card-head"><h2><Trophy size={18} style={{ verticalAlign: -3 }} /> Vencedor selecionado: {winner.supplierName}</h2></div>
              <p className="sub">Desembolso {brl(arena.closing!.evaluation.disbursementCents)} · custo econômico {brl(arena.closing!.evaluation.economicCents)} · {describeResponsibility(winner.logistics)}.</p>
              {order ? <OrderSummary order={order.order} replayed={order.replayed} /> : <p className="muted small">Gere o pedido na central de rodadas ao lado.</p>}
            </div>
          )}
        </div>

        <aside className="round-panel no-print">
          <div className="eyebrow">Central de rodadas</div>
          <h3>Competição com regras.<br /><em>Compra com critério.</em></h3>
          <div className="steps">{Array.from({ length: arena.params.maxRounds }, (_, i) => <span key={i} className={i < used ? "done" : ""}>{i + 1}</span>)}</div>
          {!canAct ? (
            <p className="small">Seu perfil é <b>somente leitura</b>: você acompanha a arena, mas não envia lances nem gera pedidos.</p>
          ) : (
            <>
              <button className="lime block lg" disabled={busy || closed || roundsLeft <= 0} onClick={simulate}>
                <Zap size={17} /> {roundsLeft > 0 ? "Simular próxima rodada" : "Limite de rodadas atingido"}
              </button>
              <p className="small" style={{ margin: "8px 0 0" }}>Uma ação, uma nova proposta fictícia. A posição muda só quando o custo efetivo melhora.</p>
              <div className="sep" />
              <div className="eyebrow" style={{ fontSize: 10 }}>Vendedor que melhorará a oferta</div>
              <select style={{ margin: "8px 0 12px" }} value={bidSupplier} disabled={closed} onChange={(e) => {
                setBidSupplier(e.target.value);
                const cur = arena.ranking.find((r) => r.supplierId === e.target.value)?.reductionPct ?? 0;
                setBidPct(Math.min(arena.params.maxReductionPct, cur + 0.5));
              }} aria-label="Fornecedor">
                {arena.ranking.map((r) => <option key={r.supplierId} value={r.supplierId}>{r.supplierName}</option>)}
              </select>
              <div className="eyebrow" style={{ fontSize: 10 }}>Redução acumulada sobre a tabela inicial</div>
              <div className="pct-input" style={{ margin: "8px 0" }}>
                <input type="number" min={0} max={arena.params.maxReductionPct} step={0.1} value={bidPct} disabled={closed}
                       onChange={(e) => setBidPct(Math.max(0, Math.min(arena.params.maxReductionPct, Number(e.target.value))))} aria-label="Redução acumulada (%)" />%
              </div>
              <input type="range" min={0} max={arena.params.maxReductionPct} step={0.1} value={bidPct} disabled={closed} onChange={(e) => setBidPct(Number(e.target.value))} aria-label="Redução" />
              <p className="small" style={{ margin: "6px 0 10px" }}>Atual: {pct(bidCurrent, 1)} · piso hipotético de exequibilidade: {100 - arena.params.maxReductionPct}% da tabela.</p>
              <button className="block" disabled={busy || closed || bidPct <= bidCurrent} onClick={bid}><TrendingDown size={16} /> Enviar melhoria</button>
            </>
          )}
          <div className="sep" />
          <div className="kv"><span>Destino</span><span>{arena.params.destination.uf} · {arena.params.destination.city}</span></div>
          <div className="kv"><span>Teto de desembolso</span><span>{brl(arena.params.ceilingCents)}</span></div>
          <div className="kv"><span>Prazo máximo</span><span>{arena.params.maxLeadTimeDays} dias</span></div>
          <div className="kv"><span>Regra de seleção</span><span>Menor custo apto</span></div>
          {canAct && (
            <>
              <div className="sep" />
              {!closed ? (
                <button className="block" disabled={busy || !leader} onClick={close}><Flag size={16} /> Encerrar e selecionar</button>
              ) : !order ? (
                <>
                  {arena.unavailable.length > 0 && (
                    <label className="c small" style={{ alignItems: "flex-start", marginBottom: 10, color: "#fff" }}>
                      <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
                      <span>Reconheço que o pedido será parcial: {arena.unavailable.map((u) => u.productName).join(", ")} não será atendido.</span>
                    </label>
                  )}
                  <button className="lime block lg" disabled={busy} onClick={makeOrder}><Trophy size={17} /> Gerar pedido do vencedor</button>
                </>
              ) : (
                <button className="block" onClick={() => go(`/pedidos?id=${order.order.id}`)}><Wallet size={16} /> Ver pedido {order.order.id}</button>
              )}
            </>
          )}
          <p className="small" style={{ marginTop: 12, marginBottom: 0 }}>Nenhuma compra externa. Rebate futuro fora do ranking. Preços e estoque são sintéticos.</p>
        </aside>
      </div>

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
      <Alert tone="info">Altera a proposta persistida na arena. Frete absorvido não gera cobrança incremental; se o comprador paga transportadora ou retirada, o custo entra mesmo quando o vendedor não entrega. Seguro e despesas entram uma única vez.</Alert>
      <LogisticsForm value={t} onChange={setT} />
      <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={busy} onClick={() => onSave(t)}>Salvar condições</button>
      </div>
    </Modal>
  );
}

export function OrderSummary({ order, replayed }: { order: Order; replayed?: boolean }) {
  return (
    <div>
      <Alert tone="ok">
        Pedido interno <b>{order.id}</b> {replayed ? "(já existente — nenhuma duplicação)" : "criado"} para {order.supplierName}.
        {order.improvementVsInitialCents !== null && <> Melhoria nominal vs. melhor proposta inicial: <b>{brl(order.improvementVsInitialCents)}</b> (mesma cesta; valor sintético).</>}
      </Alert>
      <div className="kpis">
        <Kpi label="Mercadorias" value={brl(order.merchandiseCents)} hint={`${order.lines.length} itens · redução ${pct(order.reductionPct, 1)}`} />
        <Kpi label="Valor logístico" value={brl(order.logisticsCents)} hint={`frete ${brl(order.freightCents)} + seguro ${brl(order.insuranceCents)} + despesas ${brl(order.expensesCents)}`} />
        <Kpi label="Desembolso" value={brl(order.disbursementCents)} />
        <Kpi label="Custo econômico" value={brl(order.economicCents)} hint={`pagamento em ${order.logistics.paymentTermDays} dias`} />
      </div>
      <p className="small">
        {order.origin.city}/{order.origin.uf} → {order.destination.city}/{order.destination.uf} · {order.logistics.modals.map((m) => MODAL_LABEL[m]).join(" + ")} ·
        prazo {order.logistics.leadTimeDays}d · {describeResponsibility(order.logistics)}
      </p>
      {order.shortages.length > 0 && <p className="small" style={{ color: "var(--warn)" }}>Falta reconhecida: {order.shortages.map((s) => `${s.productName} (${s.quantity})`).join(", ")}.</p>}
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, margin: "8px 0" }}>Itens do pedido</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Produto</th><th className="n">Qtd</th><th className="n">Unitário</th><th className="n">Total</th></tr></thead>
            <tbody>{order.lines.map((l) => <tr key={l.productId}><td>{l.productName}</td><td className="n">{l.quantity} {l.unit}</td><td className="n">{brl(l.unitCents)}</td><td className="n">{brl(l.totalCents)}</td></tr>)}</tbody>
            <tfoot>
              <tr><td colSpan={3}>Mercadorias</td><td className="n">{brl(order.merchandiseCents)}</td></tr>
              <tr><td colSpan={3}>Valor logístico (já engloba frete, seguro e despesas — a discriminação não é segundo lançamento)</td><td className="n">{brl(order.logisticsCents)}</td></tr>
              <tr><td colSpan={3}>Total do pedido</td><td className="n">{brl(order.disbursementCents)}</td></tr>
            </tfoot>
          </table>
        </div>
      </details>
      <div className="row no-print" style={{ marginTop: 12 }}>
        <button onClick={() => window.print()}><Printer size={16} /> Imprimir / salvar PDF</button>
        <button onClick={() => download(`${order.id}.json`, JSON.stringify(order, null, 2))}><Download size={16} /> JSON</button>
      </div>
    </div>
  );
}
