import type Anthropic from "@anthropic-ai/sdk";
import type { Extracao } from "./types";

/**
 * Prompt e parsing da extração, SEM `server-only` de propósito: assim o mesmo
 * código roda na server action e no CLI (`npm run motor:testar`), sem risco de
 * as duas versões divergirem. Quem guarda a chave é quem constrói o client.
 */
export const MODELO_EXTRACAO = "claude-sonnet-4-6";

export const SYSTEM_PROMPT = `Você é um extrator de dados de anúncios imobiliários de REPASSE/CESSÃO DE
DIREITOS de imóveis na planta em Goiânia-GO. Responda APENAS com JSON
válido, sem markdown:

{
  "empreendimento_texto": string|null,
  "construtora": string|null,
  "bairro": string|null,
  "tipologia": string|null,
  "area_m2": number|null,
  "valor_pago": number|null,
  "valor_pedido": number|null,
  "saldo_devedor": number|null,
  "fase_obra_mencionada": string|null,
  "telefone_contato": string|null,
  "nome_contato": string|null,
  "sinais_urgencia": string[],
  "score_urgencia": 0-100,
  "eh_repasse": boolean
}

Regras:
- eh_repasse=true SOMENTE para cessão de direitos/repasse/ágio de imóvel na
  planta ou recém-entregue. Venda comum de usado = false.
- score_urgencia: 0-30 neutro; 31-60 sinais leves (aceita proposta,
  negociável); 61-100 sinais fortes (urgente, viagem, abaixo do valor pago,
  entrega chegando).
- "80 mil" -> 80000. Telefone: só dígitos com DDD.
- Nunca invente dados ausentes: use null.`;

/** Remove cercas de markdown e sobras de texto ao redor do JSON. */
export function parseJsonDefensivo(raw: string): unknown {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const inicio = t.indexOf("{");
    const fim = t.lastIndexOf("}");
    if (inicio === -1 || fim <= inicio) {
      throw new Error(`Resposta da IA não continha JSON: ${raw.slice(0, 200)}`);
    }
    return JSON.parse(t.slice(inicio, fim + 1));
  }
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function normalizarExtracao(bruto: unknown): Extracao {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const telefone = texto(o.telefone_contato)?.replace(/\D/g, "") ?? null;
  const score = numero(o.score_urgencia) ?? 0;

  return {
    empreendimento_texto: texto(o.empreendimento_texto),
    construtora: texto(o.construtora),
    bairro: texto(o.bairro),
    tipologia: texto(o.tipologia),
    area_m2: numero(o.area_m2),
    valor_pago: numero(o.valor_pago),
    valor_pedido: numero(o.valor_pedido),
    saldo_devedor: numero(o.saldo_devedor),
    fase_obra_mencionada: texto(o.fase_obra_mencionada),
    telefone_contato: telefone && telefone.length >= 10 ? telefone : null,
    nome_contato: texto(o.nome_contato),
    sinais_urgencia: Array.isArray(o.sinais_urgencia)
      ? o.sinais_urgencia.filter((s): s is string => typeof s === "string" && s.trim() !== "")
      : [],
    score_urgencia: Math.max(0, Math.min(100, Math.round(score))),
    eh_repasse: o.eh_repasse === true,
  };
}

/** Extrai um anúncio usando um client já construído pelo chamador. */
export async function extrairComCliente(
  client: Anthropic,
  textoBruto: string,
): Promise<Extracao> {
  const resposta = await client.messages.create({
    model: MODELO_EXTRACAO,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: textoBruto }],
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") {
    throw new Error("Resposta da IA sem bloco de texto.");
  }

  return normalizarExtracao(parseJsonDefensivo(bloco.text));
}
