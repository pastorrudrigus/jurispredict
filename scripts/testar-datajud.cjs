/**
 * Exercita o Estágio 1 (varredura DataJud) sem tocar na API real: injeta um
 * `fetch` de mentira que devolve páginas Elasticsearch sintéticas.
 *
 * Valida o que é código nosso e pode quebrar: forma da consulta, paginação por
 * search_after, corte do delta, e o mapeamento processo -> linha de
 * sinais_judiciais (inclusive sigiloso).
 *
 *   npm run datajud:testar
 */
const { CONSULTAS, montarConsulta, CATEGORIAS } = require("../.tmp-cli/datajud/consultas.js");
const { varrerCategoria, paraSinal, ehSigiloso } = require("../.tmp-cli/datajud/cliente.js");

let falhas = 0;
function checa(rotulo, ok, detalhe) {
  if (ok) console.log(`ok   ${rotulo}`);
  else { falhas++; console.log(`FALHOU  ${rotulo}${detalhe ? ` — ${detalhe}` : ""}`); }
}

// ── forma da consulta ───────────────────────────────────────────────────────
const def = CONSULTAS.find((c) => c.categoria === "distrato_comprador");

const semDelta = montarConsulta(def, {});
checa("consulta sem delta não manda dataHoraUltimaAtualizacao",
  !JSON.stringify(semDelta).includes("dataHoraUltimaAtualizacao\":{\"gte"));
checa("consulta sempre filtra dataAjuizamento >= 2023-01-01",
  JSON.stringify(semDelta).includes("2023-01-01"));
checa("consulta ordena para permitir search_after",
  Array.isArray(semDelta.sort) && semDelta.sort.length === 2);

const comDelta = montarConsulta(def, { desdeAtualizacao: "2026-08-01T00:00:00Z" });
checa("delta entra como range de última atualização",
  JSON.stringify(comDelta).includes("2026-08-01T00:00:00Z"));

checa("as 7 categorias do spec estão cobertas",
  CATEGORIAS.length === 7 && CONSULTAS.length === 7,
  `categorias=${CATEGORIAS.length} consultas=${CONSULTAS.length}`);
checa("distrato e retomada compartilham varredura (polo só no Estágio 2)",
  CONSULTAS.filter((c) => c.separadaNoEstagio2).length >= 3);

// ── paginação ───────────────────────────────────────────────────────────────
function processo(i, extra = {}) {
  return {
    numeroProcesso: `500${String(i).padStart(4, "0")}-11.2026.8.09.0051`,
    classe: { nome: "Procedimento Comum Cível" },
    assuntos: [{ nome: "Rescisão do Contrato e Devolução do Dinheiro" }],
    dataAjuizamento: "2026-03-11T00:00:00.000Z",
    dataHoraUltimaAtualizacao: `2026-08-0${(i % 7) + 1}T10:00:00.000Z`,
    valorCausa: 250000,
    orgaoJulgador: { nome: "1ª Vara Cível de Goiânia", codigoMunicipioIBGE: 5208707 },
    ...extra,
  };
}

function fetchFalso(paginas) {
  let chamada = 0;
  const corposRecebidos = [];
  const impl = async (_url, init) => {
    corposRecebidos.push(JSON.parse(init.body));
    const pagina = paginas[chamada++] ?? [];
    return {
      ok: true,
      json: async () => ({
        hits: { hits: pagina.map((p, i) => ({ _id: p.numeroProcesso, _source: p, sort: [p.dataHoraUltimaAtualizacao, String(i)] })) },
      }),
    };
  };
  impl.corpos = corposRecebidos;
  return impl;
}

(async () => {
  // duas páginas cheias (tamanho 3) + uma parcial => para sozinho
  const p1 = [processo(1), processo(2), processo(3)];
  const p2 = [processo(4), processo(5), processo(6)];
  const p3 = [processo(7)];
  const impl = fetchFalso([p1, p2, p3]);

  const todos = await varrerCategoria(def, {
    apiKey: "fake", tamanhoPagina: 3, maxPaginas: 10, fetchImpl: impl,
  });
  checa("pagina até a página parcial e junta tudo", todos.length === 7, `veio ${todos.length}`);
  checa("2ª requisição já leva search_after",
    impl.corpos[1] && Array.isArray(impl.corpos[1].search_after));
  checa("não faz requisição extra depois da página parcial",
    impl.corpos.length === 3, `fez ${impl.corpos.length}`);

  // teto de páginas respeitado
  const infinito = fetchFalso(Array.from({ length: 20 }, () => [processo(1), processo(2)]));
  const limitado = await varrerCategoria(def, {
    apiKey: "fake", tamanhoPagina: 2, maxPaginas: 4, fetchImpl: infinito,
  });
  checa("teto de páginas corta a varredura", limitado.length === 8, `veio ${limitado.length}`);

  // erro HTTP vira ErroDataJud com status
  const quebrado = async () => ({ ok: false, status: 429, text: async () => "rate limit" });
  let pegou = null;
  try {
    await varrerCategoria(def, { apiKey: "fake", fetchImpl: quebrado });
  } catch (e) { pegou = e; }
  checa("erro HTTP vira ErroDataJud com status", pegou && pegou.status === 429);

  // ── mapeamento para sinais_judiciais ──────────────────────────────────────
  const sinal = paraSinal(processo(1), "distrato_comprador");
  checa("mapeia número, classe, assunto e comarca",
    sinal.numero_processo.startsWith("500") &&
    sinal.classe === "Procedimento Comum Cível" &&
    sinal.assunto.includes("Rescisão") &&
    sinal.comarca === "1ª Vara Cível de Goiânia");
  checa("data de ajuizamento vira DATE", sinal.data_ajuizamento === "2026-03-11");
  checa("categoria e valor da causa preservados",
    sinal.categoria === "distrato_comprador" && sinal.valor_causa === 250000);
  checa("processo público entra na fila de enriquecimento",
    sinal.status_enriquecimento === "pendente" && sinal.sigiloso === false);

  const sigiloso = paraSinal(processo(2, { nivelSigilo: 1 }), "inventario");
  checa("processo sigiloso é marcado e sai da fila",
    ehSigiloso({ nivelSigilo: 1 }) &&
    sigiloso.sigiloso === true &&
    sigiloso.status_enriquecimento === "sigiloso");

  console.log(falhas === 0 ? "\n===== ESTÁGIO 1 OK =====\n" : `\n${falhas} FALHA(S)\n`);
  process.exit(falhas === 0 ? 0 : 1);
})();
