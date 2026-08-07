/**
 * Estágio 2 — tipificação de polo.
 *
 * O valor deste módulo é ser INDEPENDENTE da origem das partes. Venham elas do
 * DJEN, de uma consulta MNI com certificado, ou digitadas à mão pelo operador,
 * a lógica de "quem é construtora, quem é condomínio, que tese é essa" é a
 * mesma. Por isso ele não faz rede: recebe nomes, devolve tipificação.
 */

export type PoloParte = "ativo" | "passivo";

export type ParteBruta = {
  polo: PoloParte | null;
  nome: string;
};

export type ParteTipificada = ParteBruta & {
  tipo_pessoa: "fisica" | "juridica";
  eh_construtora: boolean;
  eh_condominio: boolean;
  construtora_id: number | null;
  /** Empreendimento inferido do nome da SPE, quando dá. */
  empreendimento_id: string | null;
};

export type Construtora = { id: number; nome: string; apelidos?: string[] | null };
export type EmpreendimentoRef = { id: string; nome: string };

export function normalizarNome(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Marcadores de pessoa jurídica no nome da parte. */
const MARCAS_PJ = [
  "LTDA", "S A", "SA", "EIRELI", "ME", "EPP", "SPE", "S/A",
  "INCORPORAD", "CONSTRUTORA", "EMPREENDIMENTO", "PARTICIPACOES",
  "IMOBILIARIA", "BANCO", "CONDOMINIO", "ASSOCIACAO", "COOPERATIVA",
  "CNPJ", "COMERCIO", "INDUSTRIA", "ADMINISTRADORA",
];

export function ehPessoaJuridica(nome: string): boolean {
  const n = normalizarNome(nome);
  return MARCAS_PJ.some((m) => new RegExp(`(^| )${m}( |$)`).test(n) || n.includes(m));
}

export function ehCondominio(nome: string): boolean {
  return normalizarNome(nome).includes("CONDOMINIO");
}

/** Tokens significativos do nome (descarta conectivos e siglas curtas). */
function tokens(nome: string): Set<string> {
  const RUIDO = new Set([
    "LTDA", "EIRELI", "EMPREENDIMENTOS", "EMPREENDIMENTO", "IMOBILIARIOS",
    "IMOBILIARIO", "INCORPORACOES", "INCORPORADORA", "PARTICIPACOES",
    "CONSTRUTORA", "RESIDENCIAL", "EDIFICIO", "CONDOMINIO", "SPE", "DOS",
    "DAS", "COM", "DE", "DA", "DO", "E",
  ]);
  return new Set(
    normalizarNome(nome)
      .split(" ")
      .filter((t) => t.length > 2 && !RUIDO.has(t)),
  );
}

export function tokensComuns(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n;
}

/**
 * Similaridade por tokens — barata e boa para nome de empresa.
 *
 * Descarta o ruído societário ANTES de comparar: sem isso, "X EMPREENDIMENTOS
 * LTDA" e "Y EMPREENDIMENTOS LTDA" pareceriam parecidíssimos por conta de
 * palavras que aparecem em toda razão social do ramo.
 */
export function similaridade(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return comuns / Math.min(ta.size, tb.size);
}

const SIM_CONSTRUTORA = 0.5;
const SIM_EMPREENDIMENTO = 0.5;

/**
 * Casa o nome da parte contra a watchlist. Testa o nome comercial e os
 * apelidos/SPEs — nos autos aparece a razão social, quase nunca a marca.
 */
export function casarConstrutora(
  nome: string,
  watchlist: Construtora[],
): Construtora | null {
  const n = normalizarNome(nome);
  let melhor: { c: Construtora; sim: number } | null = null;

  for (const c of watchlist) {
    const candidatos = [c.nome, ...(c.apelidos ?? [])];
    for (const cand of candidatos) {
      const alvo = normalizarNome(cand);
      // token inteiro: evita "SIM" casar dentro de "ASSIMILADO"
      const contem = new RegExp(`(^| )${alvo}( |$)`).test(n);
      const sim = contem ? 1 : similaridade(nome, cand);
      if (sim >= SIM_CONSTRUTORA && (!melhor || sim > melhor.sim)) {
        melhor = { c, sim };
      }
    }
  }
  return melhor?.c ?? null;
}

/**
 * SPEs costumam carregar o nome do empreendimento na razão social
 * ("SPE RESIDENCIAL ALPHA EMPREENDIMENTOS LTDA"). É o que permite ligar um
 * processo a uma unidade específica.
 */
export function inferirEmpreendimento(
  nome: string,
  empreendimentos: EmpreendimentoRef[],
): EmpreendimentoRef | null {
  let melhor: { e: EmpreendimentoRef; sim: number } | null = null;
  for (const e of empreendimentos) {
    const sim = similaridade(nome, e.nome);
    /*
     * Exige DOIS tokens em comum quando há material para isso. Um token só
     * gera falso positivo barato demais ("BANCO ALPHA" casaria com
     * "Residencial Alpha") e um falso positivo aqui vincula o processo ao
     * empreendimento errado — pior que não vincular.
     */
    const suficiente =
      tokensComuns(nome, e.nome) >= 2 ||
      (tokens(e.nome).size === 1 && sim >= 1);
    if (sim >= SIM_EMPREENDIMENTO && suficiente && (!melhor || sim > melhor.sim)) {
      melhor = { e, sim };
    }
  }
  return melhor?.e ?? null;
}

export function tipificarParte(
  parte: ParteBruta,
  watchlist: Construtora[],
  empreendimentos: EmpreendimentoRef[],
): ParteTipificada {
  const construtora = casarConstrutora(parte.nome, watchlist);
  const condominio = ehCondominio(parte.nome);
  const pj = ehPessoaJuridica(parte.nome) || Boolean(construtora) || condominio;

  /*
   * A watchlist nunca vai estar completa: cada empreendimento costuma ter a
   * própria SPE, e nos autos aparece a razão social, não a marca. Por isso uma
   * PJ cujo nome bate com um empreendimento cadastrado conta como construtora
   * mesmo sem estar na watchlist — é o que permite tipificar o polo sem
   * depender de curadoria manual perfeita.
   */
  const empreendimento =
    pj && !condominio ? inferirEmpreendimento(parte.nome, empreendimentos) : null;

  return {
    ...parte,
    tipo_pessoa: pj ? "juridica" : "fisica",
    eh_construtora: Boolean(construtora) || Boolean(empreendimento),
    eh_condominio: condominio,
    construtora_id: construtora?.id ?? null,
    empreendimento_id: empreendimento?.id ?? null,
  };
}

export type Tipificacao = {
  categoria: string;
  /** Por que a categoria foi decidida — vai no resumo do lead. */
  motivo: string;
  empreendimento_id: string | null;
  /** Parte que interessa abordar: o vendedor potencial. */
  pessoa_alvo: string | null;
};

/**
 * Refina a categoria da varredura agora que se sabe quem está em cada polo.
 *
 * É aqui que distrato_comprador e retomada_construtora finalmente se separam —
 * na varredura eles compartilham a mesma consulta porque a API pública do
 * DataJud não traz as partes.
 */
export function tipificarProcesso(
  categoriaVarredura: string,
  partes: ParteTipificada[],
): Tipificacao {
  const ativo = partes.filter((p) => p.polo === "ativo");
  const passivo = partes.filter((p) => p.polo === "passivo");

  const construtoraAtiva = ativo.find((p) => p.eh_construtora);
  const construtoraPassiva = passivo.find((p) => p.eh_construtora);
  const condominioAtivo = ativo.find((p) => p.eh_condominio);

  const primeiraPF = (lista: ParteTipificada[]) =>
    lista.find((p) => p.tipo_pessoa === "fisica")?.nome ?? null;

  if (condominioAtivo) {
    return {
      categoria: "execucao_condominial",
      motivo: `condomínio "${condominioAtivo.nome}" no polo ativo — distresse do proprietário`,
      empreendimento_id: null,
      pessoa_alvo: primeiraPF(passivo),
    };
  }

  if (construtoraAtiva) {
    return {
      categoria: "retomada_construtora",
      motivo:
        `construtora "${construtoraAtiva.nome}" no polo ATIVO — retomada por ` +
        "inadimplência: o réu perde a unidade, repasse é urgentíssimo",
      empreendimento_id: construtoraAtiva.empreendimento_id,
      pessoa_alvo: primeiraPF(passivo),
    };
  }

  if (construtoraPassiva) {
    return {
      categoria: "distrato_comprador",
      motivo:
        `construtora "${construtoraPassiva.nome}" no polo PASSIVO — comprador ` +
        "saindo do contrato; unidade volta ao estoque dela",
      empreendimento_id: construtoraPassiva.empreendimento_id,
      pessoa_alvo: primeiraPF(ativo),
    };
  }

  // Sem construtora nem condomínio identificados: mantém a categoria da
  // varredura e aponta a PF do polo que faz sentido abordar.
  const alvo =
    categoriaVarredura === "inventario" ? primeiraPF(ativo) : primeiraPF(passivo);

  return {
    categoria: categoriaVarredura,
    motivo: "nenhuma construtora ou condomínio identificado nas partes",
    empreendimento_id: null,
    pessoa_alvo: alvo,
  };
}
