import type Anthropic from "@anthropic-ai/sdk";

export const MODELO_CLASSIFICADOR = "claude-sonnet-4-6";

export const TIPOS_OPORTUNIDADE = [
  "unidade_voltando_estoque",
  "vendedor_pressionado",
  "herdeiros_vendendo",
  "leilao_agendado",
] as const;
export type TipoOportunidade = (typeof TIPOS_OPORTUNIDADE)[number];

export type LeadJudicial = {
  tipo_oportunidade: TipoOportunidade | null;
  pessoa_alvo: string | null;
  score_oportunidade: number;
  resumo: string;
  proximo_passo: string;
};

const SYSTEM = `Você classifica processos judiciais do TJGO em oportunidades de captação
imobiliária em Goiânia. Responda APENAS com JSON válido, sem markdown:

{
  "tipo_oportunidade": "unidade_voltando_estoque|vendedor_pressionado|herdeiros_vendendo|leilao_agendado|null",
  "pessoa_alvo": string|null,
  "score_oportunidade": 0-100,
  "resumo": string,
  "proximo_passo": string
}

Definições:
- unidade_voltando_estoque: rescisão de promessa de compra e venda com
  CONSTRUTORA no polo passivo, ou reintegração de posse movida por
  construtora. A unidade volta ao estoque dela.
- vendedor_pressionado: execução, cumprimento de sentença, busca e apreensão
  ou execução condominial contra PESSOA FÍSICA. Pressão de liquidez tende a
  virar venda de imóvel.
- herdeiros_vendendo: inventário ou arrolamento.
- leilao_agendado: há movimentação de hasta pública, praça ou leilão.
- null quando o processo não caracteriza nenhuma das quatro.

Regras:
- pessoa_alvo: a parte que interessa abordar (o vendedor potencial), não a
  construtora nem o banco. Se as partes não vierem informadas, use null.
- score_oportunidade: quão perto de virar negócio. Leilão marcado e distrato
  com unidade identificada valem mais que execução genérica.
- resumo: no máximo 2 linhas, o que é e por que importa.
- proximo_passo: ação concreta para o operador, não conselho genérico.
- Nunca invente nome de pessoa, valor ou empreendimento que não esteja na
  entrada. Sem dado, use null.`;

export type EntradaClassificacao = {
  categoria: string;
  classe: string | null;
  assunto: string | null;
  comarca: string | null;
  valor_causa: number | null;
  data_ajuizamento: string | null;
  partes?: Array<{ polo: string | null; nome: string | null; eh_construtora?: boolean }>;
  movimentos?: string[];
};

export function montarEntrada(e: EntradaClassificacao): string {
  const linhas = [
    `Categoria da varredura: ${e.categoria}`,
    `Classe: ${e.classe ?? "—"}`,
    `Assunto: ${e.assunto ?? "—"}`,
    `Comarca/órgão: ${e.comarca ?? "—"}`,
    `Valor da causa: ${e.valor_causa ?? "—"}`,
    `Ajuizado em: ${e.data_ajuizamento ?? "—"}`,
  ];

  if (e.partes?.length) {
    linhas.push("Partes:");
    for (const p of e.partes) {
      linhas.push(
        `  - [${p.polo ?? "?"}] ${p.nome ?? "?"}${p.eh_construtora ? " (construtora da watchlist)" : ""}`,
      );
    }
  } else {
    linhas.push("Partes: NÃO DISPONÍVEIS (processo ainda não enriquecido)");
  }

  if (e.movimentos?.length) {
    linhas.push(`Movimentações recentes: ${e.movimentos.slice(0, 10).join("; ")}`);
  }

  return linhas.join("\n");
}

function parse(raw: string): unknown {
  let t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const i = t.indexOf("{");
    const f = t.lastIndexOf("}");
    if (i === -1 || f <= i) throw new Error(`Sem JSON na resposta: ${raw.slice(0, 200)}`);
    return JSON.parse(t.slice(i, f + 1));
  }
}

export function normalizarLead(bruto: unknown): LeadJudicial {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const tipo = TIPOS_OPORTUNIDADE.includes(o.tipo_oportunidade as never)
    ? (o.tipo_oportunidade as TipoOportunidade)
    : null;
  const score = Number(o.score_oportunidade);

  const txt = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  return {
    tipo_oportunidade: tipo,
    pessoa_alvo: txt(o.pessoa_alvo),
    score_oportunidade: Number.isFinite(score)
      ? Math.max(0, Math.min(100, Math.round(score)))
      : 0,
    resumo: txt(o.resumo) ?? "",
    proximo_passo: txt(o.proximo_passo) ?? "",
  };
}

export async function classificarProcesso(
  client: Anthropic,
  entrada: EntradaClassificacao,
): Promise<LeadJudicial> {
  const resposta = await client.messages.create({
    model: MODELO_CLASSIFICADOR,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: montarEntrada(entrada) }],
  });
  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") throw new Error("Resposta sem texto.");
  return normalizarLead(parse(bloco.text));
}
