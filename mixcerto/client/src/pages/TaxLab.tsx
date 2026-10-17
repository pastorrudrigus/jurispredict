import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { UF } from "../../../shared/contracts";
import { brl } from "../../../shared/money";
import {
  creditExampleScenario, creditSensitivity, DEFAULT_ORIGINS, DEFAULT_SCENARIO, defaultInterstateRate, destRateFor,
  simulateTax, type OriginProfile, type Purpose, type Regime, type StMode, type TaxScenario,
} from "../../../shared/tax-simulator";
import { download, ORIGIN_COLORS, toCsv } from "../api";
import { PageHead } from "../components/ui";

const UFS: UF[] = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const r$ = (c: number) => (c / 100).toFixed(2);
const toC = (v: string) => Math.round(Number(v.replace(",", ".")) * 100) || 0;
const num = (v: string) => Number(v.replace(",", ".")) || 0;
const short = (v: number) => `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function TaxLab() {
  const [s, setS] = useState<TaxScenario>({ ...DEFAULT_SCENARIO, date: new Date().toISOString().slice(0, 10) });
  const [origins, setOrigins] = useState<OriginProfile[]>(DEFAULT_ORIGINS);
  const [sel, setSel] = useState(DEFAULT_ORIGINS[0].id);
  const [example, setExample] = useState(false);

  const results = useMemo(() => simulateTax(s, origins), [s, origins]);
  const sensitivity = useMemo(() => creditSensitivity(s, origins), [s, origins]);
  const o = origins.find((x) => x.id === sel)!;

  const setScenario = <K extends keyof TaxScenario>(k: K, v: TaxScenario[K]) => {
    const next = { ...s, [k]: v };
    if (k === "destinationUf" || k === "date") {
      // Recalcula as alíquotas de referência — continuam editáveis por origem.
      setOrigins((os) => os.map((x) => ({ ...x, ownIcmsRatePct: defaultInterstateRate(x.uf, next.destinationUf), destRatePct: destRateFor(next.destinationUf, next.date) })));
    }
    setS(next);
  };
  const setOrigin = <K extends keyof OriginProfile>(k: K, v: OriginProfile[K]) =>
    setOrigins((os) => os.map((x) => (x.id === sel ? { ...x, [k]: v } : x)));

  const runExample = () => {
    setS(creditExampleScenario(s));
    setExample(true);
  };
  const reset = () => {
    setS({ ...DEFAULT_SCENARIO, date: new Date().toISOString().slice(0, 10) });
    setOrigins(DEFAULT_ORIGINS);
    setExample(false);
  };

  const composition = results.map((r) => ({
    name: r.uf,
    Mercadoria: r.merchandiseCents / 100,
    Frete: r.freightChargedCents / 100,
    ST: r.stCents / 100,
    "Outros tributos": r.otherTaxesCents / 100,
    "VP crédito (redutor econômico)": -(r.creditPresentValueCents + r.buyerBenefitPresentValueCents) / 100,
  }));
  const sensData = sensitivity.map((row) => {
    const out: Record<string, number> = { usable: row.usable };
    for (const x of origins) out[x.uf] = row[x.id] / 100;
    return out;
  });

  const exportCsv = () =>
    download("cenario-tributario.csv", toCsv(results.map((r) => ({
      posicao: r.position, origem: r.uf, destino: s.destinationUf, data: s.date, produto: s.productName, ncm: s.ncm, cest: s.cest,
      quantidade: s.quantity, regime_comprador: s.buyerRegime, finalidade: s.purpose, mercadoria: r.merchandiseCents / 100,
      icms_incluido_parcela: r.icmsIncludedCents / 100, frete_cobrado: r.freightChargedCents / 100, st: r.stCents / 100,
      outros_tributos: r.otherTaxesCents / 100, desembolso: r.disbursementCents / 100, credito_condicionado: r.conditionalCreditCents / 100,
      vp_credito: r.creditPresentValueCents / 100, custo_economico: r.economicCents / 100, debito_saida_teorico: r.outputDebitCents / 100,
      saldo_teorico: r.theoreticalBalanceCents / 100, bloqueios: r.creditBlockReasons.join(" | "), notas: r.notes.join(" | "),
    }))), "text/csv");
  const exportJson = () => download("cenario-tributario.json", JSON.stringify({ scenario: s, origins, results }, null, 2));

  return (
    <>
      <PageHead eyebrow="Laboratório tributário" title="O crédito muda a conta?" sub="Planejamento por cenário, não por “estado universalmente melhor”. Mesmo produto, embalagem e quantidade; cinco origens hipotéticas." />

      <div className="alert info small">
        Perfis de origem, preços, alíquotas, MVA e benefícios são <b>hipóteses editáveis</b>, não uma base fiscal cadastrada nem lista de estados com benefícios comprovados.
        A experiência não certifica enquadramento nem direito de apropriação de crédito. Nenhuma marcação substitui validação documental ou profissional.
        CBS/IBS de teste de 2026 não são somados automaticamente ao ICMS.
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Cenário</h2>
          <div className="row">
            <button className="primary" onClick={runExample}>Exemplificar crédito fiscal</button>
            <button onClick={reset}>Restaurar hipóteses</button>
            <button onClick={exportCsv}>Exportar CSV</button>
            <button onClick={exportJson}>Exportar JSON</button>
          </div>
        </div>
        <div className="form">
          <label className="f">Destino
            <select value={s.destinationUf} onChange={(e) => setScenario("destinationUf", e.target.value as UF)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
          </label>
          <label className="f">Data da operação<input type="date" value={s.date} onChange={(e) => setScenario("date", e.target.value)} /></label>
          <label className="f">Produto<input value={s.productName} onChange={(e) => setScenario("productName", e.target.value)} /></label>
          <label className="f">NCM<input value={s.ncm} onChange={(e) => setScenario("ncm", e.target.value)} /></label>
          <label className="f">CEST<input value={s.cest} onChange={(e) => setScenario("cest", e.target.value)} /></label>
          <label className="f">Quantidade<input type="number" min={0} value={s.quantity} onChange={(e) => setScenario("quantity", Math.max(0, Math.round(num(e.target.value))))} /></label>
          <label className="f">Regime do comprador
            <select value={s.buyerRegime} onChange={(e) => setScenario("buyerRegime", e.target.value as Regime)}><option value="normal">Regime normal</option><option value="simples">Simples Nacional</option></select>
          </label>
          <label className="f">Finalidade
            <select value={s.purpose} onChange={(e) => setScenario("purpose", e.target.value as Purpose)}>
              <option value="revenda">Revenda</option><option value="uso_consumo">Uso e consumo</option><option value="industrializacao">Industrialização</option>
            </select>
          </label>
          <label className="f">Taxa anual (%)<input type="number" step="0.1" value={s.annualRatePct} onChange={(e) => setScenario("annualRatePct", num(e.target.value))} /></label>
          <label className="f">Realização do crédito (dias)<input type="number" min={0} value={s.creditRealizationDays} onChange={(e) => setScenario("creditRealizationDays", Math.max(0, Math.round(num(e.target.value))))} /></label>
          <label className="f">Preço de revenda unit. (R$)<input type="number" step="0.01" value={r$(s.resaleUnitCents)} onChange={(e) => setScenario("resaleUnitCents", toC(e.target.value))} /></label>
        </div>
        <label className="c" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={s.creditReviewOverride} onChange={(e) => setScenario("creditReviewOverride", e.target.checked)} />
          Hipótese de revisão específica (libera crédito bloqueado por padrão — Simples, uso/consumo, fornecedor do Simples)
        </label>
        {s.destinationUf === "DF" && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            DF: alíquota modal de 20% (Lei nº 7.326/2023; efeitos esclarecidos em 22/01/2024 pelo ADI nº 1/2024) usada como referência editável — não se aplica automaticamente a todo produto.
          </p>
        )}
      </div>

      {example && (
        <div className="alert ok small">
          <b>Exemplo de crédito fiscal:</b> revenda por contribuinte do regime normal. Veja como o crédito condicionado reduz o <i>custo econômico</i> (a valor presente) mas não o <i>desembolso</i>,
          e como o gráfico de sensibilidade muda o ranking conforme o percentual utilizável. O fornecedor do Simples segue bloqueado até uma hipótese de revisão.
        </div>
      )}

      <div className="card">
        <h2>Ranking por custo econômico</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Origem</th><th className="n">Mercadoria</th><th className="n">ICMS incluído (parcela)</th><th className="n">Frete</th>
                <th className="n">ST</th><th className="n">Outros</th><th className="n">Desembolso</th><th className="n">Crédito condicionado</th>
                <th className="n">VP crédito/benef.</th><th className="n">Custo econômico</th><th className="n">Débito saída</th><th className="n">Saldo teórico</th><th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.originId} className={r.originId === sel ? "selected" : ""} onClick={() => setSel(r.originId)} style={{ cursor: "pointer" }}>
                  <td>{r.position}</td>
                  <td><span className="dot" style={{ background: ORIGIN_COLORS[origins.findIndex((x) => x.id === r.originId)] }} />{r.uf}</td>
                  <td className="n">{brl(r.merchandiseCents)}</td>
                  <td className="n muted">({brl(r.icmsIncludedCents)})</td>
                  <td className="n">{r.freightChargedCents ? brl(r.freightChargedCents) : <span className="pill info">absorvido</span>}</td>
                  <td className="n">{brl(r.stCents)}</td>
                  <td className="n">{brl(r.otherTaxesCents)}</td>
                  <td className="n"><b>{brl(r.disbursementCents)}</b></td>
                  <td className="n">{r.creditBlocked ? <span className="pill bad" title={r.creditBlockReasons.join("; ")}>bloqueado</span> : brl(r.conditionalCreditCents)}</td>
                  <td className="n">−{brl(r.creditPresentValueCents + r.buyerBenefitPresentValueCents)}</td>
                  <td className="n"><b>{brl(r.economicCents)}</b></td>
                  <td className="n">{brl(r.outputDebitCents)}</td>
                  <td className="n">{brl(r.theoreticalBalanceCents)}</td>
                  <td className="wrap small">{[...r.creditBlockReasons, ...r.notes].join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          O ICMS próprio já está no preço e aparece como parcela, sem nova soma. Crédito não reduz o caixa: só reduz o custo econômico na hipótese de aproveitamento,
          descontado por taxa anual base 365. Débito de saída e saldo teórico ficam separados da compra. Clique numa linha para editar a origem.
        </p>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Composição por origem</h2>
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={composition} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--muted)" }} />
                <YAxis tickFormatter={short} tick={{ fontSize: 12, fill: "var(--muted)" }} width={80} />
                <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Mercadoria" stackId="a" fill="var(--merch)" />
                <Bar dataKey="Frete" stackId="a" fill="var(--freight)" />
                <Bar dataKey="ST" stackId="a" fill="var(--st)" />
                <Bar dataKey="Outros tributos" stackId="a" fill="var(--exp)" />
                <Bar dataKey="VP crédito (redutor econômico)" stackId="a" fill="var(--credit)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2>Sensibilidade ao crédito utilizável</h2>
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={sensData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="usable" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12, fill: "var(--muted)" }} />
                <YAxis domain={["auto", "auto"]} tickFormatter={short} tick={{ fontSize: 12, fill: "var(--muted)" }} width={80} />
                <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} labelFormatter={(l) => `Crédito utilizável: ${l}%`} />
                <Legend />
                {origins.map((x, i) => <Line key={x.id} dataKey={x.uf} stroke={ORIGIN_COLORS[i]} strokeWidth={2} dot />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Custo econômico de cada origem conforme o percentual do crédito aproveitado. Linhas planas = crédito bloqueado no cenário.</p>
        </div>
      </div>

      <div className="card">
        <h2>Parâmetros da origem selecionada — {o.label}</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          {origins.map((x) => <button key={x.id} className={x.id === sel ? "primary" : ""} onClick={() => setSel(x.id)}>{x.uf}</button>)}
        </div>
        <div className="form">
          <label className="f">Regime do vendedor
            <select value={o.sellerRegime} onChange={(e) => setOrigin("sellerRegime", e.target.value as Regime)}><option value="normal">Regime normal</option><option value="simples">Simples Nacional</option></select>
          </label>
          <label className="f">Preço unitário (R$)<input type="number" step="0.01" value={r$(o.unitPriceCents)} onChange={(e) => setOrigin("unitPriceCents", toC(e.target.value))} /></label>
          <label className="f">Frete
            <select value={o.freightMode} onChange={(e) => setOrigin("freightMode", e.target.value as OriginProfile["freightMode"])}><option value="cobrado">Cobrado do comprador</option><option value="absorvido">Absorvido pelo vendedor</option></select>
          </label>
          <label className="f">Valor do frete (R$)<input type="number" step="0.01" value={r$(o.freightCents)} onChange={(e) => setOrigin("freightCents", toC(e.target.value))} /></label>
          <label className="f">Alíquota própria (%)<input type="number" step="0.01" value={o.ownIcmsRatePct} onChange={(e) => setOrigin("ownIcmsRatePct", num(e.target.value))} /></label>
          <label className="f">Crédito utilizável (%)<input type="number" min={0} max={100} value={o.usableCreditPct} onChange={(e) => setOrigin("usableCreditPct", num(e.target.value))} /></label>
          <label className="f">Alíquota de destino (%)<input type="number" step="0.01" value={o.destRatePct} onChange={(e) => setOrigin("destRatePct", num(e.target.value))} /></label>
          <label className="f">MVA (%)<input type="number" step="0.01" value={o.mvaPct} onChange={(e) => setOrigin("mvaPct", num(e.target.value))} /></label>
          <label className="f">ST
            <select value={o.stMode} onChange={(e) => setOrigin("stMode", e.target.value as StMode)}>
              <option value="nenhuma">Sem ST</option><option value="informada">Informada</option><option value="calculada">Calculada (didática, MVA)</option>
            </select>
          </label>
          {o.stMode === "informada" && <label className="f">ST informada (R$)<input type="number" step="0.01" value={r$(o.stInformedCents)} onChange={(e) => setOrigin("stInformedCents", toC(e.target.value))} /></label>}
          <label className="f">Benefício ao comprador (R$)<input type="number" step="0.01" value={r$(o.buyerBenefitCents)} onChange={(e) => setOrigin("buyerBenefitCents", toC(e.target.value))} /></label>
          <label className="f">Outros tributos incrementais (R$)<input type="number" step="0.01" value={r$(o.otherTaxesCents)} onChange={(e) => setOrigin("otherTaxesCents", toC(e.target.value))} /></label>
          <label className="f">Benefício do vendedor (nota)<input value={o.sellerBenefitNote} onChange={(e) => setOrigin("sellerBenefitNote", e.target.value)} /></label>
        </div>
        <label className="c" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={o.resaleAlreadyStFinal} onChange={(e) => setOrigin("resaleAlreadyStFinal", e.target.checked)} />
          Revenda já está em ST final (não acrescentar ST novamente)
        </label>
        <p className="small muted" style={{ marginBottom: 0 }}>
          A ST calculada é uma fórmula didática — sem consulta a protocolos ou legislação por produto. Crédito ordinário de ST não é atribuído automaticamente.
          Benefício do vendedor é apenas informativo: não vira desconto nem crédito do comprador.
        </p>
      </div>

      <div className="card small">
        <h2>Fontes e limites</h2>
        <ul className="tight">
          <li>Lei Distrital nº 7.326/2023 — alíquota modal de 20% no DF; Ato Declaratório Interpretativo nº 1/2024 (efeitos em 22/01/2024). Consulte o SINJ-DF: <a href="https://www.sinj.df.gov.br" target="_blank" rel="noreferrer">sinj.df.gov.br</a>.</li>
          <li>Resolução do Senado Federal nº 22/1989 — alíquotas interestaduais de 7% e 12%.</li>
          <li>Convênio ICMS 142/2018 — regras gerais de ST (MVA, CEST); a fórmula aqui é apenas didática.</li>
          <li>Detalhes em <code>docs/tributacao-fontes-e-limites.md</code>.</li>
        </ul>
      </div>
    </>
  );
}
