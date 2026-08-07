import { montarConsulta, type DefinicaoConsulta } from "./consultas";

export const ENDPOINT_TJGO =
  "https://api-publica.datajud.cnj.br/api_publica_tjgo/_search";

export type ProcessoDataJud = {
  numeroProcesso: string;
  classe?: { codigo?: number; nome?: string };
  assuntos?: Array<{ codigo?: number; nome?: string }>;
  dataAjuizamento?: string;
  dataHoraUltimaAtualizacao?: string;
  valorCausa?: number;
  orgaoJulgador?: { nome?: string; codigoMunicipioIBGE?: number | string };
  movimentos?: Array<{ nome?: string; dataHora?: string }>;
  nivelSigilo?: number;
};

type RespostaES = {
  hits?: {
    hits?: Array<{ _id?: string; _source?: ProcessoDataJud; sort?: unknown[] }>;
  };
};

export class ErroDataJud extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroDataJud";
  }
}

export type OpcoesVarredura = {
  apiKey: string;
  endpoint?: string;
  desdeAjuizamento?: string;
  desdeAtualizacao?: string | null;
  /** Teto de páginas por categoria — evita varredura infinita num cron. */
  maxPaginas?: number;
  tamanhoPagina?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Varre uma categoria paginando com `search_after`.
 *
 * `search_after` e não `from`/`offset`: o Elasticsearch limita paginação
 * profunda por offset (index.max_result_window), e a varredura de um delta
 * diário pode passar disso numa categoria movimentada como execução.
 */
export async function varrerCategoria(
  def: DefinicaoConsulta,
  opcoes: OpcoesVarredura,
): Promise<ProcessoDataJud[]> {
  const http = opcoes.fetchImpl ?? fetch;
  const endpoint = opcoes.endpoint ?? ENDPOINT_TJGO;
  const maxPaginas = opcoes.maxPaginas ?? 10;
  const tamanho = opcoes.tamanhoPagina ?? 100;

  const coletados: ProcessoDataJud[] = [];
  let searchAfter: unknown[] | null = null;

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const corpo = montarConsulta(def, {
      tamanho,
      desdeAjuizamento: opcoes.desdeAjuizamento,
      desdeAtualizacao: opcoes.desdeAtualizacao,
      searchAfter,
    });

    const resposta = await http(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `APIKey ${opcoes.apiKey}`,
      },
      body: JSON.stringify(corpo),
    });

    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => "");
      throw new ErroDataJud(
        `DataJud respondeu ${resposta.status} em ${def.categoria}: ${texto.slice(0, 300)}`,
        resposta.status,
      );
    }

    const json = (await resposta.json()) as RespostaES;
    const hits = json.hits?.hits ?? [];
    if (hits.length === 0) break;

    for (const h of hits) {
      if (h._source?.numeroProcesso) coletados.push(h._source);
    }

    const ultimo = hits[hits.length - 1];
    if (!ultimo?.sort) break; // sem cursor não dá para continuar
    searchAfter = ultimo.sort;
    if (hits.length < tamanho) break; // última página
  }

  return coletados;
}

/** Município do órgão julgador, quando o DataJud preenche. */
export function comarcaDe(p: ProcessoDataJud): string | null {
  const nome = p.orgaoJulgador?.nome;
  if (!nome) return null;
  return nome.trim();
}

export function ehSigiloso(p: ProcessoDataJud): boolean {
  return typeof p.nivelSigilo === "number" && p.nivelSigilo > 0;
}

/** Achata o processo para a linha de `sinais_judiciais`. */
export function paraSinal(p: ProcessoDataJud, categoria: string) {
  return {
    fonte: "datajud_tjgo",
    numero_processo: p.numeroProcesso,
    classe: p.classe?.nome ?? null,
    assunto: p.assuntos?.map((a) => a.nome).filter(Boolean).join("; ") || null,
    data_ajuizamento: p.dataAjuizamento ? p.dataAjuizamento.slice(0, 10) : null,
    municipio: comarcaDe(p),
    comarca: comarcaDe(p),
    categoria,
    valor_causa: typeof p.valorCausa === "number" ? p.valorCausa : null,
    ultima_atualizacao: p.dataHoraUltimaAtualizacao ?? null,
    sigiloso: ehSigiloso(p),
    status_enriquecimento: ehSigiloso(p) ? "sigiloso" : "pendente",
    payload: p as unknown as Record<string, unknown>,
  };
}
