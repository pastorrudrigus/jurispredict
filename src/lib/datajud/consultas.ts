/**
 * Estágio 1 do núcleo: varredura da API pública do DataJud (CNJ).
 *
 * A tese: o anúncio é o vendedor que JÁ decidiu vender — mercado visível, com
 * corrida entre corretores. O processo é o vendedor ANTES de anunciar. Chegar
 * antes do anúncio é a exclusividade.
 *
 * LIMITE CONHECIDO DA API: a base pública traz capa + movimentações, e NÃO
 * traz as partes. Por isso nenhuma consulta aqui filtra por polo — a
 * tipificação ativo/passivo (construtora autora vs. ré) só acontece no
 * Estágio 2, depois do enriquecedor extrair as partes.
 */

export const COMARCAS_ALVO = [
  "Goiânia",
  "Aparecida de Goiânia",
  "Senador Canedo",
] as const;

export const CATEGORIAS = [
  "distrato_comprador",
  "retomada_construtora",
  "execucao",
  "execucao_condominial",
  "inventario",
  "busca_apreensao",
  "leilao",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export type DefinicaoConsulta = {
  categoria: Categoria;
  descricao: string;
  /** Tese do lead — o que essa categoria significa para o operador. */
  tese: string;
  /** Cláusulas Elasticsearch que caracterizam a categoria. */
  clausulas: unknown[];
  /**
   * Categorias que só se distinguem no Estágio 2 (pelo polo das partes)
   * compartilham a mesma consulta. Aqui elas viram a mesma varredura e a
   * separação vem depois.
   */
  separadaNoEstagio2?: boolean;
};

const textoEm = (campos: string[], termos: string) => ({
  multi_match: { query: termos, fields: campos, operator: "or" },
});

const ASSUNTO_CLASSE = ["assuntos.nome", "classe.nome"];

export const CONSULTAS: DefinicaoConsulta[] = [
  {
    categoria: "distrato_comprador",
    descricao: "Rescisão/resolução de promessa de compra e venda",
    tese: "comprador saindo do contrato; unidade volta ao estoque da construtora",
    separadaNoEstagio2: true,
    clausulas: [
      textoEm(ASSUNTO_CLASSE, "rescisão resolução distrato"),
      textoEm(ASSUNTO_CLASSE, "promessa compra venda compromisso"),
    ],
  },
  {
    categoria: "retomada_construtora",
    descricao: "Mesma classe do distrato — separada pelo polo no Estágio 2",
    tese:
      "duplo lead: o réu vai perder a unidade (repasse urgentíssimo antes da perda) " +
      "e a unidade retomada vira estoque da construtora",
    separadaNoEstagio2: true,
    clausulas: [
      textoEm(ASSUNTO_CLASSE, "rescisão reintegração de posse inadimplência"),
      textoEm(ASSUNTO_CLASSE, "promessa compra venda compromisso"),
    ],
  },
  {
    categoria: "execucao",
    descricao: "Execução de título extrajudicial e cumprimento de sentença",
    tese: "devedor com pressão de liquidez → venda do imóvel próprio",
    clausulas: [
      textoEm(["classe.nome"], "execução título extrajudicial cumprimento de sentença"),
    ],
  },
  {
    categoria: "execucao_condominial",
    descricao: "Execução/cobrança com condomínio no polo ativo",
    tese: "sinal precoce de distresse do proprietário; público, abundante e ignorado",
    separadaNoEstagio2: true,
    clausulas: [
      textoEm(ASSUNTO_CLASSE, "cobrança execução despesas condominiais condomínio"),
    ],
  },
  {
    categoria: "inventario",
    descricao: "Inventário e arrolamento",
    tese: "herdeiros vendem; captação clássica",
    clausulas: [textoEm(["classe.nome"], "inventário arrolamento")],
  },
  {
    categoria: "busca_apreensao",
    descricao: "Busca e apreensão (alienação fiduciária)",
    tese: "distresse financeiro do réu",
    clausulas: [textoEm(["classe.nome"], "busca e apreensão")],
  },
  {
    categoria: "leilao",
    descricao: "Movimentações de hasta pública / leilão / praça",
    tese: "imóvel indo a leilão; deals abaixo de mercado",
    clausulas: [textoEm(["movimentos.nome"], "hasta leilão praça arrematação")],
  },
];

export const DESDE_PADRAO = "2023-01-01";

/**
 * Monta o corpo Elasticsearch de uma categoria.
 *
 * `desdeAtualizacao` faz o delta diário: sem ele a varredura repuxaria a base
 * inteira todo dia. Com ele, só o que mudou desde a última rodada.
 */
export function montarConsulta(
  def: DefinicaoConsulta,
  opcoes: {
    tamanho?: number;
    desdeAjuizamento?: string;
    desdeAtualizacao?: string | null;
    searchAfter?: unknown[] | null;
  } = {},
): Record<string, unknown> {
  const must: unknown[] = [
    ...def.clausulas,
    { range: { dataAjuizamento: { gte: opcoes.desdeAjuizamento ?? DESDE_PADRAO } } },
  ];

  if (opcoes.desdeAtualizacao) {
    must.push({
      range: { dataHoraUltimaAtualizacao: { gte: opcoes.desdeAtualizacao } },
    });
  }

  const corpo: Record<string, unknown> = {
    size: opcoes.tamanho ?? 100,
    query: { bool: { must } },
    // ordenação estável é o que permite paginar com search_after
    sort: [{ dataHoraUltimaAtualizacao: { order: "asc" } }, { _id: "asc" }],
  };

  if (opcoes.searchAfter) corpo.search_after = opcoes.searchAfter;
  return corpo;
}
