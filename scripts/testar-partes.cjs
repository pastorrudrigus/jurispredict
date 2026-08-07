/**
 * Estágio 2 — tipificação de polo. É a lógica que separa distrato_comprador de
 * retomada_construtora, e ela decide TESES OPOSTAS a partir do mesmo processo:
 * construtora no polo passivo = unidade voltando ao estoque; no polo ativo = o
 * réu está prestes a perder a unidade. Errar o polo inverte o lead.
 *
 *   npm run partes:testar
 */
const {
  normalizarNome, ehPessoaJuridica, ehCondominio, casarConstrutora,
  inferirEmpreendimento, tipificarParte, tipificarProcesso,
} = require("../.tmp-cli/datajud/partes.js");

let falhas = 0;
const checa = (rotulo, ok, det) => {
  if (ok) console.log(`ok   ${rotulo}`);
  else { falhas++; console.log(`FALHOU  ${rotulo}${det ? ` — ${det}` : ""}`); }
};

const WATCHLIST = [
  { id: 1, nome: "FGR", apelidos: ["FGR INCORPORACOES", "FGR URBANISMO"] },
  { id: 2, nome: "Opus", apelidos: ["OPUS INCORPORADORA LTDA"] },
  { id: 3, nome: "Terral", apelidos: ["TERRAL EMPREENDIMENTOS IMOBILIARIOS"] },
];
const EMPS = [
  { id: "e1", nome: "Residencial Exemplo Alpha" },
  { id: "e2", nome: "Jardim Exemplo Beta" },
];

// ── normalização e detecção de tipo ─────────────────────────────────────────
checa("normaliza acento, caixa e pontuação",
  normalizarNome("Construtôra Exemplo S/A.") === "CONSTRUTORA EXEMPLO S A");
checa("detecta PJ por marcador societário", ehPessoaJuridica("EXEMPLO EMPREENDIMENTOS LTDA"));
checa("detecta PJ por SPE", ehPessoaJuridica("SPE RESIDENCIAL EXEMPLO ALPHA LTDA"));
checa("pessoa física não vira PJ", !ehPessoaJuridica("Maria Exemplo da Silva"));
checa("detecta condomínio", ehCondominio("CONDOMINIO EDIFICIO EXEMPLO"));

// ── watchlist ───────────────────────────────────────────────────────────────
checa("casa construtora pela razão social/SPE",
  casarConstrutora("OPUS INCORPORADORA LTDA", WATCHLIST)?.id === 2);
checa("casa construtora por token exato no meio do nome",
  casarConstrutora("FGR INCORPORACOES E PARTICIPACOES S/A", WATCHLIST)?.id === 1);
checa("NÃO casa por substring solta (evita falso positivo)",
  casarConstrutora("ASSIMILADO COMERCIO LTDA", WATCHLIST) === null,
  "'Sim' não pode casar dentro de outra palavra");
checa("pessoa física não casa com construtora",
  casarConstrutora("Maria Exemplo da Silva", WATCHLIST) === null);

// ── SPE -> empreendimento ───────────────────────────────────────────────────
checa("infere empreendimento pelo nome da SPE",
  inferirEmpreendimento("SPE RESIDENCIAL EXEMPLO ALPHA EMPREENDIMENTOS LTDA", EMPS)?.id === "e1");
checa("não infere empreendimento quando não há relação",
  inferirEmpreendimento("BANCO EXEMPLO S/A", EMPS) === null);

// ── tipificação de polo: as duas teses opostas ──────────────────────────────
const tip = (p) => tipificarParte(p, WATCHLIST, EMPS);

const distrato = tipificarProcesso("distrato_comprador", [
  tip({ polo: "ativo", nome: "Maria Exemplo da Silva" }),
  tip({ polo: "passivo", nome: "SPE RESIDENCIAL EXEMPLO ALPHA EMPREENDIMENTOS LTDA" }),
]);
checa("construtora no polo PASSIVO => distrato do comprador",
  distrato.categoria === "distrato_comprador", distrato.categoria);
checa("distrato: pessoa-alvo é o comprador (polo ativo)",
  distrato.pessoa_alvo === "Maria Exemplo da Silva", String(distrato.pessoa_alvo));

const retomada = tipificarProcesso("distrato_comprador", [
  tip({ polo: "ativo", nome: "SPE RESIDENCIAL EXEMPLO ALPHA EMPREENDIMENTOS LTDA" }),
  tip({ polo: "passivo", nome: "João Exemplo Pereira" }),
]);
checa("MESMA varredura, construtora no polo ATIVO => retomada",
  retomada.categoria === "retomada_construtora", retomada.categoria);
checa("retomada: pessoa-alvo é o réu prestes a perder a unidade",
  retomada.pessoa_alvo === "João Exemplo Pereira", String(retomada.pessoa_alvo));
checa("retomada infere o empreendimento pela SPE",
  retomada.empreendimento_id === "e1", String(retomada.empreendimento_id));

const condominial = tipificarProcesso("execucao", [
  tip({ polo: "ativo", nome: "CONDOMINIO EDIFICIO EXEMPLO" }),
  tip({ polo: "passivo", nome: "Ana Exemplo Souza" }),
]);
checa("condomínio no polo ativo => execução condominial",
  condominial.categoria === "execucao_condominial", condominial.categoria);
checa("condominial: alvo é o proprietário inadimplente",
  condominial.pessoa_alvo === "Ana Exemplo Souza");

const inventario = tipificarProcesso("inventario", [
  tip({ polo: "ativo", nome: "Carlos Exemplo Lima" }),
  tip({ polo: "passivo", nome: "Espolio de Jose Exemplo" }),
]);
checa("inventário: alvo é o herdeiro (polo ativo)",
  inventario.pessoa_alvo === "Carlos Exemplo Lima", String(inventario.pessoa_alvo));

const semNada = tipificarProcesso("execucao", [
  tip({ polo: "ativo", nome: "BANCO EXEMPLO S/A" }),
  tip({ polo: "passivo", nome: "Pedro Exemplo Costa" }),
]);
checa("sem construtora/condomínio mantém a categoria da varredura",
  semNada.categoria === "execucao");
checa("execução: alvo é o executado, não o banco",
  semNada.pessoa_alvo === "Pedro Exemplo Costa");

console.log(falhas === 0 ? "\n===== ESTÁGIO 2 (tipificação) OK =====\n" : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
