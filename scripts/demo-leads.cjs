/**
 * Roda o motor INTEIRO com a API real e gera um HTML com os leads, para ver o
 * resultado antes de existir Supabase ou deploy.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npm run demo:leads
 *
 * ⚠️  As ENTRADAS são fictícias (anúncios e processos escritos para o teste).
 *     O que é real é o PROCESSAMENTO: extração, classificação de anunciante,
 *     tipificação de polo e classificação de oportunidade saem da IA/da lógica
 *     de verdade, não de mock.
 */
const fs = require("node:fs");
const Anthropic = require("@anthropic-ai/sdk").default ?? require("@anthropic-ai/sdk");

const { coletarDeExportWhatsApp } = require("../.tmp-cli/coletores/whatsapp.js");
const { extrairComCliente } = require("../.tmp-cli/extracao.js");
const { classeLead, aplicarBonusJanela } = require("../.tmp-cli/classe.js");
const { tipificarParte, tipificarProcesso } = require("../.tmp-cli/datajud/partes.js");
const { classificarProcesso } = require("../.tmp-cli/datajud/classificador.js");
const { pitchLista } = require("../.tmp-cli/pitch.js");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("\nANTHROPIC_API_KEY não definida.\n"); process.exit(1); }
const client = new Anthropic({ apiKey });

const WATCHLIST = [
  { id: 1, nome: "FGR", apelidos: ["FGR INCORPORACOES"] },
  { id: 2, nome: "Opus", apelidos: ["OPUS INCORPORADORA LTDA"] },
];
const EMPS = [
  { id: "e1", nome: "Residencial Exemplo Alpha", entrega: "2026-06-30" },
  { id: "e2", nome: "Jardim Exemplo Beta", entrega: "2027-12-31" },
];

// Processos FICTÍCIOS — números e nomes inventados para o teste.
const PROCESSOS = [
  { numero: "5000101-11.2026.8.09.0051", categoria: "distrato_comprador",
    classe: "Procedimento Comum Cível", assunto: "Rescisão do Contrato e Devolução do Dinheiro",
    comarca: "1ª Vara Cível de Goiânia", valor: 320000, data: "2026-02-10",
    partes: [{ polo: "ativo", nome: "Maria Exemplo da Silva" },
             { polo: "passivo", nome: "SPE RESIDENCIAL EXEMPLO ALPHA EMPREENDIMENTOS LTDA" }] },
  { numero: "5000202-22.2026.8.09.0051", categoria: "distrato_comprador",
    classe: "Reintegração / Manutenção de Posse", assunto: "Rescisão / Inadimplemento",
    comarca: "3ª Vara Cível de Goiânia", valor: 410000, data: "2026-04-02",
    partes: [{ polo: "ativo", nome: "JARDIM EXEMPLO BETA INCORPORACOES SPE LTDA" },
             { polo: "passivo", nome: "João Exemplo Pereira" }] },
  { numero: "5000303-33.2026.8.09.0051", categoria: "execucao",
    classe: "Execução de Título Extrajudicial", assunto: "Despesas Condominiais",
    comarca: "5ª Vara Cível de Goiânia", valor: 28000, data: "2026-05-20",
    partes: [{ polo: "ativo", nome: "CONDOMINIO EDIFICIO EXEMPLO" },
             { polo: "passivo", nome: "Ana Exemplo Souza" }] },
  { numero: "5000404-44.2026.8.09.0051", categoria: "inventario",
    classe: "Inventário", assunto: "Inventário e Partilha",
    comarca: "2ª Vara de Família e Sucessões de Goiânia", valor: 850000, data: "2026-01-15",
    partes: [{ polo: "ativo", nome: "Carlos Exemplo Lima" },
             { polo: "passivo", nome: "Espolio de Jose Exemplo Lima" }] },
  { numero: "5000505-55.2026.8.09.0051", categoria: "busca_apreensao",
    classe: "Busca e Apreensão em Alienação Fiduciária", assunto: "Alienação Fiduciária",
    comarca: "4ª Vara Cível de Goiânia", valor: 190000, data: "2026-06-01",
    partes: [{ polo: "ativo", nome: "BANCO EXEMPLO S/A" },
             { polo: "passivo", nome: "Pedro Exemplo Costa" }] },
];

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const brl = (v) => v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

(async () => {
  // ───────────────────────── anúncios ─────────────────────────
  const conteudo = fs.readFileSync("scripts/exemplo-grupo-whatsapp.txt", "utf8");
  const { candidatos, totalMensagens } = coletarDeExportWhatsApp(conteudo);

  const leads = [];
  for (const c of candidatos) {
    process.stdout.write(`anúncio: ${c.autor}… `);
    const e = await extrairComCliente(client, c.texto);
    const emp = EMPS.find((x) => e.empreendimento_texto &&
      x.nome.toLowerCase().includes(e.empreendimento_texto.toLowerCase().split(" ").pop() ?? "@"));
    const classe = classeLead(e);
    const naJanela = emp ? (new Date(emp.entrega) - Date.now()) / 2.6e9 <= 8 : false;
    const score = aplicarBonusJanela(e.score_urgencia, classe, naJanela);
    leads.push({ ...e, classe, score, naJanela, empreendimento: emp?.nome ?? null,
      autor: c.autor, enviadoEm: c.enviadoEm, texto: c.texto });
    console.log(`${classe} · ${score}`);
  }

  // ───────────────────────── judiciais ─────────────────────────
  const judiciais = [];
  for (const p of PROCESSOS) {
    process.stdout.write(`processo: ${p.numero}… `);
    const partes = p.partes.map((x) => tipificarParte(x, WATCHLIST, EMPS));
    const tip = tipificarProcesso(p.categoria, partes);
    const lead = await classificarProcesso(client, {
      categoria: tip.categoria, classe: p.classe, assunto: p.assunto,
      comarca: p.comarca, valor_causa: p.valor, data_ajuizamento: p.data,
      partes: partes.map((x) => ({ polo: x.polo, nome: x.nome, eh_construtora: x.eh_construtora })),
    });
    judiciais.push({ ...p, tip, partes, lead });
    console.log(`${tip.categoria} → ${lead.tipo_oportunidade} (${lead.score_oportunidade})`);
  }

  // ───────────────────────── html ─────────────────────────
  const badge = { A: "#34d399", B: "#a1a1aa", benchmark: "#c084fc" };
  const linhas = leads.sort((a, b) => b.score - a.score).map((l) => `
    <tr>
      <td><span class="cl" style="--c:${badge[l.classe]}">${l.classe === "benchmark" ? "BM" : l.classe}</span></td>
      <td><b>${esc(l.empreendimento ?? l.empreendimento_texto ?? "— não identificado")}</b>
          ${l.empreendimento ? `<div class="s">"${esc(l.empreendimento_texto)}"</div>` : ""}</td>
      <td>${esc(l.bairro ?? "—")}</td>
      <td>${esc(l.tipologia ?? "—")}${l.area_m2 ? ` · ${l.area_m2}m²` : ""}</td>
      <td class="n">${brl(l.valor_pedido)}</td>
      <td class="n dim">${brl(l.valor_pago)}</td>
      <td class="n">${l.valor_pago && l.valor_pedido ? ((l.valor_pedido - l.valor_pago) / l.valor_pago * 100).toFixed(0) + "%" : "—"}</td>
      <td class="c"><span class="sc" style="--c:${l.score >= 61 ? "#34d399" : l.score >= 31 ? "#fbbf24" : "#71717a"}">${l.score}</span>
          ${l.naJanela ? '<span class="jan">janela</span>' : ""}</td>
      <td class="s">${esc(l.anunciante_tipo)}<div class="dim">conf. ${l.anunciante_confianca}</div></td>
    </tr>`).join("");

  const cards = judiciais.map((j) => `
    <div class="card">
      <div class="row"><span class="tag">${esc(j.lead.tipo_oportunidade ?? "—")}</span>
        <span class="sc" style="--c:#38bdf8">${j.lead.score_oportunidade}</span></div>
      <div class="alvo">${esc(j.lead.pessoa_alvo ?? j.tip.pessoa_alvo ?? "parte não identificada")}</div>
      <div class="s">${esc(j.numero)} · ${esc(j.comarca)} · ${brl(j.valor)}</div>
      <p>${esc(j.lead.resumo)}</p>
      <p class="passo">→ ${esc(j.lead.proximo_passo)}</p>
      <div class="s dim">polo: ${esc(j.tip.motivo)}</div>
    </div>`).join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Radar Imob — leads gerados pelo motor</title><style>
*{box-sizing:border-box}body{margin:0;background:#0f1115;color:#d4d4d8;font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
.wrap{max-width:1300px;margin:0 auto;padding:24px}
h1{font-size:19px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 10px}
.aviso{border:1px solid #b45309;background:#78350f33;color:#fcd34d;padding:10px 12px;border-radius:8px;margin:12px 0 20px;font-size:13px}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.stat{border:1px solid #252a34;background:#171a21;border-radius:8px;padding:10px 14px}
.stat b{display:block;font-size:22px;color:#fafafa}.stat span{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#71717a}
table{width:100%;border-collapse:collapse;border:1px solid #252a34;background:#171a21;border-radius:8px;overflow:hidden}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#71717a;padding:8px 10px;border-bottom:1px solid #252a34}
td{padding:8px 10px;border-bottom:1px solid #252a3480;vertical-align:top}
.n{text-align:right;font-variant-numeric:tabular-nums}.c{text-align:center}.dim{color:#71717a}
.s{font-size:12px;color:#a1a1aa}
.cl,.sc{display:inline-block;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 15%,transparent);color:var(--c);border-radius:5px;padding:1px 7px;font-weight:700;font-size:12px}
.jan{display:block;margin-top:3px;font-size:10px;color:#38bdf8}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.card{border:1px solid #252a34;background:#171a21;border-radius:8px;padding:12px}
.card .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.tag{font-size:11px;color:#38bdf8;background:#38bdf81a;border:1px solid #38bdf855;border-radius:5px;padding:1px 6px}
.alvo{font-weight:600;color:#fafafa}.card p{margin:8px 0 0;font-size:13px}
.passo{color:#7dd3fc}pre{background:#0b0d11;border:1px solid #252a34;border-radius:8px;padding:12px;white-space:pre-wrap;font-size:12.5px;color:#d4d4d8}
</style></head><body><div class="wrap">
<h1>📡 Radar Imob Goiânia — saída real do motor</h1>
<div class="aviso"><b>Entradas fictícias, processamento real.</b> Os anúncios e processos abaixo foram
escritos para este teste — não são dados de mercado. O que saiu da IA de verdade: extração dos campos,
classificação do anunciante, tipificação de polo e classificação de oportunidade.</div>

<div class="stats">
  <div class="stat"><b>${totalMensagens}</b><span>mensagens no export</span></div>
  <div class="stat"><b>${candidatos.length}</b><span>viraram candidatos</span></div>
  <div class="stat"><b>${leads.filter((l) => l.classe === "A").length}</b><span>leads classe A</span></div>
  <div class="stat"><b>${leads.filter((l) => l.classe === "benchmark").length}</b><span>benchmark</span></div>
  <div class="stat"><b>${judiciais.length}</b><span>processos tipificados</span></div>
</div>

<h2>Painel de leads (anúncios)</h2>
<table><thead><tr><th>Classe</th><th>Empreendimento</th><th>Bairro</th><th>Tipologia</th>
<th class="n">Pedido</th><th class="n">Pago</th><th class="n">Δ%</th><th class="c">Urgência</th><th>Anunciante</th></tr></thead>
<tbody>${linhas}</tbody></table>

<h2>Radar Judicial — leads antes do anúncio</h2>
<div class="grid">${cards}</div>

<h2>Mensagem pronta para o corretor</h2>
<pre>${esc(pitchLista(leads.filter((l) => l.classe === "A").map((l) => ({
    ...l, id: "x", fonte: "whatsapp", status: "novo", criado_em: new Date().toISOString(),
    anunciado_em: l.enviadoEm, score_urgencia: l.score, empreendimentos: null,
  }))))}</pre>
</div></body></html>`;

  fs.writeFileSync("/tmp/radar-demo.html", html);
  console.log("\n→ /tmp/radar-demo.html\n");
})();
